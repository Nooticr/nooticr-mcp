/**
 * The job tools: five compositions and the view that draws what a model made
 * of the first one.
 *
 * These are the only tools here that fan out, and everything that can go wrong
 * with them is a consequence of that. They spend a credit per post opened, so
 * the cap has to hold and the confirmation has to fire; they open several posts
 * in one call, so the ids they mint have to stay distinct across posts and the
 * same across calls; and any one of those fetches can fail, which must cost the
 * caller that post rather than the whole answer.
 *
 * The arithmetic is tested against a distribution written down by hand rather
 * than sampled, because "beat their own median" is the entire claim these tools
 * make and a median that is quietly wrong reads exactly like one that is right.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "../src/shared/tools.js";
import { MemoryWatchStore } from "../src/shared/watchlist.js";
import {
  commentIdFor,
  postIdOf,
  replySignals,
  trustedCommentDate,
  applySince,
  postDate,
} from "../src/shared/jobs.js";
import {
  distributionOf,
  excluding,
  median,
  standing,
} from "../src/shared/performance.js";
import { CONFIRM_ABOVE_CREDITS, costOf } from "../src/shared/spend.js";
import type { OrchynClient } from "../src/shared/orchyn.js";

type Row = Record<string, unknown>;

interface Backend {
  /** What each tool returns, by name. A function may throw to fail one call. */
  [tool: string]: (args: Row) => Row;
}

/**
 * @param answer  what the user does at a spend prompt, or null for a client
 *                that never declared elicitation.
 */
async function connect(
  backend: Backend,
  opts: { answer?: "accept" | "decline" | null; store?: MemoryWatchStore } = {},
) {
  // `??` would fold the deliberate `null` — a client that declares no
  // elicitation capability — into "accept", so the no-capability path could
  // never be constructed and the test asserted against a scenario that did
  // not exist. Only an absent option means "accept".
  const answer = opts.answer === undefined ? "accept" : opts.answer;
  const calls: Array<{ name: string; args: Row }> = [];
  const asked: string[] = [];
  const orchyn = {
    me: async () => ({ id: "u1" }),
    callTool: async (name: string, args: Row) => {
      calls.push({ name, args });
      const handler = backend[name];
      if (!handler) throw new Error(`no stub for ${name}`);
      return { contentBlocks: [], structured: handler(args) };
    },
  } as unknown as OrchynClient;

  const client = new Client(
    { name: "test", version: "1.0.0" },
    answer === null ? {} : { capabilities: { elicitation: {} } },
  );
  if (answer !== null) {
    client.setRequestHandler(ElicitRequestSchema, async (req) => {
      asked.push(req.params.message);
      return answer === "accept"
        ? { action: "accept", content: { proceed: true } }
        : { action: "decline" };
    });
  }
  const store = opts.store ?? new MemoryWatchStore();
  const server = createMcpServer(async () => orchyn, { watchStore: store });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  await client.listTools();
  return { client, calls, asked, store };
}

const feed = (posts: Row[]) => ({ platform: "tiktok", posts, mcpCredits: { cost: 2 } });
const commentsOf = (comments: Row[]) => ({ comments, mcpCredits: { cost: 2 } });

