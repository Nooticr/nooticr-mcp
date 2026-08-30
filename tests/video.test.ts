import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { validateVideoUrl } from "../src/video.js";

describe("validateVideoUrl", () => {
  it("accepts tiktok.com URLs", () => {
    expect(validateVideoUrl("https://www.tiktok.com/@user/video/1234567890123456789")).toMatchObject({ ok: true });
  });

  it("accepts vm.tiktok.com shortlinks", () => {
    expect(validateVideoUrl("https://vm.tiktok.com/abc123/")).toMatchObject({ ok: true });
  });

  it("accepts instagram.com reels and posts", () => {
    expect(validateVideoUrl("https://www.instagram.com/reel/CxYz123AbCd/")).toMatchObject({ ok: true });
    expect(validateVideoUrl("https://www.instagram.com/p/CxYz123AbCd/")).toMatchObject({ ok: true });
  });

  it("accepts instagr.am shortlinks", () => {
    expect(validateVideoUrl("https://instagr.am/reel/CxYz123AbCd/")).toMatchObject({ ok: true });
  });

  it("accepts youtube.com, youtu.be and m.youtube.com", () => {
    expect(validateVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toMatchObject({ ok: true });
    expect(validateVideoUrl("https://youtube.com/watch?v=dQw4w9WgXcQ")).toMatchObject({ ok: true });
    expect(validateVideoUrl("https://youtu.be/dQw4w9WgXcQ")).toMatchObject({ ok: true });
    expect(validateVideoUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toMatchObject({ ok: true });
  });

  it("accepts youtube shorts", () => {
    expect(validateVideoUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toMatchObject({ ok: true });
  });

  it("accepts douyin, xiaohongshu and bilibili URLs", () => {
    expect(validateVideoUrl("https://www.douyin.com/video/7677619828777028916")).toMatchObject({ ok: true });
    expect(validateVideoUrl("https://www.xiaohongshu.com/explore/69d8ab670000000022003dbe")).toMatchObject({ ok: true });
    expect(validateVideoUrl("https://www.bilibili.com/video/BV1vqhw6yE23")).toMatchObject({ ok: true });
    expect(validateVideoUrl("https://b23.tv/abc123")).toMatchObject({ ok: true });
  });

  it("rejects unsupported hosts", () => {
    expect(validateVideoUrl("https://facebook.com/watch?v=123")).toMatchObject({
      ok: false,
      error: expect.stringContaining("not supported"),
    });
    expect(validateVideoUrl("https://twitter.com/x")).toMatchObject({ ok: false });
    expect(validateVideoUrl("https://pinterest.com/pin/123")).toMatchObject({ ok: false });
  });

  it("rejects malformed URLs", () => {
    expect(validateVideoUrl("not a url")).toMatchObject({ ok: false });
    expect(validateVideoUrl("")).toMatchObject({ ok: false });
    expect(validateVideoUrl("ftp://tiktok.com/video/1")).toMatchObject({ ok: false });
  });

  it("rejects non-strings", () => {
    expect(validateVideoUrl(undefined as unknown as string)).toMatchObject({ ok: false });
  });
});

/**
 * Internal accounting must not reach the model.
 *
 * The tool result carried appId, workspaceId and `cost`. The first two mean
 * nothing to a caller, and `cost` is the workspace-credit price of the
 * analysis job — a different currency from the MCP credits the tool is billed
 * in. Surfacing it made analyze_post look like it charged 10 when it charges 6.
 *
 * The shape is built inline rather than in an exported helper, so this reads
 * the source: crude, but it pins the one thing that matters.
 */
describe("analysis job result", () => {
  it("keeps internal accounting out of what the model sees", () => {
    const src = readFileSync(new URL("../src/shared/video.ts", import.meta.url), "utf8");
    const start = src.indexOf("result.job = {");
    const jobBlock = src.slice(start, src.indexOf("};", start));
    expect(start, "the job result block moved — update this test").toBeGreaterThan(-1);

    for (const leaked of ["appId", "workspaceId", "cost:"]) {
      expect(jobBlock, `${leaked} must not be surfaced`).not.toContain(leaked);
    }
    for (const kept of ["jobId", "state", "platform", "post"]) {
      expect(jobBlock).toContain(kept);
    }
  });
});
