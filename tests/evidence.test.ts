/**
 * What every tool built on an evidence plan does — which is now all it does.
 *
 * Each of these used to fetch something from a platform and then have Gemini
 * read it. Only the first half was expensive to us; the second is text over
 * text, which the calling model does better and steers itself. So the second
 * half is gone: every one of them hands back the material and the instructions
 * for reading it, and there is no argument that asks for anything else.
 *
 * Two things are asserted that matter more than the plumbing: that a tool
 * makes the **cheap** upstream call and never its own expensive one, and that
 * the visual tools deliver frames as real image content blocks — the thing a
 * text model could not previously substitute for, and which a probe measured
 * at ~1,212 tokens per frame with eight read back correctly.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { EVIDENCE_PLANS, FETCHES_NOTHING, planCost } from "../src/shared/evidence.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

const FRAME = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQ==";

async function connect() {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const nooticr = {
    me: async () => ({ id: "u1" }),
    callTool: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "get_post_frames") {
        return { contentBlocks: [], structured: {
          url: args.url, platform: "youtube", contentType: "video", durationSeconds: 60,
          frameCount: 2,
          frames: [
            { data: FRAME, mimeType: "image/jpeg", atFraction: 0.25, atSeconds: 15 },
            { data: FRAME, mimeType: "image/jpeg", atFraction: 0.75, atSeconds: 45 },
          ],
          mcpCredits: { cost: 2 },
        } };
      }
      if (name === "get_post_transcript") {
        return { contentBlocks: [], structured: { available: true, transcript: "the words" } };
      }
      if (name === "get_social_media") {
        return { contentBlocks: [], structured: { post: { id: "1", caption: "hi" } } };
      }
      if (name === "get_user_posts") {
        return { contentBlocks: [], structured: { posts: [{ id: "1" }, { id: "2" }] } };
      }
      if (name === "discover_social_posts") {
        return { contentBlocks: [], structured: { posts: [{ id: "1" }] } };
      }
      // The AI path — the expensive one no tool here may reach.
      return { contentBlocks: [], structured: { analysis: { summary: "gemini says things" } } };
    },
  } as unknown as NooticrClient;
  const client = new Client({ name: "test", version: "1.0.0" });
  const server = createMcpServer(async () => nooticr);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  await client.listTools();
  return { client, calls };
}

/** Minimal valid arguments per tool, so the table below can drive itself. */
const ARGS: Record<string, Record<string, unknown>> = {
  analyze_post: { url: "https://www.youtube.com/watch?v=abc" },
  understand_social_post: { url: "https://www.youtube.com/watch?v=abc" },
  analyze_post_fast: { url: "https://www.youtube.com/watch?v=abc" },
  compare_posts: { urls: ["https://x/1", "https://x/2"] },
  analyze_creator_profile: { username: "nike" },
  find_hook_pattern: { username: "nike" },
  niche_report: { niche: "fitness" },
  write_hooks: { url: "https://x/1" },
  create_variants: { url: "https://x/1" },
  repurpose_post: { url: "https://x/1", targets: ["linkedin"] },
};

const TOOLS = Object.keys(EVIDENCE_PLANS);

describe("every tool hands back its evidence", () => {
  it("covers the whole surface, minus the one with nothing to fetch", () => {
    expect(TOOLS.length).toBe(10);
    // score_draft reviews text the caller already has: a plan there would be a
    // paid call returning the caller's own input, so it is free instead.
    expect(FETCHES_NOTHING).toContain("score_draft");
    expect(TOOLS).not.toContain("score_draft");
  });

  it.each(TOOLS)("%s makes the cheap call, not the AI one", async (tool) => {
    const { client, calls } = await connect();
    const res = await client.callTool(
      { name: tool, arguments: ARGS[tool] },
      undefined,
      { timeout: 30_000 },
    );
    expect(res.isError, JSON.stringify(res.content)).toBeFalsy();
    // The whole economic point: it must never reach the tool's own AI path.
    expect(calls.map((c) => c.name), `${tool} called its own AI path`).not.toContain(tool);
    expect(calls[0].name).toBe(EVIDENCE_PLANS[tool].via);
  });

  /**
   * The mode argument is gone, and `.strict()` is what makes that stick: a
   * caller who still sends `mode: "ai"` is told the argument does not exist
   * rather than quietly getting the evidence and believing it got an analysis.
   */
  it.each(TOOLS)("%s rejects the mode argument outright", async (tool) => {
    const { client, calls } = await connect();
    const res = await client.callTool(
      { name: tool, arguments: { ...ARGS[tool], mode: "ai" } },
      undefined,
      { timeout: 30_000 },
    );
    expect(res.isError, `${tool} accepted mode`).toBe(true);
    expect(calls, `${tool} spent money on a call it should have refused`).toHaveLength(0);
  });

  /**
   * The price in the description is derived from the plan, so this pins the
   * arithmetic rather than the sentence: a plan that grows a second fetch
   * doubles a caller's bill, and the number they read has to move with it.
   */
  it.each(TOOLS)("%s says what it costs, and the number is the plan's", async (tool) => {
    const { client } = await connect();
    const listed = (await client.listTools()).tools.find((t) => t.name === tool)!;
    expect(String(listed.description)).toContain(`${planCost(tool)} nooticr credit`);
  });

  it("analyze_post never starts a video analysis at all", async () => {
    let started = 0;
    const nooticr = {
      me: async () => ({ id: "u1" }),
      startVideoAnalysis: async () => {
        started += 1;
        return { jobId: "j1" };
      },
      callTool: async (name: string) => {
        if (name === "get_post_frames") {
          return { contentBlocks: [], structured: {
            frames: [{ data: FRAME, mimeType: "image/jpeg" }], frameCount: 1 } };
        }
        return { contentBlocks: [], structured: { available: true, transcript: "words" } };
      },
    } as unknown as NooticrClient;
    const client = new Client({ name: "test", version: "1.0.0" });
    const server = createMcpServer(async () => nooticr);
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(a), server.connect(b)]);
    await client.listTools();
    const res = await client.callTool(
      { name: "analyze_post", arguments: { url: "https://x/1" } },
      undefined,
      { timeout: 30_000 },
    );
    // The expensive path was a video job costing 6 credits and minutes of wall
    // clock. Nothing starts one now, and this is the assertion that would fail
    // if the handler ever reached for startVideoAnalysis again.
    expect(started, "a video analysis was started").toBe(0);
    expect((res.content as Array<{ type: string }>).filter((b) => b.type === "image")).toHaveLength(1);
  });

  it.each(TOOLS)("%s tells the caller what to produce", async (tool) => {
    const { client } = await connect();
    const res = await client.callTool(
      { name: tool, arguments: ARGS[tool] },
      undefined,
      { timeout: 30_000 },
    );
    const text = String((res.content as Array<{ text?: string }>)[0].text ?? "");
    // A tool result is the only channel to the calling model — prompts are
    // user-controlled and cannot drive anything — so the steering lives here.
    expect(text.length, `${tool} returned no guidance`).toBeGreaterThan(80);
    expect(text).toMatch(/yourself/i);
  });
});