/** Two TikTok posts and a comment section each, which is the common case. */
function twoPostBackend(): Backend {
  return {
    get_user_posts: () =>
      feed([
        { id: "1", platform: "tiktok", title: "one", externalUrl: "https://www.tiktok.com/@a/video/1", views: 100 },
        { id: "2", platform: "tiktok", title: "two", externalUrl: "https://www.tiktok.com/@a/video/2", views: 200 },
      ]),
    get_post_comments: () =>
      commentsOf([
        { text: "how do you edit these?", author: "@ana", likes: 4 },
        { text: "love it", author: "@bo", likes: 1 },
      ]),
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("answer_my_audience", () => {
  const ask = (args: Row) => ({ name: "answer_my_audience", arguments: args });

  it("opens the posts itself and groups the comments under them", async () => {
    const { client, calls } = await connect(twoPostBackend());
    const res = await client.callTool(ask({ username: "@a" }));
    expect(res.isError, JSON.stringify(res.content)).toBeFalsy();
    // One list call, then one comment fetch per post: the fan-out is the tool.
    expect(calls.map((c) => c.name)).toEqual([
      "get_user_posts",
      "get_post_comments",
      "get_post_comments",
    ]);
    const out = res.structuredContent as {
      threads: Array<{ post: Row; mentions: Row[] }>;
      totalMentions: number;
    };
    expect(out.threads).toHaveLength(2);
    expect(out.totalMentions).toBe(4);
    expect(out.threads[0].post.externalUrl).toBe("https://www.tiktok.com/@a/video/1");
  });

  it("flags what wants an answer and sorts it to the top", async () => {
    const { client } = await connect(twoPostBackend());
    const res = await client.callTool(ask({ username: "a" }));
    const out = res.structuredContent as {
      wantsReplyCount: number;
      threads: Array<{ mentions: Array<{ text: string; wantsReply: boolean; signals: string[] }> }>;
    };
    expect(out.wantsReplyCount).toBe(2);
    // A creator reads the top of the page and stops, so the question has to be
    // there rather than wherever the platform happened to put it.
    expect(out.threads[0].mentions[0].text).toContain("how do you edit");
    expect(out.threads[0].mentions[0].wantsReply).toBe(true);
    expect(out.threads[0].mentions[0].signals.length).toBeGreaterThan(0);
    expect(out.threads[0].mentions[1].wantsReply).toBe(false);
  });

  it("renders through the monitoring view rather than a second one", async () => {
    const { client } = await connect(twoPostBackend());
    const res = await client.callTool(ask({ username: "a" }));
    const out = res.structuredContent as { term: string; threads: unknown[]; byCategory: Row };
    // term + threads is what the view keys off; the chips come from byCategory.
    expect(out.term).toBe("@a");
    expect(Array.isArray(out.threads)).toBe(true);
    expect(out.byCategory).toEqual({ wants_a_reply: 2, unclear: 2 });
  });

  /**
   * The promise the tool is allowed to make. No orchyn connection carries
   * comment-write permission on any network — TikTok's asks for upload and
   * list, YouTube's for upload and readonly — and there is no send path in the
   * server at all. A model that believes otherwise promises the user something
   * that cannot happen.
   */
  it("never claims it can send a reply", async () => {
    const { client } = await connect(twoPostBackend());
    const res = await client.callTool(ask({ username: "a" }));
    const guidance = String((res.content as Array<{ text: string }>)[0].text);
    expect(guidance).toMatch(/drafting, not sending/i);
    expect((res.structuredContent as { repliesCanBeSent: boolean }).repliesCanBeSent).toBe(false);
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "answer_my_audience")!;
    expect(tool.description).toMatch(/cannot post/i);
  });

  it("tells the caller what to produce and to reason over it itself", async () => {
    const { client } = await connect(twoPostBackend());
    const res = await client.callTool(ask({ username: "a" }));
    const guidance = String((res.content as Array<{ text: string }>)[0].text);
    expect(guidance).toMatch(/draft a reply/i);
    // The flag is an ordering, and saying so is what stops it being read as a
    // classification the tool is standing behind.
    expect(guidance).toMatch(/not a judgement/i);
    expect(guidance).toContain("show_audience_replies");
    expect(guidance).toMatch(/Reason over this yourself/);
  });

  it("returns what it got when a post refuses", async () => {
    const backend = twoPostBackend();
    let n = 0;
    backend.get_post_comments = () => {
      // Comments switched off on the first post. Normal, and not a reason to
      // lose the second.
      if (n++ === 0) throw new Error("comments are disabled for this post");
      return commentsOf([{ text: "when is part 2?", author: "@cy", likes: 9 }]);
    };
    const { client } = await connect(backend);
    const res = await client.callTool(ask({ username: "a" }));
    expect(res.isError, "a partial answer is still an answer").toBeFalsy();
    const out = res.structuredContent as {
      threads: unknown[];
      unavailable: Array<{ reason: string; url: string }>;
    };
    expect(out.threads).toHaveLength(1);
    expect(out.unavailable).toHaveLength(1);
    expect(out.unavailable[0].reason).toMatch(/disabled/);
    // And the caller is told, in the text it actually reads.
    expect(String((res.content as Array<{ text: string }>)[0].text)).toMatch(/could not be read/i);
  });

  it("charges for the list and nothing more when there are no posts", async () => {
    const { client, calls, asked } = await connect({ get_user_posts: () => feed([]) });
    const res = await client.callTool(ask({ username: "ghost" }));
    expect(res.isError).toBeFalsy();
    expect(calls.map((c) => c.name)).toEqual(["get_user_posts"]);
    // Nothing to fan out over, so nothing to confirm and nothing to spend.
    expect(asked).toEqual([]);
    expect((res.structuredContent as { postsChecked: number }).postsChecked).toBe(0);
  });

  it("windows on the post's date, and says when it could not", async () => {
    const backend: Backend = {
      get_user_posts: () =>
        feed([
          { id: "old", platform: "tiktok", externalUrl: "https://www.tiktok.com/@a/video/1", postedAt: "2020-01-01T00:00:00Z" },
          { id: "new", platform: "tiktok", externalUrl: "https://www.tiktok.com/@a/video/2", postedAt: "2026-08-01T00:00:00Z" },
        ]),
      get_post_comments: () => commentsOf([{ text: "hi", author: "@z" }]),
    };
    const { client } = await connect(backend);
    const res = await client.callTool(ask({ username: "a", since: "2026-01-01" }));
    const out = res.structuredContent as { sinceApplied: boolean; threads: Array<{ post: Row }> };
    expect(out.sinceApplied).toBe(true);
    expect(out.threads).toHaveLength(1);
    expect(out.threads[0].post.id).toBe("new");

    // And the case that matters more: a platform that returns no dates at all
    // must not silently pretend the window held.
    const { client: c2 } = await connect(twoPostBackend());
    const res2 = await c2.callTool(ask({ username: "a", since: "2026-01-01" }));
    const out2 = res2.structuredContent as { sinceApplied: boolean; threads: unknown[] };
    expect(out2.sinceApplied).toBe(false);
    expect(out2.threads).toHaveLength(2);
    expect(String((res2.content as Array<{ text: string }>)[0].text)).toMatch(/nothing was filtered/i);
  });

  it("drops a comment date it cannot stand behind", async () => {
    const backend = twoPostBackend();
    backend.get_post_comments = () =>
      commentsOf([
        // Seven of the nine importer mappers stamp `Utc::now()` when the real
        // date will not parse, so a timestamp indistinguishable from the fetch
        // is not evidence of anything.
        { text: "fresh?", author: "@a", postedAt: new Date().toISOString() },
        { text: "older one", author: "@b", postedAt: "2026-01-02T00:00:00Z" },
      ]);
    const { client } = await connect(backend);
    const res = await client.callTool(ask({ username: "a" }));
    const mentions = (res.structuredContent as { threads: Array<{ mentions: Row[] }> }).threads[0].mentions;
    const byText = Object.fromEntries(mentions.map((m) => [String(m.text), m.postedAt]));
    expect(byText["fresh?"]).toBeNull();
    expect(byText["older one"]).toBe("2026-01-02T00:00:00.000Z");
  });
});

describe("the fan-out cap", () => {
  const twentyPosts = () =>
    feed(
      Array.from({ length: 20 }, (_, i) => ({
        id: String(i),
        platform: "tiktok",
        externalUrl: `https://www.tiktok.com/@a/video/${i}`,
        views: i * 10,
      })),
    );

  it("never opens more posts than the cap, however large the argument", async () => {
    const { client, calls } = await connect({
      get_user_posts: () => twentyPosts(),
      get_post_comments: () => commentsOf([{ text: "hi", author: "@z" }]),
    });
    await client.callTool({ name: "answer_my_audience", arguments: { username: "a", limit: 500 } });
    const opened = calls.filter((c) => c.name === "get_post_comments");
    // 12 is the hard cap. A tool that fans out per credit cannot take an
    // unbounded number from an argument.
    expect(opened).toHaveLength(12);
    // And the cap is passed upstream too, so the list call is not paid for at
    // twenty posts to then use twelve.
    expect(calls[0].args.limit).toBe(12);
  });

  it("caps what_should_i_make_next at eight of your own posts", async () => {
    const { client, calls } = await connect({
      get_user_posts: () => twentyPosts(),
      get_post_comments: () => commentsOf([{ text: "make a part 2 please", author: "@z" }]),
      discover_social_posts: () => feed([{ id: "n", platform: "tiktok", views: 1 }]),
    });
    await client.callTool({
      name: "what_should_i_make_next",
      arguments: { username: "a", niche: "gym", limit: 99 },
    });
    expect(calls.filter((c) => c.name === "get_post_comments")).toHaveLength(8);
  });

  it("honours a smaller cap than the default", async () => {
    const { client, calls } = await connect({
      get_user_posts: () => twentyPosts(),
      get_post_comments: () => commentsOf([]),
    });
    await client.callTool({ name: "answer_my_audience", arguments: { username: "a", limit: 2 } });
    expect(calls.filter((c) => c.name === "get_post_comments")).toHaveLength(2);
  });
});

describe("asking before a fan-out spends", () => {
  const backendFor = (posts: number): Backend => ({
    get_user_posts: () =>
      feed(
        Array.from({ length: posts }, (_, i) => ({
          id: String(i),
          platform: "tiktok",
          externalUrl: `https://www.tiktok.com/@a/video/${i}`,
        })),
      ),
    get_post_comments: () => commentsOf([{ text: "hi", author: "@z" }]),
    discover_social_posts: () => feed([]),
  });

  it("asks once the fan-out goes over the line, and names the price", async () => {
    const { client, asked } = await connect(backendFor(6));
    await client.callTool({ name: "answer_my_audience", arguments: { username: "a" } });
    expect(asked).toHaveLength(1);
    // Six posts is six comment fetches at 2 credits each.
    expect(asked[0]).toContain("12 orchyn credits");
    expect(asked[0]).toContain("@a");
    // And a way out that is cheaper rather than nothing.
    expect(asked[0]).toMatch(/limit/i);
  });

  it("does not ask about a fan-out small enough not to matter", async () => {
    const { client, asked, calls } = await connect(backendFor(3));
    await client.callTool({ name: "answer_my_audience", arguments: { username: "a" } });
    // Three posts is 6 credits, which is at the threshold, not over it.
    expect(costOf(["get_post_comments", "get_post_comments", "get_post_comments"]))
      .toBe(CONFIRM_ABOVE_CREDITS);
    expect(asked, "a prompt here costs more attention than the credits").toEqual([]);
    expect(calls.filter((c) => c.name === "get_post_comments")).toHaveLength(3);
  });

  it("spends nothing more when the user declines", async () => {
    const { client, calls } = await connect(backendFor(6), { answer: "decline" });
    const res = await client.callTool({ name: "answer_my_audience", arguments: { username: "a" } });
    // The post list was already fetched — 2 credits, below the threshold the
    // codebase already decided is worth interrupting someone for — but the
    // twelve credits of comment fetches must not happen.
    expect(calls.map((c) => c.name)).toEqual(["get_user_posts"]);
    expect(res.isError, "saying no is a choice, not a failure").toBeFalsy();
    const text = String((res.content as Array<{ text: string }>)[0].text);
    expect(text).toMatch(/no credits were spent/i);
    // The way out has to be the lever this tool actually has.
    expect(text).toMatch(/limit/);
    expect(text).not.toMatch(/platforms/);
  });

  it("runs rather than refusing when the client cannot be asked", async () => {
    const { client, calls, asked } = await connect(backendFor(6), { answer: null });
    const res = await client.callTool({ name: "answer_my_audience", arguments: { username: "a" } });
    expect(asked).toEqual([]);
    expect(res.isError).toBeFalsy();
    expect(calls.filter((c) => c.name === "get_post_comments")).toHaveLength(6);
  });

  it("never asks about the two-credit tools", async () => {
    const { client, asked } = await connect({
      get_user_posts: () => feed([{ id: "1", platform: "tiktok", views: 10 }]),
      search_creators: () => ({ creators: [{ username: "x", followers: 10 }], mcpCredits: { cost: 2 } }),
    });
    await client.callTool({ name: "track_competitor", arguments: { username: "a" } });
    await client.callTool({ name: "who_should_i_work_with", arguments: { niche: "gym" } });
    expect(asked).toEqual([]);
  });
});

describe("addressable ids", () => {
  /**
   * The bug this scheme exists to avoid: YouTube keeps the video id in `?v=`,
   * so the last path segment is "watch" for every video on the platform, and
   * ids built from it named a different comment depending on which video had
   * just been fetched.
   */
  it("never mints the same comment id under two different posts", async () => {
    const backend: Backend = {
      get_user_posts: () =>
        feed([
          { id: "a", platform: "youtube", externalUrl: "https://www.youtube.com/watch?v=aaa" },
          { id: "b", platform: "youtube", externalUrl: "https://www.youtube.com/watch?v=bbb" },
        ]),
      // Identical comments under both posts: if the id came from position,
      // these would collide exactly.
      get_post_comments: () => commentsOf([{ text: "same words", author: "@same", likes: 1 }]),
    };
    const { client } = await connect(backend);
    const res = await client.callTool({ name: "answer_my_audience", arguments: { username: "a" } });
    const threads = (res.structuredContent as { threads: Array<{ mentions: Array<{ id: string }> }> }).threads;
    const ids = threads.flatMap((t) => t.mentions.map((m) => m.id));
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size, "two posts minted one id").toBe(2);
    expect(ids[0]).toContain("aaa");
    expect(ids[1]).toContain("bbb");
  });

  /**
   * An id that moves between calls is worse than no id, because a host stores
   * it to address one comment and silently gets another. `search_mentions`
   * mints an index into the whole result and cannot promise this; these can,
   * so they are tested for it.
   */
  it("names the same comment the same way after the order changes", async () => {
    const order = [
      [{ text: "first", author: "@a" }, { text: "second", author: "@b" }],
      [{ text: "second", author: "@b" }, { text: "new one", author: "@c" }, { text: "first", author: "@a" }],
    ];
    let call = 0;
    const backend: Backend = {
      get_user_posts: () =>
        feed([{ id: "1", platform: "tiktok", externalUrl: "https://www.tiktok.com/@a/video/1" }]),
      get_post_comments: () => commentsOf(order[Math.min(call++, 1)]),
    };
    const { client } = await connect(backend);
    const idsOf = async () => {
      const res = await client.callTool({ name: "answer_my_audience", arguments: { username: "a" } });
      const mentions = (res.structuredContent as { threads: Array<{ mentions: Row[] }> }).threads[0].mentions;
      return Object.fromEntries(mentions.map((m) => [String(m.text), String(m.id)]));
    };
    const before = await idsOf();
    const after = await idsOf();
    expect(after.first).toBe(before.first);
    expect(after.second).toBe(before.second);
    expect(after["new one"]).toBeTruthy();
  });

  it("prefers the platform's own comment id when there is one", () => {
    const withCid = commentIdFor("post:tiktok:123", { cid: "7412", text: "x", author: "a" });
    expect(withCid).toBe("comment:tiktok:123:7412");
    // And the fingerprint path does not depend on where the comment sat.
    const hashed = commentIdFor("post:tiktok:123", { text: "x", author: "a" });
    expect(hashed).toMatch(/^comment:tiktok:123:h[0-9a-z]+$/);
    expect(commentIdFor("post:tiktok:123", { text: "x", author: "a" })).toBe(hashed);
    expect(commentIdFor("post:tiktok:456", { text: "x", author: "a" })).not.toBe(hashed);
  });

  it("identifies a post by platform and the part of the URL that identifies it", () => {
    expect(postIdOf({ platform: "youtube", externalUrl: "https://www.youtube.com/watch?v=zz" }, 0))
      .toBe("post:youtube:zz");
    // The same numeric id exists on two networks, which is why the platform is
    // part of the id rather than assumed.
    expect(postIdOf({ platform: "tiktok", externalUrl: "https://www.tiktok.com/@a/video/9" }, 0))
      .not.toBe(postIdOf({ platform: "douyin", externalUrl: "https://www.douyin.com/video/9" }, 0));
    // No permalink at all: fall through to the platform's id, then position,
    // rather than to the literal "post" for every such row.
    expect(postIdOf({ platform: "weibo", id: "w1" }, 3)).toBe("post:weibo:w1");
    expect(postIdOf({ platform: "weibo" }, 3)).toBe("post:weibo:at3");
  });
});

