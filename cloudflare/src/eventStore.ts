/**
 * Durable-Object-backed MCP event store (SSE resumability).
 *
 * ## Why this exists
 *
 * Deploying a new Worker version restarts every Durable Object and tears down
 * every in-flight request and SSE stream. That disconnect is not preventable —
 * it is how Cloudflare rolls out code. What *is* preventable is losing the
 * conversation because of it.
 *
 * The MCP Streamable HTTP spec has a resume path: the server tags each SSE
 * event with an id, and a client that loses the stream reconnects with
 * `Last-Event-ID` to receive everything it missed. The SDK implements the
 * protocol side of that, but only when it is given an `eventStore` — without
 * one, resumption is silently inert and a dropped stream means a dropped
 * result. With nooticr's 20–70s tool calls, a deploy landing mid-call would
 * otherwise surface to the user as a hard failure.
 *
 * Events live in the session's own DO SQLite storage, so they survive both DO
 * eviction and a code deployment.
 */
import type {
  EventStore,
  EventId,
  StreamId,
} from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

/** Keep replay history bounded — a deploy-gap replay only needs recent events. */
const MAX_EVENTS_PER_STREAM = 512;
/** Drop anything older than this regardless of count. */
const MAX_EVENT_AGE_MS = 30 * 60 * 1000;

/** `<streamId>:<seq>` — the seq is per stream and strictly increasing. */
function encodeEventId(streamId: StreamId, seq: number): EventId {
  return `${streamId}:${seq}`;
}

function decodeEventId(
  eventId: EventId
): { streamId: StreamId; seq: number } | undefined {
  const idx = eventId.lastIndexOf(":");
  if (idx <= 0) return undefined;
  const streamId = eventId.slice(0, idx);
  const seq = Number(eventId.slice(idx + 1));
  if (!streamId || !Number.isFinite(seq)) return undefined;
  return { streamId, seq };
}

export class DurableObjectEventStore implements EventStore {
  private sql: SqlStorage;
  private ready = false;

  constructor(sql: SqlStorage) {
    this.sql = sql;
  }

  private init() {
    if (this.ready) return;
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS mcp_events (
         stream_id  TEXT    NOT NULL,
         seq        INTEGER NOT NULL,
         message    TEXT    NOT NULL,
         created_at INTEGER NOT NULL,
         PRIMARY KEY (stream_id, seq)
       )`
    );
    this.ready = true;
  }

  async storeEvent(
    streamId: StreamId,
    message: JSONRPCMessage
  ): Promise<EventId> {
    this.init();
    // Per-stream monotonic sequence. The DO is single-threaded, so a
    // read-then-write here cannot interleave with another writer.
    const row = this.sql
      .exec<{ next: number }>(
        `SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM mcp_events WHERE stream_id = ?`,
        streamId
      )
      .one();
    const seq = Number(row.next);
    this.sql.exec(
      `INSERT INTO mcp_events (stream_id, seq, message, created_at) VALUES (?, ?, ?, ?)`,
      streamId,
      seq,
      JSON.stringify(message),
      Date.now()
    );
    this.prune(streamId);
    return encodeEventId(streamId, seq);
  }

  async getStreamIdForEventId(eventId: EventId): Promise<StreamId | undefined> {
    return decodeEventId(eventId)?.streamId;
  }

  async replayEventsAfter(
    lastEventId: EventId,
    { send }: { send: (eventId: EventId, message: JSONRPCMessage) => Promise<void> }
  ): Promise<StreamId> {
    this.init();
    const decoded = decodeEventId(lastEventId);
    if (!decoded) return "";
    const { streamId, seq } = decoded;
    const rows = this.sql
      .exec<{ seq: number; message: string }>(
        `SELECT seq, message FROM mcp_events
          WHERE stream_id = ? AND seq > ?
          ORDER BY seq ASC`,
        streamId,
        seq
      )
      .toArray();
    for (const row of rows) {
      let message: JSONRPCMessage;
      try {
        message = JSON.parse(row.message) as JSONRPCMessage;
      } catch {
        continue; // A corrupt row must not abort the whole replay.
      }
      await send(encodeEventId(streamId, Number(row.seq)), message);
    }
    return streamId;
  }

  /** Bound storage: trim by age, then by count. */
  private prune(streamId: StreamId) {
    this.sql.exec(
      `DELETE FROM mcp_events WHERE created_at < ?`,
      Date.now() - MAX_EVENT_AGE_MS
    );
    this.sql.exec(
      `DELETE FROM mcp_events
        WHERE stream_id = ?
          AND seq <= (
            SELECT COALESCE(MAX(seq), 0) - ? FROM mcp_events WHERE stream_id = ?
          )`,
      streamId,
      MAX_EVENTS_PER_STREAM,
      streamId
    );
  }
}
