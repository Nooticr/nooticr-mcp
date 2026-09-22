/**
 * list_tool_runs / get_tool_run: where a user's credits went (#105).
 *
 * The history lives in the backend's run ledger (nooticr-server#117); this
 * surface has to carry the filters through untouched, stay free, and stay
 * closed-world - it reads the caller's own account and nothing else.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { MemoryWatchStore } from "../src/shared/watchlist.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

type Row = Record<string, unknown>;

async function connect(reply: (name: string, args: Row) => Row) {
  const calls: Array<{ name: string; args: Row }> = [];
  const nooticr = {
    me: async () => ({ id: "u1" }),
    callTool: async (name: string, args: Row) => {
      calls.push({ name, args });
      return { contentBlocks: [], structured: reply(name, args) };
    },
  } as unknown as NooticrClient;
  const client = new Client({ name: "test", version: "1.0.0" }, { capabilities: {} });
  const server = createMcpServer(async () => nooticr, { watchStore: new MemoryWatchStore() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  return { client, calls };
}

describe("run history", () => {
  it("passes every filter through and returns the page as the backend built it", async () => {
    const page = {
      scope: "workspace",
      runs: [{ id: 7, tool: "search_mentions", ok: true, credits: 18, userId: "u2" }],
      count: 1,
      creditsOnThisPage: 18,
      nextBefore: 7,
    };
    const { client, calls } = await connect(() => page);
    const args = {
      tool: "search_mentions",
      from: "2026-09-21",
      success: true,
      minCredits: 10,
      limit: 5,
      before: 99,
      scope: "workspace",
    };
    const res = await client.callTool({ name: "list_tool_runs", arguments: args });
    expect(calls).toEqual([{ name: "list_tool_runs", args }]);
    expect(res.structuredContent).toMatchObject(page);
  });

  it("reads one run by id", async () => {
    const { client, calls } = await connect(() => ({ run: { id: 7, error: "upstream said no" } }));
    const res = await client.callTool({ name: "get_tool_run", arguments: { id: 7 } });
    expect(calls[0]).toEqual({ name: "get_tool_run", args: { id: 7 } });
    expect((res.structuredContent as Row).run).toMatchObject({ id: 7 });
  });

  it("refuses a page size the backend would clamp anyway", async () => {
    const { client, calls } = await connect(() => ({}));
    const res = await client.callTool({ name: "list_tool_runs", arguments: { limit: 1000 } });
    expect(res.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("is free, read-only and closed-world", async () => {
    const { client } = await connect(() => ({}));
    const { tools } = await client.listTools();
    for (const name of ["list_tool_runs", "get_tool_run"]) {
      const t = tools.find((x) => x.name === name)!;
      expect(t.description).toMatch(/No cost to call/);
      expect(t.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false, destructiveHint: false });
    }
  });
});