describe("the visual tools return pixels", () => {
  it.each(["analyze_post", "understand_social_post"])(
    "%s delivers frames as image content blocks",
    async (tool) => {
      const { client } = await connect();
      const res = await client.callTool(
        { name: tool, arguments: { url: "https://www.youtube.com/watch?v=abc" } },
        undefined,
        { timeout: 30_000 },
      );
      const blocks = res.content as Array<{ type: string; data?: string; mimeType?: string }>;
      const images = blocks.filter((b) => b.type === "image");
      // Not base64 in a text block: a probe measured that path as unreadable
      // to the model, while real image blocks were read back correctly.
      expect(images).toHaveLength(2);
      expect(images[0].mimeType).toBe("image/jpeg");
      expect(images[0].data).toBe(FRAME);
      expect(blocks[0].type, "the instructions come first").toBe("text");
    },
  );

  it("says where each frame sits, so a caller can cite one", async () => {
    const { client } = await connect();
    const res = await client.callTool(
      { name: "analyze_post", arguments: { url: "https://x/1" } },
      undefined,
      { timeout: 30_000 },
    );
    const out = res.structuredContent as { frameIndex: Array<Record<string, unknown>> };
    expect(out.frameIndex).toEqual([
      { frame: 1, atSeconds: 15, atFraction: 0.25 },
      { frame: 2, atSeconds: 45, atFraction: 0.75 },
    ]);
  });

  it("does not repeat the base64 in the structured payload", async () => {
    const { client } = await connect();
    const res = await client.callTool(
      { name: "analyze_post", arguments: { url: "https://x/1" } },
      undefined,
      { timeout: 30_000 },
    );
    // The pixels went over as image blocks; sending them twice would double
    // the largest cost in the payload for nothing.
    expect((res.structuredContent as Record<string, unknown>).frames).toBeUndefined();
  });

  it("pairs the frames with the transcript", async () => {
    const { client, calls } = await connect();
    await client.callTool(
      { name: "analyze_post", arguments: { url: "https://x/1" } },
      undefined,
      { timeout: 30_000 },
    );
    // Frames and words are what "watching it" decomposes into.
    expect(calls.map((c) => c.name)).toEqual(["get_post_frames", "get_post_transcript"]);
  });

  it("still returns frames when the post has no captions", async () => {
    const nooticr = {
      me: async () => ({ id: "u1" }),
      callTool: async (name: string) => {
        if (name === "get_post_transcript") throw new Error("no caption track");
        if (name === "get_post_frames") {
          return { contentBlocks: [], structured: {
            frames: [{ data: FRAME, mimeType: "image/jpeg" }], frameCount: 1 } };
        }
        return { contentBlocks: [], structured: {} };
      },
    } as unknown as NooticrClient;
    const client = new Client({ name: "test", version: "1.0.0" });
    const server = createMcpServer(async () => nooticr);
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(a), server.connect(b)]);
    await client.listTools();
    const res = await client.callTool(
      { name: "analyze_post", arguments: { url: "https://x/1" } },
      undefined,
      { timeout: 30_000 },
    );
    // A silent film is still worth looking at; the second fetch is a bonus,
    // not a precondition.
    expect(res.isError).toBeFalsy();
    expect((res.content as Array<{ type: string }>).filter((b) => b.type === "image")).toHaveLength(1);
  });
});

describe("get_post_frames on its own", () => {
  it("returns the frames as images without any analysis tool", async () => {
    const { client } = await connect();
    const res = await client.callTool(
      { name: "get_post_frames", arguments: { url: "https://x/1", count: 2 } },
      undefined,
      { timeout: 30_000 },
    );
    const images = (res.content as Array<{ type: string }>).filter((b) => b.type === "image");
    expect(images).toHaveLength(2);
    expect((res.structuredContent as Record<string, unknown>).frames).toBeUndefined();
  });
});