describe("track_competitor", () => {
  // Written down rather than sampled: median 300, and every verdict band has a
  // post sitting in it.
  const known = [100, 200, 300, 400, 1000];
  const backend = (views: number[] = known): Backend => ({
    get_user_posts: () =>
      feed(
        views.map((v, i) => ({
          id: `p${i}`,
          platform: "tiktok",
          title: `post ${v}`,
          externalUrl: `https://www.tiktok.com/@rival/video/${i}`,
          views: v,
        })),
      ),
  });

  it("scores every post against the median of their own window", async () => {
    const { client, calls } = await connect(backend());
    const res = await client.callTool({ name: "track_competitor", arguments: { username: "@rival" } });
    // One call. The insight is arithmetic over material already paid for.
    expect(calls.map((c) => c.name)).toEqual(["get_user_posts"]);
    const out = res.structuredContent as {
      baseline: { median: number; p25: number; p75: number; count: number };
      posts: Array<{ metricValue: number; standing: { ratio: number; verdict: string; percentile: number } }>;
      outperformers: string[];
    };
    expect(out.baseline.median).toBe(300);
    expect(out.baseline.count).toBe(5);
    expect(out.baseline.p25).toBe(200);
    expect(out.baseline.p75).toBe(400);
    // Best against their own median first, not the platform's own order.
    expect(out.posts.map((p) => p.metricValue)).toEqual([1000, 400, 300, 200, 100]);
    const verdicts = out.posts.map((p) => p.standing.verdict);
    expect(verdicts).toEqual(["breakout", "above_baseline", "typical", "below_baseline", "flop"]);
    expect(out.posts[0].standing.ratio).toBeCloseTo(3.33, 2);
    expect(out.posts[0].standing.percentile).toBe(80);
    // Outperformance is the reported signal, so it is a field rather than a
    // thing the reader has to derive.
    expect(out.outperformers).toHaveLength(2);
  });

  it("refuses to invent a baseline from two posts", async () => {
    const { client } = await connect(backend([100, 5000]));
    const res = await client.callTool({ name: "track_competitor", arguments: { username: "r" } });
    const out = res.structuredContent as { baseline: null; posts: Array<{ standing: { verdict: string } }> };
    expect(out.baseline).toBeNull();
    // Two numbers are not a distribution, and calling one of them the median
    // would put a confident badge on an account nobody has enough of.
    expect(out.posts[0].standing.verdict).toBe("no_baseline");
    expect(String((res.content as Array<{ text: string }>)[0].text)).toMatch(/too few posts/i);
  });

  it("marks what is new only for a creator already on the watchlist", async () => {
    const store = new MemoryWatchStore();
    const posts = [...known];
    const back = backend(posts);
    const { client } = await connect(back, { store });

    const untracked = await client.callTool({ name: "track_competitor", arguments: { username: "rival" } });
    const first = untracked.structuredContent as { tracked: boolean; newSincePreviousCheck: null };
    // Adding them here would be a side effect nobody asked for.
    expect(first.tracked).toBe(false);
    expect(first.newSincePreviousCheck).toBeNull();
    expect(String((untracked.content as Array<{ text: string }>)[0].text)).toMatch(/watch_creator/);

    await client.callTool({ name: "watch_creator", arguments: { username: "rival" } });
    await client.callTool({ name: "track_competitor", arguments: { username: "rival" } });
    // A sixth post lands between the two checks.
    posts.push(2000);
    const again = await client.callTool({ name: "track_competitor", arguments: { username: "rival" } });
    const out = again.structuredContent as {
      tracked: boolean;
      newSincePreviousCheck: number;
      posts: Array<{ isNew: boolean }>;
    };
    expect(out.tracked).toBe(true);
    expect(out.newSincePreviousCheck).toBe(1);
    expect(out.posts.filter((p) => p.isNew)).toHaveLength(1);
  });

  /**
   * Both tools answer "what has changed since I last looked" and both move a
   * marker when they do. One shared marker would mean each silently ate the
   * other's answer — run a catch-up and track_competitor reports nothing new,
   * which looks like the creator stopped posting.
   */
  it("does not consume the catch-up's baseline", async () => {
    const store = new MemoryWatchStore();
    const { client } = await connect(backend(), { store });
    await client.callTool({ name: "watch_creator", arguments: { username: "rival" } });
    await client.callTool({ name: "track_competitor", arguments: { username: "rival" } });
    const [entry] = await store.list("u1");
    expect(entry.competitorBaseline?.postIds).toHaveLength(5);
    expect(entry.baseline, "the catch-up has still never run").toBeUndefined();

    // And the catch-up still reports its own first check as a first check.
    const caught = await client.callTool({ name: "catch_up_watchlist", arguments: {} });
    expect((caught.structuredContent as { creators: Array<{ firstCheck: boolean }> }).creators[0].firstCheck)
      .toBe(true);
  });

  it("keeps the outperformance half when the store will not answer", async () => {
    const broken = {
      list: async () => {
        throw new Error("KV is unavailable");
      },
      put: async () => {},
      remove: async () => false,
    };
    const { client } = await connect(backend(), { store: broken as unknown as MemoryWatchStore });
    const res = await client.callTool({ name: "track_competitor", arguments: { username: "rival" } });
    expect(res.isError, "a store outage costs the diff, not the tool").toBeFalsy();
    expect((res.structuredContent as { baseline: { median: number } }).baseline.median).toBe(300);
  });
});

