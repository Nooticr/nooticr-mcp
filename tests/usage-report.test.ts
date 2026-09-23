/** #93: get_usage_report, the run ledger added up. */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { MemoryWatchStore } from "../src/shared/watchlist.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

type Row = Record<string, unknown>;

async function connect() {
  const calls: Array<{ name: string; args: Row }> = [];
  const nooticr = {
    me: async () => ({ id: "u1" }),
    callTool: async (name: string, args: Row) => {
      calls.push({ name, args });
      return { contentBlocks: [], structured: { report: true, scope: args.scope ?? "mine", totals: { calls: 4, credits: 26 }, byTool: [], bySeat: [], byDay: [], recentFailures: [] } };
    },
  } as unknown as NooticrClient;
  const client = new Client({ name: "t", version: "1" }, { capabilities: {} });
  const server = createMcpServer(async () => nooticr, { watchStore: new MemoryWatchStore() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  return { client, calls };
}

describe("get_usage_report", () => {
  it("is free, read-only and closed-world", async () => {
    const { client } = await connect();
    const t = (await client.listTools()).tools.find((x) => x.name === "get_usage_report")!;
    expect(t.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
    expect(t.description).toMatch(/No cost to call/);
  });

  it("passes the window and scope through unchanged", async () => {
    const { client, calls } = await connect();
    await client.callTool({ name: "get_usage_report", arguments: { days: 7, scope: "workspace" } });
    expect(calls).toEqual([{ name: "get_usage_report", args: { days: 7, scope: "workspace" } }]);
  });

  it("refuses a window the backend would reject, before calling it", async () => {
    const { client, calls } = await connect();
    const r = (await client.callTool({ name: "get_usage_report", arguments: { days: 0 } })) as { isError?: boolean };
    expect(r.isError).toBe(true);
    expect(calls).toEqual([]);
  });
});
