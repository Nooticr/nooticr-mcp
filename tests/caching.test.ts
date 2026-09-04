/**
 * Cache hints on the view template.
 *
 * `resources/read` is one of the results MCP `2026-07-28` says a server MUST
 * hint on, and it is the one that actually costs something here: the template
 * is ~160KB of HTML and a host re-reads it every time it renders a widget.
 * The spec's default when the hint is absent is `ttlMs: 0` — immediately
 * stale — so every render was a fresh fetch of the whole thing.
 *
 * SDK 1.30 predates the fields, so they ride along as extra result keys. That
 * is the thing worth testing: that they survive the round trip rather than
 * being stripped by a schema that does not know them.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

async function connect() {
  const nooticr = { callTool: async () => ({ contentBlocks: [], structured: {} }) } as unknown as NooticrClient;
  const client = new Client({ name: "test", version: "1.0.0" });
  const server = createMcpServer(async () => nooticr);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  return client;
}

type Cached = { ttlMs?: number; cacheScope?: string };

describe("the view template tells clients how long to keep it", () => {
  it("carries a positive TTL, so it is not re-fetched on every render", async () => {
    const client = await connect();
    const res = (await client.readResource({ uri: "ui://nooticr/search_mentions" })) as Cached;
    // Absent means "immediately stale" per the spec, which is what we had.
    expect(res.ttlMs).toBeGreaterThan(0);
    expect(res.ttlMs).toBe(3_600_000);
  });

  it("marks it public, because it is the same bytes for everyone", async () => {
    const client = await connect();
    const res = (await client.readResource({ uri: "ui://nooticr/search_mentions" })) as Cached;
    // No account data, no token, nothing derived from the caller — so a shared
    // gateway may hold one copy for all users. That is the whole saving.
    expect(res.cacheScope).toBe("public");
  });

  it("hints on every view a host can read, not just the one we tested", async () => {
    const client = await connect();
    // Asks the server what it serves rather than reconstructing the list —
    // a hand-written list would silently stop covering a view added later.
    const { resources } = await client.listResources();
    expect(resources.length).toBeGreaterThan(20);
    const missing: string[] = [];
    for (const { uri } of resources) {
      const res = (await client.readResource({ uri })) as Cached;
      if (!res.ttlMs || !res.cacheScope) missing.push(uri);
    }
    expect(missing, "these are re-fetched in full on every render").toEqual([]);
  });

  /**
   * The scope is a correctness question, not an optimisation. `public` tells a
   * shared gateway it may serve one cached copy to every user, so anything
   * derived from the caller must never carry it.
   */
  it("does not mark per-account data public", async () => {
    const client = await connect();
    const { resources } = await client.listResources();
    for (const { uri } of resources) {
      const res = (await client.readResource({ uri })) as Cached;
      const isView = uri.startsWith("ui://");
      expect(res.cacheScope, uri).toBe(isView ? "public" : "private");
    }
    // The watchlist is one account's list; it also changes from inside the
    // session, so its window is short as well as private.
    const watch = (await client.readResource({ uri: "nooticr://watchlist" })) as Cached;
    expect(watch.cacheScope).toBe("private");
    expect(watch.ttlMs).toBeLessThanOrEqual(60_000);
  });

  it("hints on the legacy alias a stale ChatGPT connector still asks for", async () => {
    const client = await connect();
    for (const uri of ["ui://nooticr/view", "ui://nooticr/view.html"]) {
      const res = (await client.readResource({ uri })) as Cached;
      expect(res.ttlMs, uri).toBeGreaterThan(0);
    }
  });

  it("still returns the template itself", async () => {
    // A hint that arrived by dropping the payload would be a poor trade.
    const client = await connect();
    const res = await client.readResource({ uri: "ui://nooticr/search_mentions" });
    expect(String(res.contents[0].text)).toContain("<!DOCTYPE html>");
    expect((res.contents[0]._meta as { ui?: unknown })?.ui).toBeTruthy();
  });
});