describe("why_did_this_underperform", () => {
  const url = "https://www.tiktok.com/@a/video/100";
  const backend: Backend = {
    get_social_media: () => ({
      post: { id: "100", platform: "tiktok", creatorHandle: "@a", externalUrl: url, views: 100 },
      mcpCredits: { cost: 1 },
    }),
    get_user_posts: () =>
      feed([
        // The post under examination comes back in its own creator's feed,
        // which is the normal case and the reason `excluding` exists.
        { id: "100", platform: "tiktok", externalUrl: url, views: 100 },
        { id: "2", platform: "tiktok", externalUrl: "https://www.tiktok.com/@a/video/2", views: 200 },
        { id: "3", platform: "tiktok", externalUrl: "https://www.tiktok.com/@a/video/3", views: 400 },
        { id: "4", platform: "tiktok", externalUrl: "https://www.tiktok.com/@a/video/4", views: 600 },
        { id: "5", platform: "tiktok", externalUrl: "https://www.tiktok.com/@a/video/5", views: 800 },
      ]),
  };

  it("measures the post against the creator, not against itself", async () => {
    const { client, calls } = await connect(backend);
    // The URL a person pastes carries a share tracker; the one the feed
    // returns does not, and a string comparison of the two would leave the
    // post inside its own baseline.
    const res = await client.callTool({
      name: "why_did_this_underperform",
      arguments: { url: `${url}?is_from_webapp=1&sender_device=pc` },
    });
    expect(calls.map((c) => c.name)).toEqual(["get_social_media", "get_user_posts"]);
    const out = res.structuredContent as {
      baseline: { median: number; count: number };
      standing: { ratio: number; percentile: number; verdict: string };
      window: unknown[];
    };
    // Median of [200,400,600,800], with the 100 taken out. Left in, it would
    // have been 400 and the post would have looked twice as good as it is.
    expect(out.baseline.median).toBe(500);
    expect(out.baseline.count).toBe(4);
    expect(out.window).toHaveLength(4);
    expect(out.standing.ratio).toBe(0.2);
    expect(out.standing.percentile).toBe(0);
    expect(out.standing.verdict).toBe("flop");
  });

  it("says a normal result is normal rather than manufacturing a cause", async () => {
    const near: Backend = {
      ...backend,
      get_social_media: () => ({
        post: { id: "x", platform: "tiktok", creatorHandle: "@a", externalUrl: "https://www.tiktok.com/@a/video/x", views: 480 },
        mcpCredits: { cost: 1 },
      }),
    };
    const { client } = await connect(near);
    const res = await client.callTool({
      name: "why_did_this_underperform",
      arguments: { url: "https://www.tiktok.com/@a/video/x" },
    });
    const out = res.structuredContent as { standing: { verdict: string } };
    expect(out.standing.verdict).toBe("typical");
    expect(String((res.content as Array<{ text: string }>)[0].text)).toMatch(/ordinary spread/i);
  });

  it("stops rather than comparing against nothing when no creator is named", async () => {
    const anonymous: Backend = {
      get_social_media: () => ({ post: { id: "1", platform: "tiktok", views: 10 }, mcpCredits: { cost: 1 } }),
    };
    const { client, calls } = await connect(anonymous);
    const res = await client.callTool({
      name: "why_did_this_underperform",
      arguments: { url: "https://www.tiktok.com/@?/video/1" },
    });
    expect(res.isError).toBeFalsy();
    expect(calls.map((c) => c.name)).toEqual(["get_social_media"]);
    const out = res.structuredContent as { standing: null; unavailable: unknown[] };
    expect(out.standing).toBeNull();
    expect(out.unavailable).toHaveLength(1);
    // And it names the argument that fixes it.
    expect(String((res.content as Array<{ text: string }>)[0].text)).toMatch(/`username`/);
  });

  it("returns the post when the creator's window cannot be fetched", async () => {
    const { client } = await connect({
      ...backend,
      get_user_posts: () => {
        throw new Error("this account is private");
      },
    });
    const res = await client.callTool({ name: "why_did_this_underperform", arguments: { url } });
    expect(res.isError).toBeFalsy();
    const out = res.structuredContent as { post: Row; baseline: null; unavailable: Array<{ reason: string }> };
    expect(out.post.id).toBeTruthy();
    expect(out.baseline).toBeNull();
    expect(out.unavailable[0].reason).toMatch(/private/);
  });
});

