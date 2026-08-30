import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { DurableObjectEventStore } from "./eventStore.js";

// The SDK's WebStandard transport consumes the platform `fetch` Request type.
// CF workers' `Request` is a generic instantiation of the same interface, but
// they disagree on the Cf second type arg, so we need a stable alias for the
// SDK flavor when passing through `handleRequest`.
type McpRequest = Parameters<
  WebStandardStreamableHTTPServerTransport["handleRequest"]
>[0];
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { OrchynClient, jwtExpiry, type TokenProvider } from "../../src/shared/orchyn.js";
import { createMcpServer, MCP_SERVER_VERSION } from "../../src/shared/tools.js";
import {
  verifyToken,
  validMcpToken,
  updateSessionTokens,
  deleteSession,
  type McpSession,
  SCOPES,
} from "./oauth.js";

/**
 * Protocol version advertised during re-init. Must be >= 2025-11-25 so the
 * SDK sends proper priming events and supports resumability. ChatGPT sends
 * the latest protocol version and may reject responses that don't match.
 */
const PROTOCOL_VERSION = "2025-11-25";

/** Refresh the orchyn JWT before it expires. The backend mints 15-minute
 * access tokens, so without renewal every login dies a quarter of an hour in
 * and the user must re-authorize. We renew proactively (decoding the JWT's
 * `exp`) and again whenever the API rejects with 401, persisting the rotated
 * tokens back into the MCP session in KV. */
const REFRESH_LEAD_MS = 60_000;

/**
 * Builds a client for one MCP session. The shared `OrchynClient` gets a
 * `TokenProvider` that resolves the session's orchyn token from this closure,
 * refreshes it (proactively before expiry and again on 401), and persists the
 * rotated tokens into the KV session so the next tool call uses a live token.
 * Pre-provisioned deployments (env.ORCHYN_ACCESS_TOKEN) get a static-token
 * provider and never refresh.
 */
async function makeClientForSession(
  env: Env,
  mcpToken: string,
  session: McpSession | undefined,
  idempotencyKey?: string
): Promise<OrchynClient> {
  const staticToken = env.ORCHYN_ACCESS_TOKEN;
  if (!session) {
    return new OrchynClient(env.ORCHYN_BASE_URL, {
      getAccessToken: async () => staticToken ?? "",
    });
  }

  let accessToken = session.orchynAccessToken;
  let refreshToken = session.orchynRefreshToken;

  const doRefresh = async (): Promise<boolean> => {
    if (!refreshToken) return false;
    try {
      const renewed = await OrchynClient.refreshSession(env.ORCHYN_BASE_URL, refreshToken);
      accessToken = renewed.accessToken;
      refreshToken = renewed.refreshToken ?? refreshToken;
      const user = renewed.user
        ? { id: renewed.user.id, email: renewed.user.email, displayName: renewed.user.displayName }
        : undefined;
      await updateSessionTokens(env, mcpToken, accessToken, refreshToken, user);
      return true;
    } catch {
      // Dead refresh token — there is no way to renew. Drop the MCP session so
      // the *next* request fails with a clean 401 from the session layer (the
      // client re-authorizes) instead of silently sending an expired access
      // token to the orchyn backend forever.
      await deleteSession(env, mcpToken).catch(() => {});
      return false;
    }
  };

  const provider: TokenProvider = {
    getAccessToken: async () => accessToken,
    onUnauthorized: doRefresh,
  };

  // Proactively refresh an expired/near-expiry access token before calling.
  const exp = jwtExpiry(accessToken);
  if (refreshToken && exp !== undefined && exp * 1000 < Date.now() + REFRESH_LEAD_MS) {
    await doRefresh();
  }

  return new OrchynClient(env.ORCHYN_BASE_URL, provider, idempotencyKey);
}

/**
 * MCP endpoint for the orchyn-mcp Cloudflare Worker.
 *
 * Session handling lives on a Durable Object (one per `mcp-session-id`) so the
 * MCP `initialize` ↔ handleRequest state is kept per client. Cloudflare may
 * evict a DO's in-memory JS state while idle; when that happens a brand-new
 * transport is built per fetch. That is fine — this DO keeps the MCP server
 * "always initialized" by re-running the initialize handshake internally on a
 * cold start before dispatching the client's request, so a client's next call
 * (tools/list, tools/call) works instead of returning
 * `400 "Server not initialized"`.
 */
