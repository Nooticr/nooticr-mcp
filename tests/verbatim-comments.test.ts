/**
 * #98 through the real tools: verbatim reaches the text channel, and is never
 * sent upstream (the backend's get_post_comments does not take it).
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { MemoryWatchStore } from "../src/shared/watchlist.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

type Row = Record<string, unknown>;
const long = "word ".repeat(300).trim();

async function connect() {
  const calls: Array<{ name: string; args: Row }> = [];
  const nooticr = {
    me: async () => ({ id: "u1" }),
    callTool: async (name: string, args: Row) => {
      calls.push({ name, args });
      return {
        contentBlocks: [],
        structured: { platform: "reddit", comments: Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, text: long, author: `u${i}` })) },
      };
    },
  } as unknown as NooticrClient;
  const client = new Client({ name: "test", version: "1.0.0" }, { capabilities: {} });
  const server = createMcpServer(async () => nooticr, { watchStore: new MemoryWatchStore() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  return { client, calls };
}

const text = (r: unknown) => String((r as { content: Array<{ text: string }> }).content[0].text);

describe("analyze_comments verbatim", () => {
  it("by default clips, and says to call again with verbatim: true", async () => {
    const { client } = await connect();
    const out = text(await client.callTool({ name: "analyze_comments", arguments: { url: "https://reddit.com/r/x/comments/1" } }));
    expect(out).toMatch(/call analyze_comments again with the same url and verbatim: true/);
  });

  it("with verbatim renders all thirty whole, and does not send the flag upstream", async () => {
    const { client, calls } = await connect();
    const out = text(await client.callTool({ name: "analyze_comments", arguments: { url: "https://reddit.com/r/x/comments/1", verbatim: true } }));
    expect(out.split(long).length - 1).toBe(30);
    expect(out).not.toMatch(/shortened/);
    expect(calls[0].args).not.toHaveProperty("verbatim");
  });
});