describe("who_should_i_work_with", () => {
  const backend: Backend = {
    search_creators: () => ({
      creators: [
        { username: "big", followers: 900_000, signature: "gym" },
        { username: "both", followers: 40_000, signature: "home gym" },
      ],
      mcpCredits: { cost: 2 },
    }),
    get_similar_creators: () => ({
      creators: [
        { username: "@both", followers: 40_000 },
        { username: "peer", followers: 12_000 },
      ],
      mcpCredits: { cost: 2 },
    }),
  };

  it("merges the two searches and records which found each candidate", async () => {
    const { client, calls } = await connect(backend);
    const res = await client.callTool({
      name: "who_should_i_work_with",
      arguments: { niche: "home gym", seed: "@anchor" },
    });
    expect(calls.map((c) => c.name)).toEqual(["search_creators", "get_similar_creators"]);
    const out = res.structuredContent as {
      creators: Array<{ username: string; foundBy: string; id: string }>;
      foundBoth: number;
    };
    expect(out.creators).toHaveLength(3);
    // Agreement between the two searches is the strongest signal in this
    // payload, so it is recorded rather than deduplicated away — and it leads.
    expect(out.creators[0].username).toBe("both");
    expect(out.creators[0].foundBy).toBe("both");
    expect(out.foundBoth).toBe(1);
    expect(out.creators[0].id).toBe("creator:tiktok:both");
  });

  it("says plainly that it did not measure audience overlap", async () => {
    const { client } = await connect(backend);
    const res = await client.callTool({ name: "who_should_i_work_with", arguments: { niche: "gym" } });
    const out = res.structuredContent as { audienceOverlap: { attempted: boolean; howTo: string } };
    // The differentiating signal is not affordable at this budget, and a faked
    // one would be worse than an absent one.
    expect(out.audienceOverlap.attempted).toBe(false);
    expect(out.audienceOverlap.howTo).toContain("answer_my_audience");
    const guidance = String((res.content as Array<{ text: string }>)[0].text);
    expect(guidance).toMatch(/overlap/i);
    expect(guidance).toMatch(/not here/i);
  });

  it("keeps the half that answered when the other refuses", async () => {
    const { client } = await connect({
      ...backend,
      get_similar_creators: () => {
        throw new Error("no similar-user endpoint on this platform");
      },
    });
    const res = await client.callTool({
      name: "who_should_i_work_with",
      arguments: { niche: "gym", seed: "anchor" },
    });
    expect(res.isError).toBeFalsy();
    const out = res.structuredContent as { creators: unknown[]; unavailable: Array<{ via: string }> };
    expect(out.creators).toHaveLength(2);
    expect(out.unavailable[0].via).toBe("get_similar_creators");
  });
});

