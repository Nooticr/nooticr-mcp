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
