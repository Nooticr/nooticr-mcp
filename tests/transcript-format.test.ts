/**
 * `get_post_transcript`'s `format` argument (nooticr-server#119).
 *
 * The caption file is built by the backend from the transcript's own cue
 * timing; this surface only has to carry the argument through and hand the
 * file back untouched. A zod field the handler never forwards is the bug class
 * CLAUDE.md warns about - accepted by the schema, silently dropped - so this
 * drives the real registered tool and checks what reaches the backend.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { MemoryWatchStore } from "../src/shared/watchlist.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

type Row = Record<string, unknown>;

async function connect(reply: (args: Row) => Row) {
  const calls: Array<{ name: string; args: Row }> = [];
  const nooticr = {
    me: async () => ({ id: "u1" }),
    callTool: async (name: string, args: Row) => {
      calls.push({ name, args });
      return { contentBlocks: [], structured: reply(args) };
    },
  } as unknown as NooticrClient;
  const client = new Client({ name: "test", version: "1.0.0" }, { capabilities: {} });
  const server = createMcpServer(async () => nooticr, { watchStore: new MemoryWatchStore() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  return { client, calls };
}

const SRT = "1\n00:00:00,000 --> 00:00:01,500\nBloom first\n\n";

describe("get_post_transcript format", () => {
  it("forwards format and returns the caption file the backend built", async () => {
    const { client, calls } = await connect((args) => ({
      available: true,
      transcript: "Bloom first",
      cues: [{ startMs: 0, endMs: 1500, offset: 0 }],
      ...(args.format === "srt"
        ? { captionFile: { format: "srt", mimeType: "application/x-subrip", filename: "transcript.srt", cueCount: 1, truncated: false, content: SRT } }
        : {}),
    }));
    const res = await client.callTool({
      name: "get_post_transcript",
      arguments: { url: "https://www.tiktok.com/@a/video/1", format: "srt" },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].args.format).toBe("srt");
    const file = (res.structuredContent as Row).captionFile as Row;
    expect(file.content).toBe(SRT);
    expect(file.format).toBe("srt");
  });

  it("leaves the default call exactly as it was", async () => {
    const { client, calls } = await connect(() => ({ available: true, transcript: "hi" }));
    await client.callTool({
      name: "get_post_transcript",
      arguments: { url: "https://www.tiktok.com/@a/video/1" },
    });
    expect(calls[0].args).not.toHaveProperty("format");
  });

  it("refuses a format the backend cannot write", async () => {
    const { client, calls } = await connect(() => ({ available: true }));
    const res = await client.callTool({
      name: "get_post_transcript",
      arguments: { url: "https://www.tiktok.com/@a/video/1", format: "docx" },
    });
    expect(res.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });
});