describe("what_should_i_make_next", () => {
  const backend: Backend = {
    get_user_posts: () =>
      feed([
        {
          id: "1", platform: "tiktok", externalUrl: "https://www.tiktok.com/@a/video/1",
          views: 500, hashtags: ["#homegym", "#fitness"],
        },
        {
          id: "2", platform: "tiktok", externalUrl: "https://www.tiktok.com/@a/video/2",
          views: 700, hashtags: ["#homegym"],
        },
      ]),
    get_post_comments: () => ({
      comments: [
        { text: "please make a video on resistance bands", author: "@ana", likes: 40 },
        { text: "nice", author: "@bo", likes: 1 },
      ],
      themes: [{ keyword: "bands", count: 3 }],
      mcpCredits: { cost: 2 },
    }),
    discover_social_posts: () =>
      feed([{ id: "n1", platform: "tiktok", title: "dumbbell routine", views: 90_000 }]),
  };

  it("returns demand and supply together, each traceable to its source", async () => {
    const { client, calls } = await connect(backend);
    const res = await client.callTool({
      name: "what_should_i_make_next",
      arguments: { username: "a", niche: "home gym" },
    });
    expect(calls.map((c) => c.name)).toEqual([
      "get_user_posts",
      "get_post_comments",
      "get_post_comments",
      "discover_social_posts",
    ]);
    const out = res.structuredContent as {
      demand: Array<{ postId: string; comments: Array<{ id: string; asking: boolean; text: string }>; themes: unknown[] }>;
      supply: unknown[];
      askCount: number;
      supplyBaseline: unknown;
      yourBaseline: unknown;
    };
    expect(out.demand).toHaveLength(2);
    // The ask leads, and it carries an id an idea can be quoted against.
    expect(out.demand[0].comments[0].asking).toBe(true);
    expect(out.demand[0].comments[0].id).toMatch(/^comment:tiktok:1:/);
    expect(out.askCount).toBe(2);
    expect(out.supply).toHaveLength(1);
    // The platform's own clustering was already fetched and already paid for.
    expect(out.demand[0].themes).toHaveLength(1);
    // Two posts is below the floor for a distribution, so both are null rather
    // than a median invented from two numbers.
    expect(out.supplyBaseline).toBeNull();
    expect(out.yourBaseline).toBeNull();
  });

  it("names the niche from the creator's own hashtags when nobody gave one", async () => {
    const { client, calls } = await connect(backend);
    const res = await client.callTool({ name: "what_should_i_make_next", arguments: { username: "a" } });
    const out = res.structuredContent as { niche: string; nicheSource: string };
    expect(out.niche).toBe("homegym");
    expect(out.nicheSource).toBe("hashtags");
    expect(calls.find((c) => c.name === "discover_social_posts")!.args.niche).toBe("homegym");
    // And the guess is declared, so the model can check it before trusting it.
    expect(String((res.content as Array<{ text: string }>)[0].text)).toMatch(/hashtag this creator uses most/i);
  });

  it("skips the sweep rather than guessing when there is nothing to infer from", async () => {
    const { client, calls } = await connect({
      ...backend,
      get_user_posts: () => feed([{ id: "1", platform: "tiktok", externalUrl: "https://www.tiktok.com/@a/video/1" }]),
    });
    const res = await client.callTool({ name: "what_should_i_make_next", arguments: { username: "a" } });
    expect(calls.some((c) => c.name === "discover_social_posts")).toBe(false);
    const out = res.structuredContent as { niche: null; unavailable: Array<{ via: string }> };
    expect(out.niche).toBeNull();
    expect(out.unavailable[0].via).toBe("discover_social_posts");
  });

  it("keeps the demand half when the sweep fails", async () => {
    const { client } = await connect({
      ...backend,
      discover_social_posts: () => {
        throw new Error("the niche search timed out");
      },
    });
    const res = await client.callTool({
      name: "what_should_i_make_next",
      arguments: { username: "a", niche: "gym" },
    });
    expect(res.isError).toBeFalsy();
    const out = res.structuredContent as { demand: unknown[]; supply: unknown[]; unavailable: unknown[] };
    expect(out.demand).toHaveLength(2);
    expect(out.supply).toEqual([]);
    expect(out.unavailable).toHaveLength(1);
  });
});

