import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { proxyUrls } from "../src/shared/tools.js";

const API = "https://api.nooticr.com";

/**
 * A post as the Rust server emits it: a permalink, a platform embed, a raw
 * CDN thumbnail, and the signed resolve links the player falls back to.
 */
function post() {
 return {
  platform: "bilibili",
  externalUrl: "https://www.bilibili.com/video/BV1n54U6GEbE",
  embedUrl: "https://player.bilibili.com/player.html?bvid=BV1n54U6GEbE",
  thumbnailUrl: "https://i1.hdslb.com/bfs/archive/cd5e.jpg",
  videoFallbackUrl: `${API}/media/resolve?url=https%3A%2F%2Fwww.bilibili.com%2Fvideo%2FBV1n54U6GEbE&kind=video&sig=abc`,
  thumbnailFallbackUrl: `${API}/media/resolve?url=https%3A%2F%2Fwww.bilibili.com%2Fvideo%2FBV1n54U6GEbE&kind=thumbnail&sig=def`,
 };
}

describe("structured URL rewriting", () => {
 let saved: string | undefined;
 beforeEach(() => {
  saved = process.env.NOOTICR_API_URL;
  process.env.NOOTICR_API_URL = API;
 });
 afterEach(() => {
  if (saved === undefined) delete process.env.NOOTICR_API_URL;
  else process.env.NOOTICR_API_URL = saved;
 });

 it("leaves the permalink and the platform embed alone", () => {
  // These are opened as links / iframes, not fetched as images. Proxying
  // them sent "View on bilibili" through our image proxy.
  const out = proxyUrls(post()) as Record<string, string>;
  expect(out.externalUrl).toBe("https://www.bilibili.com/video/BV1n54U6GEbE");
  expect(out.embedUrl).toBe("https://player.bilibili.com/player.html?bvid=BV1n54U6GEbE");
 });

 it("does not wrap our own resolve links in the proxy", () => {
  // The double wrap that broke playback: /media/proxy?url=<our own resolver>.
  const out = proxyUrls(post()) as Record<string, string>;
  for (const field of ["videoFallbackUrl", "thumbnailFallbackUrl"]) {
   expect(out[field]).toBe((post() as Record<string, string>)[field]);
   expect(out[field]).not.toContain("/media/proxy");
  }
 });

 it("still proxies the external CDN thumbnail", () => {
  // The behaviour the rewriter exists for must survive the fix.
  const out = proxyUrls(post()) as Record<string, string>;
  expect(out.thumbnailUrl).toBe(
   `${API}/media/proxy?url=${encodeURIComponent("https://i1.hdslb.com/bfs/archive/cd5e.jpg")}`,
  );
 });

 it("does not re-wrap a resolve link minted against another host", () => {
  // The server may mint links against a base this process does not know;
  // a startsWith check on our own origin misses those and double-wraps.
  const out = proxyUrls({
   videoFallbackUrl: "https://nooticr.com/media/resolve?url=x&kind=video&sig=s",
   nested: { deep: "https://nooticr.com/media/proxy?url=y" },
  }) as Record<string, unknown>;
  expect(out.videoFallbackUrl).toBe("https://nooticr.com/media/resolve?url=x&kind=video&sig=s");
  expect((out.nested as Record<string, string>).deep).toBe("https://nooticr.com/media/proxy?url=y");
 });
});
