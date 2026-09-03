/**
 * Evidence mode across every AI tool.
 *
 * Each of these fetches something from a platform and then has Gemini read it.
 * Only the first half is expensive to us; the second is text over text, which
 * the calling model does better and steers itself. So every one of them can
 * now hand back the material instead of a conclusion.
 *
 * Two things are asserted that matter more than the plumbing: that evidence
 * mode makes the **cheap** upstream call rather than the expensive one, and
 * that the visual tools deliver frames as real image content blocks — the
 * thing a text model could not previously substitute for, and which a probe
 * measured at ~1,212 tokens per frame with eight read back correctly.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { EVIDENCE_PLANS, NO_EVIDENCE_MODE } from "../src/shared/evidence.js";
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
      // The AI path — the expensive one evidence mode must avoid.
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

describe("every AI tool can hand back its evidence", () => {
  it("covers the whole AI surface, minus the one with nothing to fetch", () => {
    expect(TOOLS.length).toBe(10);
    // score_draft reviews text the caller already has: an evidence mode there
    // would be a paid call returning the caller's own input.
    expect(NO_EVIDENCE_MODE).toContain("score_draft");
    expect(TOOLS).not.toContain("score_draft");
  });

  it.each(TOOLS)("%s makes the cheap call, not the AI one", async (tool) => {
    const { client, calls } = await connect();
    const res = await client.callTool(
      { name: tool, arguments: { ...ARGS[tool], mode: "evidence" } },
      undefined,
      { timeout: 30_000 },
    );
    expect(res.isError, JSON.stringify(res.content)).toBeFalsy();
    // The whole economic point: it must never reach the tool's own AI path.
    expect(calls.map((c) => c.name), `${tool} called its own AI path`).not.toContain(tool);
    expect(calls[0].name).toBe(EVIDENCE_PLANS[tool].via);
  });

  // analyze_post reaches the backend through startVideoAnalysis rather than
  // callTool, which is exactly why its evidence branch has to sit before
  // everything else in the handler — asserted separately below.
  it.each(TOOLS.filter((t) => t !== "analyze_post"))(
    "%s still runs the AI path by default",
    async (tool) => {
      const { client, calls } = await connect();
      await client.callTool({ name: tool, arguments: ARGS[tool] }, undefined, { timeout: 30_000 });
      // These are registered as task tools: the work continues past the
      // response, so the backend call can land just after it.
      for (let i = 0; i < 60 && !calls.some((c) => c.name === tool); i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
      // Nothing existing changes for a caller that does not ask for evidence.
      expect(calls.map((c) => c.name)).toContain(tool);
    },
  );

  it("analyze_post never starts a video analysis in evidence mode", async () => {
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
      { name: "analyze_post", arguments: { url: "https://x/1", mode: "evidence" } },
      undefined,
      { timeout: 30_000 },
    );
    // The expensive path is a video job that costs 6 credits and minutes of
    // wall clock. Evidence mode must not start one.
    expect(started, "evidence mode started a video analysis").toBe(0);
    expect((res.content as Array<{ type: string }>).filter((b) => b.type === "image")).toHaveLength(1);
  });

  it.each(TOOLS)("%s tells the caller what to produce", async (tool) => {
    const { client } = await connect();
    const res = await client.callTool(
      { name: tool, arguments: { ...ARGS[tool], mode: "evidence" } },
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
        { name: tool, arguments: { url: "https://www.youtube.com/watch?v=abc", mode: "evidence" } },
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
      { name: "analyze_post", arguments: { url: "https://x/1", mode: "evidence" } },
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
      { name: "analyze_post", arguments: { url: "https://x/1", mode: "evidence" } },
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
      { name: "analyze_post", arguments: { url: "https://x/1", mode: "evidence" } },
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
      { name: "analyze_post", arguments: { url: "https://x/1", mode: "evidence" } },
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