describe("show_audience_replies", () => {
  const drafted = {
    username: "@a",
    summary: "Mostly people asking about the edit.",
    replies: [
      {
        id: "comment:tiktok:1:habc",
        comment: "how do you edit these?",
        author: "ana",
        likes: 4,
        postUrl: "https://www.tiktok.com/@a/video/1",
        postTitle: "one",
        draft: "CapCut, and the b-roll is shot on the same phone.",
        kind: "answer" as const,
      },
      {
        id: "comment:tiktok:2:hdef",
        comment: "when is part 2?",
        author: "cy",
        postUrl: "https://www.tiktok.com/@a/video/2",
        draft: "Filming it this week.",
        kind: "pin" as const,
      },
      {
        id: "comment:tiktok:2:hxyz",
        comment: "buy followers here",
        author: "spam",
        postUrl: "https://www.tiktok.com/@a/video/2",
        kind: "ignore" as const,
      },
    ],
    themes: ["editing"],
    nextSteps: ["film part 2"],
  };

  it("costs nothing and reaches nothing", async () => {
    const { client, calls } = await connect({});
    const res = await client.callTool({ name: "show_audience_replies", arguments: drafted });
    expect(calls, "a display tool must not make requests").toEqual([]);
    expect((res.structuredContent as { mcpCredits: { cost: number } }).mcpCredits.cost).toBe(0);
  });

  it("groups the rows under the post a person will open", async () => {
    const { client } = await connect({});
    const res = await client.callTool({ name: "show_audience_replies", arguments: drafted });
    const out = res.structuredContent as {
      term: string;
      byCategory: Row;
      drafted: number;
      threads: Array<{ post: { platform: string; externalUrl: string }; mentions: Row[] }>;
    };
    expect(out.term).toBe("@a");
    expect(out.threads).toHaveLength(2);
    expect(out.threads[1].mentions).toHaveLength(2);
    expect(out.threads[0].post.platform).toBe("tiktok");
    // The chips a person triages by, and the count that is actually actionable.
    expect(out.byCategory).toEqual({ answer: 1, pin: 1, ignore: 1 });
    expect(out.drafted).toBe(2);
  });

  it("carries the id and the draft onto the row", async () => {
    const { client } = await connect({});
    const res = await client.callTool({ name: "show_audience_replies", arguments: drafted });
    const first = (res.structuredContent as { threads: Array<{ mentions: Row[] }> }).threads[0].mentions[0];
    // The id is the join back to a real comment; the draft has to be on the
    // row, in `note`, because that is the field the view draws under the text.
    expect(first.id).toBe("comment:tiktok:1:habc");
    expect(first.note).toContain("CapCut");
    expect(first.category).toBe("answer");
  });

  it("does not suggest anything was sent", async () => {
    const { client } = await connect({});
    const res = await client.callTool({ name: "show_audience_replies", arguments: drafted });
    const text = String((res.content as Array<{ text: string }>)[0].text);
    expect(text).toMatch(/nothing here posts them/i);
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "show_audience_replies")!;
    expect(tool.description).toMatch(/does not send/i);
    // It fetches nothing, so a host should never gate it as an outside call.
    expect(tool.annotations?.openWorldHint).toBe(false);
  });
});