export class McpEndpoint {
  private ctx: DurableObjectState;
  private env: Env;
  private transport?: WebStandardStreamableHTTPServerTransport;
  private server?: ReturnType<typeof createMcpServer>;
  /** Track whether the transport has completed its initialize handshake.
   *  The SDK's `_initialized` is private — we maintain our own flag via
   *  the `onsessioninitialized` callback. */
  private initialized = false;
  /** Single-flight guard for the cold-start handshake (see reInitialize). */
  private initializing?: Promise<void>;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  private async ensureServer() {
    if (this.transport && this.server) return;
    this.transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => this.ctx.id.name ?? this.ctx.id.toString(),
      // enableJsonResponse: true buffers the entire response before sending.
      // For long-running tools (20-70s), ChatGPT's client times out waiting.
      // Default (false) streams via SSE, which ChatGPT handles correctly.
      onsessioninitialized: () => {
        this.initialized = true;
        void this.ctx.storage.put("mcp:initialized", true);
        console.log(`[mcp] session initialized for DO ${this.ctx.id.name}`);
      },
      // Resumability. Deploying a new Worker version restarts every Durable
      // Object and kills in-flight SSE streams — that much is unavoidable.
      // With an event store the client reconnects with `Last-Event-ID` and is
      // sent everything it missed, so a deploy landing in the middle of a
      // 20-70s tool call resumes instead of surfacing as a failure.
      eventStore: new DurableObjectEventStore(this.ctx.storage.sql),
      // Tell clients how soon to come back after a dropped stream. Without an
      // explicit value each client picks its own, and some do not retry at all.
      retryInterval: 1000,
      // Keep idle streams warm so intermediaries do not cull them.
      keepAliveMs: 15000,
    });
    this.server = createMcpServer(async (ctx) => {
      const t = ctx.authInfo?.token ?? "";
      const s = await verifyToken(this.env, t);
      // Scope the client's JSON-RPC id to this session so two clients that
      // both number their requests from 1 cannot share a billing key.
      const key =
        ctx.requestId === undefined
          ? undefined
          : `${this.ctx.id.name ?? this.ctx.id.toString()}:${String(ctx.requestId)}`;
      return makeClientForSession(this.env, t, s, key);
    });
    await this.server.connect(this.transport);
  }

  async fetch(request: Request): Promise<Response> {
    // Drain the body FIRST, before any early return. A response sent while
    // the request stream is still unread abandons that stream, and the
    // runtime treats it as a fatal error — an unauthenticated POST was enough
    // to take the whole worker down.
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const bodyText = hasBody ? await request.text().catch(() => "") : "";

    const token = bearerToken(request);
    const session = token ? await verifyToken(this.env, token) : undefined;
    if (!token || !(await validMcpToken(this.env, token))) {
      // RFC 9728 / MCP authorization: point the client at the metadata that
      // tells it where to authenticate, so a connector can discover the flow
      // from a bare 401 instead of needing it configured out of band.
      return jsonResponse(
        401,
        {
          error: "Unauthorized",
          error_description:
            "This MCP server requires OAuth authentication. Fetch an access token from " +
            `${this.env.PUBLIC_URL}/authorize first.`,
        },
        {
          "www-authenticate":
            `Bearer realm="orchyn-mcp", ` +
            `resource_metadata="${this.env.PUBLIC_URL}/.well-known/oauth-protected-resource"`,
        }
      );
    }

    await this.ensureServer();
    const transport = this.transport!;

    const authInfo: AuthInfo | undefined = token
      ? {
          token,
          clientId: session?.clientId ?? "orchyn-mcp",
          scopes: session?.scopes ?? [...SCOPES],
          expiresAt: session
            ? Math.floor(session.expiresAt / 1000)
            : Math.floor(Date.now() / 1000) + 3600,
        }
      : undefined;

    // Read the body ONCE and rebuild the request from it.
    //
    // Cloning the request and reading the clone races the transport's own
    // read of the original: the transport answers a tool call with a
    // long-lived SSE stream, so the response is already on the wire while the
    // clone's body is still being drained, and the runtime kills that with
    // "Can't read from request stream after response has been sent". Handing
    // the transport a fresh Request built from text we already hold means
    // only one reader ever touches the stream.
    const workRequest = (
      hasBody
        ? new Request(request.url, {
            method: request.method,
            headers: request.headers,
            body: bodyText,
          })
        : request
    ) as unknown as McpRequest;

    const method = request.headers.get("mcp-method") ?? sniffMethod(bodyText);
    const methodLabel = method || "unknown";
    console.log(
      `[mcp] ${request.method} method=${methodLabel} len=${bodyText.length} initialized=${this.initialized}`
    );

    if (method === "initialize") {
      const res = await this.wrapHandle(transport, workRequest, authInfo);
      console.log(`[mcp] initialize → ${res.status}`);
      return res;
    }

    // Replay of a tool call we already answered — see replayToolCall.
    if (method === "tools/call") {
      const cached = await this.replayToolCall(bodyText);
      if (cached) return cached;
    }

    // Non-initialize on a cold transport: re-run the initialize handshake so
    // the SDK accepts subsequent requests instead of answering 404 "Session
    // not found" — which clients read as "session gone, re-authenticate".
    //
    // Single-flighted: after a deploy a client typically replays its open GET
    // stream and a queued POST at once. Both would pass the `!initialized`
    // check (the await below yields) and race two handshakes down the same
    // transport, so the second one errors and the client drops the session.
    if (!this.initialized) {
      if (!this.initializing) {
        console.log("[mcp] re-initializing transport (cold DO)");
        this.initializing = this.reInitialize(transport, authInfo).finally(() => {
          this.initializing = undefined;
        });
      }
      await this.initializing;
    }

    let res = await this.wrapHandle(transport, workRequest, authInfo);
    console.log(
      `[mcp] ${methodLabel} → ${res.status} ct=${res.headers.get("content-type") ?? "?"}`
    );
    // NOTE: never `res.clone().text()` here. Tool responses are SSE streams
    // that stay open for the length of the call (20-70s); cloning one buffers
    // the whole stream, applies backpressure to the live branch, and finishes
    // reading long after the response was sent — the exact shape of the
    // "Can't read from request stream after response has been sent" crash.
    if (methodLabel === "tools/call") {
      res = this.recordToolCall(bodyText, res);
    }
    return res;
  }

  /**
   * Idempotency for tool calls.
   *
   * A deploy (or any dropped stream) mid-`tools/call` leaves the client with
   * no answer, so it retries the same JSON-RPC id. The call is not free: the
   * orchyn API has already debited MCP credits and done the work. Replaying it
   * would charge a second time for a result the user never saw.
   *
   * So the answer is recorded against the request id and replayed verbatim on
   * a retry. Entries are scoped to this session's DO and expire quickly — long
   * enough to cover a redeploy and a client retry, not long enough to make a
   * genuinely repeated call look like a duplicate.
   */
  private static readonly TOOL_CACHE_TTL_MS = 10 * 60 * 1000;

  private toolCacheReady = false;

  private ensureToolCache() {
    if (this.toolCacheReady) return;
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS mcp_tool_results (
         req_key    TEXT PRIMARY KEY,
         body       TEXT NOT NULL,
         status     INTEGER NOT NULL,
         created_at INTEGER NOT NULL
       )`
    );
    this.toolCacheReady = true;
  }

  /** Return the stored answer for this request id, if we already have one. */
  private async replayToolCall(bodyText: string): Promise<Response | undefined> {
    const key = requestKey(bodyText);
    if (!key) return undefined;
    this.ensureToolCache();
    this.ctx.storage.sql.exec(
      `DELETE FROM mcp_tool_results WHERE created_at < ?`,
      Date.now() - McpEndpoint.TOOL_CACHE_TTL_MS
    );
    const rows = this.ctx.storage.sql
      .exec<{ body: string; status: number }>(
        `SELECT body, status FROM mcp_tool_results WHERE req_key = ?`,
        key
      )
      .toArray();
    if (!rows.length) return undefined;
    console.log(`[mcp] replaying cached tools/call for ${key} (no re-charge)`);
    return new Response(rows[0].body, {
      status: Number(rows[0].status),
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        "mcp-session-id": this.ctx.id.name ?? this.ctx.id.toString(),
      },
    });
  }

  /**
   * Tee the tool response: the client keeps its live stream, and the copy is
   * stored so a retry of the same request id can be answered without paying
   * for the work twice.
   *
   * Only the tee is buffered — the branch handed back to the client is passed
   * straight through, so this adds no latency and applies no backpressure to
   * the live stream.
   */
  private recordToolCall(bodyText: string, res: Response): Response {
    const key = requestKey(bodyText);
    if (!key || !res.body || res.status >= 500) return res;
    const [live, copy] = res.body.tee();
    this.ctx.waitUntil(
      (async () => {
        try {
          const buffered = await new Response(copy).text();
          if (!buffered) return;
          this.ensureToolCache();
          this.ctx.storage.sql.exec(
            `INSERT OR REPLACE INTO mcp_tool_results (req_key, body, status, created_at)
             VALUES (?, ?, ?, ?)`,
            key,
            buffered,
            res.status,
            Date.now()
          );
        } catch (err) {
          // Losing the cache entry only costs a re-charge on retry; never let
          // it take down the response the client is already reading.
          console.log(`[mcp] tool result cache write failed: ${String(err)}`);
        }
      })()
    );
    return new Response(live, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  }

  /**
   * Re-run the MCP initialize + initialized handshake so a cold
   * (post-eviction) transport accepts non-initialize requests.
   */
  private async reInitialize(
    transport: WebStandardStreamableHTTPServerTransport,
    authInfo: AuthInfo | undefined
  ) {
    const sessionId = this.ctx.id.name ?? this.ctx.id.toString();
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-session-id": sessionId,
      "mcp-protocol-version": PROTOCOL_VERSION,
    };
    // 1. Send initialize
    const initReq = new Request("https://mcp.orchyn.com/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "orchyn-mcp", version: MCP_SERVER_VERSION },
        },
      }),
    }) as unknown as McpRequest;
    const initRes = await transport.handleRequest(initReq, { authInfo });
    // Consume the response body so the stream is released
    await initRes.text().catch(() => "");

    // 2. Send initialized notification (required by the protocol)
    const notifReq = new Request("https://mcp.orchyn.com/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    }) as unknown as McpRequest;
    const notifRes = await transport.handleRequest(notifReq, { authInfo });
    await notifRes.text().catch(() => "");
    console.log("[mcp] re-initialization complete");
  }

  private async wrapHandle(
    transport: WebStandardStreamableHTTPServerTransport,
    request: McpRequest,
    authInfo: AuthInfo | undefined
  ): Promise<Response> {
    const start = Date.now();
    try {
      const res = await transport.handleRequest(request, { authInfo });
      const elapsed = Date.now() - start;
      console.log(`[mcp] wrapHandle took ${elapsed}ms → status=${res.status} ct=${res.headers.get("content-type") ?? "?"}`);
      return res;
    } catch (err) {
      const elapsed = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack?.substring(0, 300) : "";
      console.error(`[mcp] wrapHandle ERROR after ${elapsed}ms: ${msg} ${stack}`);
      return jsonResponse(500, {
        jsonrpc: "2.0",
        error: { code: -32603, message: `Internal error: ${msg}` },
        id: null,
      });
    }
  }
}

/** Sniffs the JSON-RPC `method` from a request body without consuming it. */
/** JSON-RPC method name from an already-read body. Pure — reads no stream. */
function sniffMethod(bodyText: string): string {
  if (!bodyText) return "";
  try {
    const parsed = JSON.parse(bodyText);
    const messages = Array.isArray(parsed) ? parsed : [parsed];
    for (const m of messages) {
      if (m && typeof m.method === "string") return m.method;
    }
  } catch {
    return "";
  }
  return "";
}

/** JSON-RPC `id` of a single request body, as a stable string key. */
/**
 * Key-order-independent rendering of a value.
 *
 * A client retrying a call may serialise the same arguments with the keys in
 * another order; that is still the same call and must still replay.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

/** FNV-1a, so the key stays short whatever the arguments weigh. */
function digest(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16);
}

export function requestKey(bodyText: string): string | undefined {
  if (!bodyText) return undefined;
  try {
    const parsed = JSON.parse(bodyText);
    if (Array.isArray(parsed)) return undefined; // batches are not deduped
    const id = parsed?.id;
    if (id === undefined || id === null) return undefined; // a notification
    const name = parsed?.params?.name;
    // The arguments belong in the key. Without them two different calls that
    // happen to share a JSON-RPC id collide, and clients reuse ids freely
    // across a session: searching a niche on TikTok and then asking for the
    // same on Instagram replayed the TikTok answer verbatim.
    const args = digest(stableStringify(parsed?.params?.arguments ?? null));
    return `${typeof id}:${String(id)}:${String(name ?? "")}:${args}`;
  } catch {
    return undefined;
  }
}

function bearerToken(request: Request): string | undefined {
  const header = request.headers.get("authorization");
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : undefined;
}

function jsonResponse(
  status: number,
  body: unknown,
  extra: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "Cache-Control": "no-store", ...extra },
  });
}
