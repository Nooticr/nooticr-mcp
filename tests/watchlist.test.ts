/**
 * The watchlist is the only thing here that remembers anything between calls,
 * so what is worth testing is the memory: that a baseline survives, that a
 * catch-up reports what is new rather than what exists, and that reading the
 * list costs nothing.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { MemoryWatchStore, WATCHLIST_URI } from "../src/shared/watchlist.js";
import type { OrchynClient } from "../src/shared/orchyn.js";

/** Records every proxied tool call so a test can assert what was fetched. */
function fakeOrchyn(posts: () => Array<Record<string, unknown>>) {
  const calls: string[] = [];
  const client = {
    me: async () => ({ id: "user-1", email: "a@b.c" }),
    callTool: async (name: string) => {
      calls.push(name);
      return { contentBlocks: [], structured: { posts: posts() } };
    },
  } as unknown as OrchynClient;
  return { client, calls };
}

async function connect(orchyn: OrchynClient, store = new MemoryWatchStore()) {
  const client = new Client({ name: "test", version: "1.0.0" });
  const server = createMcpServer(async () => orchyn, { watchStore: store });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  return client;
}

const post = (id: string, views = 10) => ({
  id,
  externalUrl: `https://www.tiktok.com/@iruy/video/${id}`,
  views,
  caption: `post ${id}`,
});

describe("watchlist", () => {
  it("keeps a creator, and normalises the handle", async () => {
    const { client: orchyn } = fakeOrchyn(() => []);
    const client = await connect(orchyn);
    await client.callTool({ name: "watch_creator", arguments: { username: "@IRUY", note: "hooks" } });
    const res = await client.callTool({ name: "watch_creator", arguments: { username: "iruy" } });
    const out = res.structuredContent as { watching: number; entries: Array<Record<string, unknown>> };
    // @IRUY and iruy are one creator, not two.
    expect(out.watching).toBe(1);
    expect(out.entries[0].id).toBe("tiktok:iruy");
    // Re-watching must not silently drop the note it was added with.
    expect(out.entries[0].note).toBe("hooks");
  });

  it("reads the list without fetching anything", async () => {
    const { client: orchyn, calls } = fakeOrchyn(() => [post("1")]);
    const client = await connect(orchyn);
    await client.callTool({ name: "watch_creator", arguments: { username: "iruy" } });
    const res = await client.readResource({ uri: WATCHLIST_URI });
    const body = JSON.parse(res.contents[0].text as string);
    expect(body.watching).toBe(1);
    // A host may read a resource whenever it likes. If this ever fetches, it
    // spends the user's credits without them asking.
    expect(calls, "reading the watchlist must not call a paid tool").toEqual([]);
  });

  it("records a baseline on the first catch-up and claims nothing is new", async () => {
    const { client: orchyn } = fakeOrchyn(() => [post("1"), post("2")]);
    const client = await connect(orchyn);
    await client.callTool({ name: "watch_creator", arguments: { username: "iruy" } });
    const res = await client.callTool({ name: "catch_up_watchlist", arguments: {} });
    const out = res.structuredContent as { creators: Array<Record<string, unknown>> };
    // There is nothing to compare against yet, so reporting two "new" posts
    // would be a lie the first run tells every time.
    expect(out.creators[0].firstCheck).toBe(true);
    expect(out.creators[0].newPosts).toBe(0);
  });

  it("reports only what appeared since the last catch-up", async () => {
    let feed = [post("1"), post("2")];
    const { client: orchyn } = fakeOrchyn(() => feed);
    const client = await connect(orchyn);
    await client.callTool({ name: "watch_creator", arguments: { username: "iruy" } });
    await client.callTool({ name: "catch_up_watchlist", arguments: {} });

    feed = [post("3"), post("1"), post("2")];
    const res = await client.callTool({ name: "catch_up_watchlist", arguments: {} });
    const out = res.structuredContent as { creators: Array<Record<string, unknown>> };
    expect(out.creators[0].newPosts).toBe(1);
    expect((out.creators[0].posts as Array<{ id: string }>)[0].id).toBe("3");

    // And the baseline moved: asking again with the same feed finds nothing.
    const again = await client.callTool({ name: "catch_up_watchlist", arguments: {} });
    expect((again.structuredContent as { creators: Array<{ newPosts: number }> }).creators[0].newPosts).toBe(0);
  });

  it("keeps the baseline when a creator is re-watched", async () => {
    let feed = [post("1")];
    const { client: orchyn } = fakeOrchyn(() => feed);
    const client = await connect(orchyn);
    await client.callTool({ name: "watch_creator", arguments: { username: "iruy" } });
    await client.callTool({ name: "catch_up_watchlist", arguments: {} });
    // Re-adding someone already watched must not reset "since I last looked"
    // back to now, which would hide everything posted in between.
    await client.callTool({ name: "watch_creator", arguments: { username: "iruy", note: "again" } });
    feed = [post("2"), post("1")];
    const res = await client.callTool({ name: "catch_up_watchlist", arguments: {} });
    expect((res.structuredContent as { creators: Array<{ newPosts: number }> }).creators[0].newPosts).toBe(1);
  });

  it("survives one creator failing", async () => {
    const store = new MemoryWatchStore();
    let fail = false;
    const orchyn = {
      me: async () => ({ id: "user-1" }),
      callTool: async () => {
        if (fail) throw new Error("upstream is down");
        return { contentBlocks: [], structured: { posts: [post("1")] } };
      },
    } as unknown as OrchynClient;
    const client = await connect(orchyn, store);
    await client.callTool({ name: "watch_creator", arguments: { username: "a" } });
    await client.callTool({ name: "watch_creator", arguments: { username: "b" } });
    fail = true;
    const res = await client.callTool({ name: "catch_up_watchlist", arguments: {} });
    const out = res.structuredContent as { checked: number; creators: Array<Record<string, unknown>> };
    // One creator failing must not lose the rest of the catch-up.
    expect(out.checked).toBe(2);
    expect(out.creators.every((c) => typeof c.error === "string")).toBe(true);
    expect(res.isError).toBeFalsy();
  });

  it("removes a creator, and says so when there was nothing to remove", async () => {
    const { client: orchyn } = fakeOrchyn(() => []);
    const client = await connect(orchyn);
    await client.callTool({ name: "watch_creator", arguments: { username: "iruy" } });
    const gone = await client.callTool({ name: "unwatch_creator", arguments: { username: "@iruy" } });
    expect((gone.structuredContent as { removed: boolean; watching: number }).removed).toBe(true);
    expect((gone.structuredContent as { watching: number }).watching).toBe(0);
    const again = await client.callTool({ name: "unwatch_creator", arguments: { username: "iruy" } });
    expect((again.structuredContent as { removed: boolean }).removed).toBe(false);
  });

  it("says plainly when the list is empty rather than erroring", async () => {
    const { client: orchyn, calls } = fakeOrchyn(() => []);
    const client = await connect(orchyn);
    const res = await client.callTool({ name: "catch_up_watchlist", arguments: {} });
    expect(res.isError).toBeFalsy();
    expect((res.structuredContent as { checked: number }).checked).toBe(0);
    expect(calls).toEqual([]);
  });
});
