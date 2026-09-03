/**
 * Comment analysis moved to the model that called us.
 *
 * `analyze_comments` sends a comment section to Gemini and returns Gemini's
 * opinion for 6 credits. The reading is text over text — the model already
 * holding the conversation does it better and costs us nothing. What is worth
 * charging for is the fetch.
 *
 * Two things are asserted here that matter more than the plumbing: that
 * evidence mode makes the *cheap* upstream call rather than the expensive one,
 * and that the ids it hands out survive the round trip, since a classification
 * that cannot point back at a comment is not actionable.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import {
  COMMENT_CATEGORIES,
  commentId,
  platformFromUrl,
  postSlug,
  toEvidence,
} from "../src/shared/comment-review.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

const URL_ = "https://www.youtube.com/watch?v=7wrjbQDxqkM";
const RAW = [
  { text: "the checkout button does nothing on iOS 18", author: "@ana", likes: 12 },
  { text: "genuinely the best release yet", author: "@bo", likes: 40 },
  { text: "", author: "@empty", likes: 0 },
];

async function connect() {
  const calls: Array<{ name: string; args: unknown }> = [];
  const nooticr = {
    me: async () => ({ id: "u1" }),
    callTool: async (name: string, args: unknown) => {
      calls.push({ name, args });
      if (name === "get_post_comments") {
        return {
          contentBlocks: [],
          structured: {
            platform: "youtube",
            comments: RAW,
            themes: [{ keyword: "checkout", count: 3 }],
            mcpCredits: { cost: 2 },
          },
        };
      }
      return { contentBlocks: [], structured: { summary: "gemini says things", mcpCredits: { cost: 6 } } };
    },
  } as unknown as NooticrClient;
  const client = new Client({ name: "test", version: "1.0.0" });
  const server = createMcpServer(async () => nooticr);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  await client.listTools();
  return { client, calls };
}

describe("evidence mode", () => {
  it("makes the cheap call, not the expensive one", async () => {
    const { client, calls } = await connect();
    const res = await client.callTool({
      name: "analyze_comments",
      arguments: { url: URL_, mode: "evidence" },
    });
    // The whole economic point: same upstream fetch as get_post_comments, so
    // it bills as the data call it is rather than as an AI one.
    expect(calls.map((c) => c.name)).toEqual(["get_post_comments"]);
    const out = res.structuredContent as Record<string, unknown>;
    expect(out.mode).toBe("evidence");
    expect((out.mcpCredits as { cost: number }).cost).toBe(2);
  });

  it("still runs the AI path by default, so nothing existing changes", async () => {
    const { client, calls } = await connect();
    const res = await client.callTool({ name: "analyze_comments", arguments: { url: URL_ } });
    expect(calls.map((c) => c.name)).toEqual(["analyze_comments"]);
    expect((res.structuredContent as { summary?: string }).summary).toBe("gemini says things");
  });

  it("hands back comments with addressable ids", async () => {
    const { client } = await connect();
    const res = await client.callTool({
      name: "analyze_comments",
      arguments: { url: URL_, mode: "evidence" },
    });
    const out = res.structuredContent as { comments: Array<{ id: string; text: string }> };
    // The empty comment is dropped: an id pointing at nothing is worse than
    // no id, and the model would waste a label on it.
    expect(out.comments).toHaveLength(2);
    expect(out.comments[0].id).toMatch(/^comment:/);
    expect(new Set(out.comments.map((c) => c.id)).size).toBe(2);
    expect(out.comments[0].text).toContain("checkout button");
  });

  it("tells the caller what to produce, in the text the model actually reads", async () => {
    const { client } = await connect();
    const res = await client.callTool({
      name: "analyze_comments",
      arguments: { url: URL_, mode: "evidence" },
    });
    const guidance = String((res.content as Array<{ text: string }>)[0].text);
    // Prose cannot be rendered, filtered or counted. Naming the shape is what
    // turns the answer into something a person can sort.
    for (const category of COMMENT_CATEGORIES) expect(guidance).toContain(category);
    expect(guidance).toMatch(/sentiment/i);
    expect(guidance).toContain("show_comment_review");
    // And an instruction not to bluff, because a confident wrong label here is
    // worse than an honest vague one.
    expect(guidance).toMatch(/ambiguous/i);
  });

  it("passes the platform's own clustering through rather than dropping it", async () => {
    const { client } = await connect();
    const res = await client.callTool({
      name: "analyze_comments",
      arguments: { url: URL_, mode: "evidence" },
    });
    // Already fetched and already paid for; it is evidence too.
    expect((res.structuredContent as { themes: unknown[] }).themes).toHaveLength(1);
  });
});

describe("showing what the model concluded", () => {
  const classified = {
    url: URL_,
    title: "Why did nike lose 200B",
    summary: "Mostly negative; one clear bug.",
    comments: [
      {
        id: "comment:v=7wrjbQDxqkM:0",
        text: "the checkout button does nothing on iOS 18",
        author: "ana",
        likes: 12,
        sentiment: "negative" as const,
        category: "bug_report" as const,
      },
      {
        id: "comment:v=7wrjbQDxqkM:1",
        text: "genuinely the best release yet",
        author: "bo",
        likes: 40,
        sentiment: "positive" as const,
        category: "praise" as const,
      },
    ],
    themes: ["checkout"],
    nextSteps: ["file the iOS 18 checkout bug"],
  };

  it("costs nothing and reaches nothing", async () => {
    const { client, calls } = await connect();
    const res = await client.callTool({ name: "show_comment_review", arguments: classified });
    // It draws what it was given. Everything it needs is already in context.
    expect(calls, "a display tool must not make requests").toEqual([]);
    expect((res.structuredContent as { mcpCredits: { cost: number } }).mcpCredits.cost).toBe(0);
  });

  it("rolls the labels up into counts a reader can filter by", async () => {
    const { client } = await connect();
    const res = await client.callTool({ name: "show_comment_review", arguments: classified });
    const out = res.structuredContent as Record<string, Record<string, number>>;
    expect(out.byCategory).toEqual({ bug_report: 1, praise: 1 });
    expect(out.bySentiment).toEqual({ negative: 1, positive: 1 });
  });

  it("emits the shape the monitoring view already renders", async () => {
    const { client } = await connect();
    const res = await client.callTool({ name: "show_comment_review", arguments: classified });
    const out = res.structuredContent as {
      term: string;
      threads: Array<{ post: { platform: string }; mentions: Array<Record<string, unknown>> }>;
    };
    // term + threads is what the view keys off, so one view serves both a
    // brand sweep and a review rather than needing a second.
    expect(out.term).toBe("Why did nike lose 200B");
    expect(out.threads[0].post.platform).toBe("youtube");
    expect(out.threads[0].mentions[0].category).toBe("bug_report");
    // The id is carried through, so a row still addresses a real comment.
    expect(out.threads[0].mentions[0].id).toBe("comment:v=7wrjbQDxqkM:0");
  });

  it("is declared read-only and closed-world", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "show_comment_review")!;
    expect(tool.annotations?.readOnlyHint).toBe(true);
    // It fetches nothing, so a host should never gate it as an outside call.
    expect(tool.annotations?.openWorldHint).toBe(false);
  });
});

describe("helpers", () => {
  it("labels the row's network from the URL", () => {
    expect(platformFromUrl("https://www.youtube.com/watch?v=1")).toBe("youtube");
    expect(platformFromUrl("https://www.reddit.com/r/x/comments/1/t/")).toBe("reddit");
    expect(platformFromUrl("https://weibo.com/1/A")).toBe("weibo");
    // A miss costs a grey badge, not a failed call.
    expect(platformFromUrl("https://example.com/x")).toBe("");
  });

  /**
   * The ids are the join between a comment and the label a model puts on it,
   * so two different posts must never mint the same one.
   */
  it("identifies a post by the part of the URL that identifies it", () => {
    // YouTube keeps the id in the query, so the last path segment is "watch"
    // for every video on the platform. Ids collided across posts until this
    // looked at ?v= — seen live, not hypothetically.
    expect(postSlug("https://www.youtube.com/watch?v=7wrjbQDxqkM")).toBe("7wrjbQDxqkM");
    expect(postSlug("https://www.youtube.com/watch?v=OTHER")).toBe("OTHER");
    expect(postSlug("https://www.tiktok.com/@u/video/12345")).toBe("12345");
    expect(postSlug("not a url")).toBe("post");
  });

  it("never mints the same id for two different posts", () => {
    const a = commentId("https://www.youtube.com/watch?v=aaa", 0);
    const b = commentId("https://www.youtube.com/watch?v=bbb", 0);
    expect(a).not.toBe(b);
    expect(a).toBe("comment:aaa:0");
  });

  it("reads a comment however the backend spelled the author", () => {
    const out = toEvidence("https://x/1", [
      { text: "a", author: "@one", likes: 3 },
      { text: "b", username: "two" },
    ]);
    expect(out.map((c) => c.author)).toEqual(["one", "two"]);
    expect(out[1].likes).toBe(0);
  });
});
