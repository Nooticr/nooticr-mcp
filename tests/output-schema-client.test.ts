/**
 * Validation as a client performs it, which is not how the server performs it.
 *
 * The server checks structuredContent with Zod. The client checks it against
 * the JSON Schema generated from that same Zod schema, and the two are not the
 * same thing. `z.unknown()` inside a union serialises to an empty schema that
 * the converter drops, so `z.array(z.union([z.unknown(), z.null()]))` reached
 * clients as `items: { anyOf: [{ type: "null" }] }` — an array that accepts
 * null elements and nothing else. get_post_comments, analyze_comments and
 * score_draft all failed on the client while passing every server-side test I
 * had written, because every one of those tests called safeParse.
 *
 * So these go through a real Client over a real transport: the payload takes
 * the same path and meets the same validator it does in Claude and ChatGPT.
 * The fixtures are the shapes that actually broke — heterogeneous lists, and
 * nulls where a value was sampled.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

async function callWith(tool: string, args: Record<string, unknown>, structured: unknown) {
  const nooticr = {
    me: async () => ({ id: "u1" }),
    callTool: async () => ({ contentBlocks: [{ type: "text", text: "{}" }], structured }),
  } as unknown as NooticrClient;
  const client = new Client({ name: "test", version: "1.0.0" });
  const server = createMcpServer(async () => nooticr);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  // Not optional: the client builds its output validator from the cached
  // tools/list, so a test that calls a tool without listing first validates
  // nothing and passes on a schema no real client could read.
  await client.listTools();
  return client.callTool({ name: tool, arguments: args }, undefined, { timeout: 30_000 });
}

/** Real shapes, taken from live responses — including the ones that broke. */
const CASES: Array<[string, Record<string, unknown>, unknown]> = [
  // themes are objects, not strings. This is the exact payload that failed.
  [
    "get_post_comments",
    { url: "https://www.tiktok.com/@a/video/1" },
    {
      platform: "tiktok",
      url: "https://www.tiktok.com/@a/video/1",
      comments: [{ text: "great", author: "x", likes: 3 }],
      themes: [{ keyword: "lower back", count: 13 }, { keyword: "one day", count: 6 }],
      summary: "mostly positive",
      mcpCredits: { cost: 2 },
    },
  ],
  [
    "analyze_comments",
    { url: "https://www.tiktok.com/@a/video/1" },
    {
      themes: [{ keyword: "form", count: 9 }],
      commentsAnalyzed: 50,
      summary: "they want a beginner version",
      report: { objections: ["too advanced"] },
    },
  ],
  // Nothing upstream answers for this one any more: it returns the draft it
  // was handed, and the payload below is ignored. Kept as a case because the
  // declared schema still has to accept what the handler builds.
  [
    "score_draft",
    { draft: "x" },
    { draft: "x", platform: "tiktok" },
  ],
  // A slideshow: the nulls that broke discovery.
  [
    "discover_social_posts",
    { niche: "fitness" },
    {
      platform: "tiktok",
      posts: [
        { id: "1", contentType: "video", duration: 57, videoUrl: "https://x/a.mp4", views: 5 },
        { id: "2", contentType: "slideshow", videoUrl: null, duration: null, slideCount: null },
      ],
      mcpCredits: { cost: 2 },
    },
  ],
  [
    "compare_posts",
    { urls: ["https://x/1", "https://x/2"] },
    {
      posts: [{ id: "1" }, { id: "2" }],
      failed: [],
      analyzed: 2,
      comparison: {
        winner: 1,
        winnerReason: "educational",
        differences: [{ factor: "Length", detail: "57s vs 16s" }],
        lessons: ["explicit CTA lifts comments"],
        nextTest: "hybrid",
      },
    },
  ],
  [
    "get_post_transcript",
    { url: "https://www.tiktok.com/@a/video/1" },
    { available: false, transcript: null, wordCount: null, reason: "no caption track" },
  ],
  [
    "find_hook_pattern",
    { username: "a" },
    { username: "a", platform: "tiktok", postsAnalyzed: 5, report: { hooks: [{ type: "question" }] } },
  ],
  [
    "repurpose_post",
    { url: "https://x/1" },
    { sourceUrl: "https://x/1", post: { id: "1" }, repurposed: { linkedin: "…" } },
  ],
];

describe("a client can read what the server returns", () => {
  it.each(CASES)("%s", async (tool, args, structured) => {
    const res = await callWith(tool, args, structured);
    // A validation failure surfaces as a thrown McpError, not isError, so the
    // await above is the assertion. Check the payload survived intact too.
    expect(res.isError, JSON.stringify(res.content)).toBeFalsy();
    expect(res.structuredContent).toBeTruthy();
  });

  // The generated schema is the contract clients hold us to, so assert the
  // shape of it directly: an items rule that only admits null is the bug.
  it("never generates a list that admits nothing but null", async () => {
    const nooticr = { callTool: async () => ({ contentBlocks: [], structured: {} }) } as unknown as NooticrClient;
    const client = new Client({ name: "test", version: "1.0.0" });
    const server = createMcpServer(async () => nooticr);
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(a), server.connect(b)]);
    const { tools } = await client.listTools();
    const broken: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      const items = n.items as { anyOf?: Array<{ type?: string }> } | undefined;
      const anyOf = items?.anyOf;
      if (Array.isArray(anyOf) && anyOf.length === 1 && anyOf[0]?.type === "null") broken.push(path);
      for (const [k, v] of Object.entries(n)) walk(v, `${path}.${k}`);
    };
    for (const t of tools) walk(t.outputSchema, t.name);
    expect(broken, `these lists accept only null: ${broken.join(", ")}`).toEqual([]);
  });
});
