/**
 * list_watchlist (#101): the watchlist could be written for free and only read
 * by paying for a catch-up. Reading it back must cost nothing, fetch nothing,
 * and show what the model needs to answer "who am I watching" and to unwatch
 * someone by their exact handle.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { MemoryWatchStore } from "../src/shared/watchlist.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

type Row = Record<string, unknown>;

async function connect() {
  const upstream: string[] = [];
  const nooticr = {
    me: async () => ({ id: "u1" }),
    callTool: async (name: string) => {
      upstream.push(name);
      throw new Error(`no upstream call expected, got ${name}`);
    },
  } as unknown as NooticrClient;
  const store = new MemoryWatchStore();
  const client = new Client({ name: "test", version: "1.0.0" }, { capabilities: {} });
  const server = createMcpServer(async () => nooticr, { watchStore: store });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  return { client, store, upstream };
}

describe("list_watchlist", () => {
  it("reads back what watch_creator stored, with no upstream call", async () => {
    const { client, store, upstream } = await connect();
    await client.callTool({ name: "watch_creator", arguments: { username: "@coffeelab", note: "rival" } });
    await client.callTool({ name: "watch_creator", arguments: { username: "brewbar", platform: "instagram" } });
    // A catch-up happened for one of them. The owner is the account id
    // `me()` returns, which is how watchlistOwner keys the store.
    const [first] = await store.list("u1");
    expect(first).toBeDefined();
    await store.put("u1", { ...first, baseline: { capturedAt: "2026-09-20T08:00:00Z", postIds: ["a", "b", "c"] } } as never);

    const res = await client.callTool({ name: "list_watchlist", arguments: {} });
    const out = res.structuredContent as { watching: number; entries: Row[] };
    expect(out.watching).toBe(2);
    const handles = out.entries.map((e) => `${e.platform}:${e.handle}`).sort();
    expect(handles).toEqual(["instagram:brewbar", "tiktok:coffeelab"]);
    expect(out.entries.find((e) => e.handle === "coffeelab")?.note).toBe("rival");
    // The store's bookkeeping stays out of the model's context.
    expect(JSON.stringify(out)).not.toContain("postIds");
    expect(out.entries.some((e) => e.lastCaughtUpAt === "2026-09-20T08:00:00Z")).toBe(true);
    expect(upstream).toEqual([]);
  });

  it("is free, read-only and closed-world", async () => {
    const { client } = await connect();
    const t = (await client.listTools()).tools.find((x) => x.name === "list_watchlist")!;
    expect(t.description).toMatch(/No cost to call/);
    expect(t.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false, destructiveHint: false });
  });

  it("an empty list is an answer, not an error", async () => {
    const { client } = await connect();
    const res = await client.callTool({ name: "list_watchlist", arguments: {} });
    expect(res.isError).toBeFalsy();
    expect(res.structuredContent).toMatchObject({ watching: 0, entries: [] });
  });
});
