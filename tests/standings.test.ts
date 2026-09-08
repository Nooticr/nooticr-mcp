/**
 * Putting two creators side by side (issue #30).
 *
 * `track_creator` already computed the only quantity that IS comparable
 * across creators of different sizes — a post's ratio to that creator's own
 * median — and then discarded the comparison, so "is their hit rate better
 * than mine?" was unanswerable at any price while every ingredient was
 * computed on every call.
 *
 * What is tested here is mostly restraint: the window travels with every
 * derived number, a window too short to mean anything says so instead of
 * being ranked, and a creator who could not be fetched is absent from the
 * comparison rather than bottom of it.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import type { NooticrClient } from "../src/shared/nooticr.js";
import { creatorStanding, standingsGuidance, THIN_WINDOW } from "../src/shared/standings.js";
import { ABOVE_RATIO, MIN_BASELINE_POSTS } from "../src/shared/performance.js";

const views = (...v: number[]) => v.map((views, i) => ({ views, caption: `post ${i}` }));
const stand = (posts: Array<Record<string, unknown>>, handle = "a") =>
  creatorStanding(handle, "tiktok", posts, "views", (p) => Number(p.views ?? 0));

describe("one creator on the shared axis", () => {
  it("scores against their own median, so account size drops out", () => {
    // The same shape at two scales must produce the same numbers. This is the
    // whole claim the comparison rests on.
    const small = stand(views(100, 100, 100, 400));
    const large = stand(views(100_000, 100_000, 100_000, 400_000));
    expect(small.hitRate).toBe(large.hitRate);
    expect(small.medianWinRatio).toBe(large.medianWinRatio);
    expect(small.baseline?.median).not.toBe(large.baseline?.median);
  });

  it("reports the window beside every number derived from it", () => {
    const row = stand(views(10, 20, 30, 40));
    expect(row.window).toBe(4);
    expect(row.ratios).toHaveLength(4);
  });

  it("refuses a baseline nobody has enough posts for", () => {
    // MIN_BASELINE_POSTS is performance.ts's own floor. Inventing a ratio
    // below it puts a confident number on an account with no baseline.
    const row = stand(views(...Array(MIN_BASELINE_POSTS - 1).fill(100)));
    expect(row.baseline).toBeNull();
    expect(row.hitRate).toBeNull();
    expect(row.unavailable).toMatch(new RegExp(`${MIN_BASELINE_POSTS} is the fewest`));
  });

  it("says an empty feed is a missing handle, not a quiet creator", () => {
    expect(stand([]).unavailable).toMatch(/no posts came back/);
  });

  it("separates how often from how hard, because they disagree", () => {
    // Consistent: clears the win threshold often, never by much. 100/200
    // around a median of 150 gives ratios of 0.67 and 1.33 — the second is a
    // win, the first is not. (An earlier fixture used 140, whose 1.17x never
    // crosses ABOVE_RATIO at all, so "often" was actually never.)
    const steady = stand(views(100, 100, 100, 100, 200, 200, 200, 200));
    // Swinging: one post carries the whole account.
    const swinging = stand(views(100, 100, 100, 100, 100, 100, 100, 1000));
    expect(steady.hitRate!).toBeGreaterThan(swinging.hitRate!);
    expect(swinging.medianWinRatio!).toBeGreaterThan(steady.medianWinRatio!);
  });

  it("takes the median of the winners, not their mean", () => {
    // Nine posts, median 100. The winners are 1.3x, 1.4x and 9x — median 1.4,
    // mean 3.9. The distinction matters because one runaway post is exactly
    // what a "how hard do they beat it" number must not be dragged by, and the
    // earlier tests here happened to use winner sets where the two coincide,
    // so a mutant computing the mean survived them.
    const row = stand(views(100, 100, 100, 100, 100, 100, 130, 140, 900));
    expect(row.baseline?.median).toBe(100);
    expect(row.medianWinRatio).toBe(1.4);
    expect(row.medianWinRatio).not.toBe(3.9);
  });

  it("counts a win from the same threshold the view draws", () => {
    // 1.0x is not a win: half an account's posts are above its own median by
    // definition, so a threshold of "above median" would report 50% for
    // everyone and compare nothing.
    const row = stand(views(100, 100, 100, 100 * ABOVE_RATIO - 1));
    expect(row.hitRate).toBe(0);
    const won = stand(views(100, 100, 100, 100 * ABOVE_RATIO));
    expect(won.hitRate).toBeGreaterThan(0);
  });

  it("carries the best and worst post, not just their numbers", () => {
    const row = stand(views(10, 20, 30, 900));
    expect((row.best as Record<string, unknown>).caption).toBe("post 3");
    expect((row.worst as Record<string, unknown>).caption).toBe("post 0");
  });

  it("survives an account whose stats the platform withholds", () => {
    // A median of zero would make every ratio Infinity and badge every post a
    // breakout — performance.ts refuses it, and this must not undo that.
    const row = stand(views(0, 0, 0, 0));
    expect(row.hitRate === null || row.hitRate === 0).toBe(true);
    expect(row.ratios.every((r) => Number.isFinite(r))).toBe(true);
  });
});

describe("the guidance handed to the model", () => {
  const rows = [stand(views(10, 20, 30, 40), "wide"), stand(views(10, 20, 30), "thin")];

  it("says the ratio is what compares, not the raw numbers", () => {
    const g = standingsGuidance({ rows, metric: "views", source: "handles" });
    expect(g).toMatch(/their OWN recent median/);
    expect(g).toMatch(/mostly measures follower count/);
  });

  it("names the creators whose window is too thin to rank", () => {
    const short = [stand(views(10, 20, 30, 40, 50), "brief")];
    const g = standingsGuidance({ rows: short, metric: "views", source: "handles" });
    expect(short[0].window).toBeLessThan(THIN_WINDOW);
    expect(g).toContain("@brief (5 posts)");
    expect(g).toMatch(/too thin to call/);
  });

  it("does not warn about a window that is long enough", () => {
    const long = [stand(views(...Array(THIN_WINDOW + 4).fill(0).map((_, i) => 100 + i)), "long")];
    const g = standingsGuidance({ rows: long, metric: "views", source: "handles" });
    expect(g).not.toMatch(/too thin to call/);
  });

  it("lists who could not be scored, and says missing is not last", () => {
    const g = standingsGuidance({
      rows: [stand(views(10, 20, 30, 40), "ok"), stand([], "gone")],
      metric: "views",
      source: "handles",
    });
    expect(g).toMatch(/@gone — no posts came back/);
    expect(g).toMatch(/not the same as bottom of it/);
  });

  it("refuses to let a hit rate be read as improvement", () => {
    // Everything here is one point in time. Nothing stores a second one yet.
    const g = standingsGuidance({ rows, metric: "views", source: "handles" });
    expect(g).toMatch(/second point in time/);
    expect(g).toMatch(/do not read a high hit rate as/i);
  });

  it("says so plainly when nothing could be scored at all", () => {
    const g = standingsGuidance({ rows: [stand([], "a"), stand([], "b")], metric: "views", source: "watchlist" });
    expect(g).toMatch(/None of them could be scored/);
    expect(g).toMatch(/not a finding about the creators/);
  });
});

describe("the tools", () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  async function connect(byHandle: Record<string, unknown[]> = {}) {
    calls.length = 0;
    const nooticr = {
      me: async () => ({ id: "u1" }),
      callTool: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        const handle = String(args.username ?? "");
        if (byHandle[handle] === undefined && name === "get_user_posts") {
          throw new Error(`no such handle: ${handle}`);
        }
        return {
          contentBlocks: [{ type: "text", text: "{}" }],
          structured: { posts: byHandle[handle] ?? [], mcpCredits: { cost: 2 } },
        };
      },
    } as unknown as NooticrClient;
    const client = new Client({ name: "test", version: "1.0.0" });
    const server = createMcpServer(async () => nooticr);
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(a), server.connect(b)]);
    await client.listTools();
    return client;
  }
  const call = async (client: Client, args: Record<string, unknown>, name = "compare_creators") =>
    (await client.callTool({ name, arguments: args }, undefined, { timeout: 30_000 }))
      .structuredContent as Record<string, unknown>;

  it("fetches one post list per creator and no more", async () => {
    const client = await connect({ a: views(1, 2, 3, 4), b: views(5, 6, 7, 8) });
    const out = await call(client, { usernames: ["@a", "b"] });
    expect(calls.map((c) => c.name)).toEqual(["get_user_posts", "get_user_posts"]);
    expect((out.creators as unknown[]).length).toBe(2);
  });

  it("dedupes handles rather than paying twice for one column", async () => {
    const client = await connect({ a: views(1, 2, 3, 4) });
    const out = await call(client, { usernames: ["a", "@a"] });
    expect(calls).toHaveLength(0);
    expect(out.billable).toBe(false);
    expect(String((out as { content?: unknown }).content ?? "")).not.toContain("undefined");
  });

  it("keeps the comparison when one creator fails, and says which", async () => {
    // A comparison of two out of three is still worth reading; a thrown error
    // would lose the two that worked.
    const client = await connect({ a: views(1, 2, 3, 4), c: views(9, 9, 9, 40) });
    const out = await call(client, { usernames: ["a", "missing", "c"] });
    const rows = out.creators as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.handle === "missing")?.unavailable).toMatch(/no such handle/);
    expect(rows.find((r) => r.handle === "a")?.baseline).toBeTruthy();
  });

  it("publishes the thresholds the view needs, so the two cannot disagree", async () => {
    const client = await connect({ a: views(1, 2, 3, 4), b: views(5, 6, 7, 8) });
    const out = await call(client, { usernames: ["a", "b"] });
    expect(out.thinWindow).toBe(THIN_WINDOW);
    expect(out.aboveRatio).toBe(ABOVE_RATIO);
  });

  it("watchlist_standings charges nothing for an empty watchlist", async () => {
    const client = await connect({});
    const out = await call(client, {}, "watchlist_standings");
    expect(calls.filter((c) => c.name === "get_user_posts")).toHaveLength(0);
    expect(out.billable).toBe(false);
    expect(out.watching).toBe(0);
  });

  it("show_standings makes no request and marks itself as the view", async () => {
    const client = await connect({});
    const out = await call(client, { creators: [{ handle: "a" }], ranking: "by hit rate" }, "show_standings");
    expect(calls).toHaveLength(0);
    expect(out.standings).toBe(true);
    expect(out.ranking).toBe("by hit rate");
    expect(out.tooThin).toEqual([]);
  });
});
