/**
 * #104: the GA4, Search Console and PostHog reads, as stored syncs that say
 * when they were synced in both channels.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { MemoryWatchStore } from "../src/shared/watchlist.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

type Row = Record<string, unknown>;
const TOOLS = ["get_google_analytics", "get_search_console_data", "get_posthog_analytics"];

async function connect(reply: Row) {
  const calls: Array<{ name: string; args: Row }> = [];
  const nooticr = {
    me: async () => ({ id: "u1" }),
    callTool: async (name: string, args: Row) => {
      calls.push({ name, args });
      return { contentBlocks: [], structured: reply };
    },
  } as unknown as NooticrClient;
  const client = new Client({ name: "test", version: "1.0.0" }, { capabilities: {} });
  const server = createMcpServer(async () => nooticr, { watchStore: new MemoryWatchStore() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  return { client, calls };
}

describe("connector reads", () => {
  it("are registered free, read-only, closed-world, and say they are not live", async () => {
    const { client } = await connect({});
    const tools = (await client.listTools()).tools;
    for (const n of TOOLS) {
      const t = tools.find((x) => x.name === n)!;
      expect(t, n).toBeDefined();
      expect(t.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
      expect(t.description).toMatch(/not a live/);
      expect(t.description).toMatch(/No cost to call/);
    }
  });

  it("pass appId through and put the sync time in the text", async () => {
    const { client, calls } = await connect({ clicks: 412, impressions: 18950, topQueries: ["a"], synced_at: "2026-09-22T06:00:00Z", appName: "Acme" });
    const res = (await client.callTool({ name: "get_search_console_data", arguments: { appId: 7 } })) as {
      content: Array<{ text: string }>;
      structuredContent: Row;
    };
    expect(calls).toEqual([{ name: "get_search_console_data", args: { appId: 7 } }]);
    expect(res.content[0].text).toMatch(/as of its last sync at 2026-09-22T06:00:00Z — not live/);
    expect(res.content[0].text).toContain("412");
    expect(res.structuredContent.connector).toBe("search_console");
  });

  it("relay the nothing-synced message as a result, not an error", async () => {
    const { client } = await connect({ message: "No PostHog data synced yet. Connect PostHog in API Connections." });
    const res = (await client.callTool({ name: "get_posthog_analytics", arguments: {} })) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toMatch(/^No PostHog data synced yet/);
  });
});
