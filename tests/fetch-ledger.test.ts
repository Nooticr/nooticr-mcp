/**
 * #107: show_* views draw what nooticr returned in this session, not the
 * model's copy of it, and say plainly when a row could not be matched.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { MemoryWatchStore } from "../src/shared/watchlist.js";
import { FetchLedger, postKey } from "../src/shared/fetch-ledger.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

type Row = Record<string, unknown>;

const POST = {
  platform: "tiktok",
  externalUrl: "https://www.tiktok.com/@lena/video/123",
  caption: "Pour-over in 60 seconds",
  views: 48200,
  likes: 3100,
};

async function connect() {
  const nooticr = {
    me: async () => ({ id: "u1" }),
    callTool: async (name: string) => {
      if (name === "get_social_media") return { contentBlocks: [], structured: POST };
      return { contentBlocks: [], structured: {} };
    },
  } as unknown as NooticrClient;
  const client = new Client({ name: "t", version: "1" }, { capabilities: {} });
  const server = createMcpServer(async () => nooticr, { watchStore: new MemoryWatchStore() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  return client;
}

const sc = (r: unknown) => (r as { structuredContent: Row }).structuredContent;
const text = (r: unknown) => String((r as { content: Array<{ text: string }> }).content[0].text);

describe("postKey", () => {
  it("treats trailing slashes, www and tracking queries as one post, but keeps YouTube's id", () => {
    expect(postKey("https://www.tiktok.com/@lena/video/123/?is_from_webapp=1")).toBe(postKey("https://tiktok.com/@lena/video/123"));
    expect(postKey("https://www.youtube.com/watch?v=abc&t=3")).not.toBe(postKey("https://www.youtube.com/watch?v=xyz"));
  });
});

describe("show_compared_posts against the session", () => {
  it("draws nooticr's view count over a mis-copied one, and says it was checked", async () => {
    const client = await connect();
    await client.callTool({ name: "get_social_media", arguments: { url: POST.externalUrl } });
    const res = await client.callTool({
      name: "show_compared_posts",
      arguments: {
        posts: [
          { ...POST, views: 999999999, externalUrl: "https://tiktok.com/@lena/video/123/" },
          { platform: "tiktok", externalUrl: "https://tiktok.com/@ghost/video/9", views: 5 },
        ],
        winner: 1,
      },
    });
    const posts = sc(res).posts as Row[];
    expect(posts[0].views).toBe(48200);
    expect(posts[0].verified).toBe(true);
    expect(posts[1].verified).toBeUndefined();
    const v = sc(res).verification as Row;
    expect(v.status).toBe("unverified");
    expect(v.unmatched).toEqual(["https://tiktok.com/@ghost/video/9"]);
    expect(text(res)).toContain("1 of 2 posts is not among what nooticr returned in this session");
  });

  it("a view's own output is never recorded, so it cannot vouch for itself", async () => {
    const client = await connect();
    const fake = { platform: "tiktok", externalUrl: "https://tiktok.com/@ghost/video/9", views: 5 };
    await client.callTool({ name: "show_compared_posts", arguments: { posts: [fake, fake], winner: 1 } });
    const again = await client.callTool({ name: "show_compared_posts", arguments: { posts: [fake, fake], winner: 1 } });
    expect((sc(again).verification as Row).status).toBe("unverified");
  });
});

describe("show_post_analysis against the session", () => {
  it("fills the post from what nooticr fetched when only the URL is sent", async () => {
    const client = await connect();
    await client.callTool({ name: "get_social_media", arguments: { url: POST.externalUrl } });
    const res = await client.callTool({
      name: "show_post_analysis",
      arguments: { url: POST.externalUrl, analysis: { summary: "A tight 60s tutorial." } },
    });
    expect((sc(res).post as Row).views).toBe(48200);
    expect((sc(res).verification as Row).status).toBe("verified");
  });
});

describe("FetchLedger", () => {
  it("overlays recorded creator figures but keeps the model's order and notes", () => {
    const l = new FetchLedger();
    l.record("compare_creators", { creators: [{ handle: "lena", platform: "tiktok", hitRate: 0.4 }, { handle: "kai", platform: "tiktok", hitRate: 0.1 }] });
    const { rows, verification } = l.checkCreators([
      { handle: "@Kai", platform: "tiktok", hitRate: 0.9, rank: 1 },
      { handle: "lena", platform: "tiktok", hitRate: 0.9, rank: 2 },
    ]);
    expect(rows.map((r) => [r.handle, r.hitRate, r.rank])).toEqual([["kai", 0.1, 1], ["lena", 0.4, 2]]);
    expect(verification.status).toBe("verified");
  });

  it("matches trend points by term and time", () => {
    const l = new FetchLedger();
    l.record("mention_trend", { term: "Acme", runs: [{ ranAt: "2026-09-20T06:00:00Z", found: 12 }] });
    const { rows, verification } = l.checkRuns([{ ranAt: "2026-09-20T06:00:00Z", found: 120 }], "acme");
    expect(rows[0].found).toBe(12);
    expect(verification.status).toBe("verified");
  });

  it("stays bounded", () => {
    const l = new FetchLedger();
    for (let i = 0; i < 2500; i++) l.record("get_social_media", { externalUrl: `https://x.com/a/status/${i}`, views: i });
    expect(l.post("https://x.com/a/status/0")).toBeUndefined();
    expect(l.post("https://x.com/a/status/2499")).toBeDefined();
  });
});

describe("the slow-tool path records too", () => {
  it("analyze_post's post verifies a later show_post_analysis", async () => {
    const nooticr = {
      me: async () => ({ id: "u1" }),
      callTool: async (name: string) => ({
        contentBlocks: [],
        // analyze_post takes its post from the frames call.
        structured: name === "get_post_frames" ? { frames: [], post: POST } : { transcript: "t" },
      }),
    } as unknown as NooticrClient;
    const client = new Client({ name: "t", version: "1" }, { capabilities: {} });
    const server = createMcpServer(async () => nooticr, { watchStore: new MemoryWatchStore() });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(a), server.connect(b)]);
    await client.callTool({ name: "analyze_post", arguments: { url: POST.externalUrl } });
    const res = await client.callTool({
      name: "show_post_analysis",
      arguments: { url: POST.externalUrl, post: { ...POST, views: 1 }, analysis: { summary: "x" } },
    });
    expect((sc(res).post as Row).views).toBe(48200);
    expect((sc(res).verification as Row).status).toBe("verified");
  });
});