describe("the arithmetic on its own", () => {
  it("takes the middle of an odd list and the mean of the middle two", () => {
    expect(median([300, 100, 200])).toBe(200);
    expect(median([100, 200, 300, 400])).toBe(250);
    expect(median([])).toBe(0);
  });

  /**
   * The median rather than the mean, and this is why: one breakout drags a
   * mean above every post that produced it, so "what happens when this account
   * posts normally" would come out as a number nothing normal ever hit.
   */
  it("is not dragged around by a single breakout", () => {
    const posts = [100, 120, 140, 160, 10_000];
    const mean = posts.reduce((a, b) => a + b, 0) / posts.length;
    expect(median(posts)).toBe(140);
    expect(mean).toBeGreaterThan(2000);
  });

  it("refuses to call two numbers a distribution", () => {
    expect(distributionOf([1, 2])).toBeNull();
    expect(distributionOf([1, 2, 3])).not.toBeNull();
  });

  it("admits it has no answer when the median is zero", () => {
    // Accounts whose stats the platform withholds. Dividing by that would put
    // a "breakout" badge on a post nobody can measure.
    const out = standing(5, [0, 0, 0, 0]);
    expect(out.ratio).toBeNull();
    expect(out.verdict).toBe("no_baseline");
    expect(Number.isFinite(out.value)).toBe(true);
  });

  it("takes a post out of its own baseline however the caller spelled it", () => {
    const posts = [
      { externalUrl: "https://www.tiktok.com/@a/video/1", views: 1 },
      { externalUrl: "https://www.tiktok.com/@a/video/2", views: 2 },
    ];
    // Trailing slash, tracking query, and the www — three spellings of one post.
    expect(excluding(posts, { url: "https://tiktok.com/@a/video/1/?is_from_webapp=1" })).toHaveLength(1);
    // YouTube is the exception: dropping the query would drop the video id.
    const yt = [
      { externalUrl: "https://www.youtube.com/watch?v=aaa" },
      { externalUrl: "https://www.youtube.com/watch?v=bbb" },
    ];
    expect(excluding(yt, { url: "https://www.youtube.com/watch?v=aaa&t=30" })).toHaveLength(1);
    // And an id when there is no URL to compare.
    expect(excluding(posts.map((p, i) => ({ ...p, id: `p${i}` })), { id: "p0" })).toHaveLength(1);
  });

  it("reads a date however the platform spelled it, and nothing when it did not", () => {
    expect(postDate({ postedAt: "2026-03-01T00:00:00Z" })).toBe("2026-03-01T00:00:00.000Z");
    // Epoch seconds are as common as ISO strings.
    expect(postDate({ createTime: 1_772_000_000 })).toBe(new Date(1_772_000_000_000).toISOString());
    expect(postDate({ title: "no date here" })).toBeNull();
  });

  it("keeps an undated post rather than dropping it from a window", () => {
    const out = applySince(
      [{ postedAt: "2020-01-01T00:00:00Z" }, { postedAt: "2026-06-01T00:00:00Z" }, { title: "undated" }],
      "2026-01-01",
    );
    // It cannot be proven outside the window, and dropping it would quietly
    // shrink an answer for a reason the reader never sees.
    expect(out.posts).toHaveLength(2);
    expect(out.undated).toBe(1);
    expect(out.applied).toBe(true);
  });

  it("throws away a comment date that is indistinguishable from now", () => {
    expect(trustedCommentDate(new Date().toISOString())).toBeNull();
    expect(trustedCommentDate("2026-01-01T00:00:00Z")).toBe("2026-01-01T00:00:00.000Z");
    expect(trustedCommentDate(null)).toBeNull();
    expect(trustedCommentDate("not a date")).toBeNull();
  });

  it("flags a question and leaves praise alone", () => {
    expect(replySignals("how do you edit these?").length).toBeGreaterThan(0);
    expect(replySignals("please make a part 2")).toContain("asks for something to be made");
    expect(replySignals("the checkout is broken")).toContain("reports something broken");
    expect(replySignals("this is great")).toEqual([]);
    // "cannot" is not "can", which is the kind of thing a word-boundary test
    // gets wrong when it is written without one.
    expect(replySignals("cannot believe this")).toEqual([]);
  });
});
