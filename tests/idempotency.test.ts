/**
 * The tool-call idempotency key.
 *
 * A dropped stream mid-`tools/call` leaves the client with no answer, so it
 * retries the same JSON-RPC id and we replay the stored result rather than
 * charging twice. That only works if the key identifies the *call* — keying on
 * the id and tool name alone made two different calls collide, because clients
 * reuse ids across a session. Searching a niche on TikTok and then asking for
 * the same on Instagram replayed the TikTok answer verbatim.
 */
import { describe, it, expect } from "vitest";
import { requestKey } from "../cloudflare/src/endpoint.js";

const call = (id: number | string, name: string, args: unknown) =>
  JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });

describe("tool-call idempotency key", () => {
  it("separates the same tool called with different arguments", () => {
    const tiktok = requestKey(call(2, "discover_social_posts", { niche: "fitness", platform: "tiktok" }));
    const instagram = requestKey(call(2, "discover_social_posts", { niche: "fitness", platform: "instagram" }));
    expect(tiktok).toBeDefined();
    expect(instagram).not.toBe(tiktok);
  });

  it("still replays a genuine retry — same id, same arguments", () => {
    const args = { niche: "fitness", platform: "tiktok", limit: 6 };
    expect(requestKey(call(7, "discover_social_posts", args)))
      .toBe(requestKey(call(7, "discover_social_posts", args)));
  });

  it("treats re-serialised arguments as the same call", () => {
    // A retry may serialise the same object with its keys in another order.
    const a = JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call",
      params: { name: "t", arguments: { niche: "fitness", platform: "tiktok" } } });
    const b = JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call",
      params: { name: "t", arguments: { platform: "tiktok", niche: "fitness" } } });
    expect(requestKey(a)).toBe(requestKey(b));
  });

  it("separates different tools and different ids", () => {
    const args = { url: "https://tiktok.com/@u/video/1" };
    expect(requestKey(call(1, "analyze_post", args))).not.toBe(requestKey(call(1, "get_social_media", args)));
    expect(requestKey(call(1, "analyze_post", args))).not.toBe(requestKey(call(2, "analyze_post", args)));
  });

  it("ignores notifications and batches", () => {
    expect(requestKey(JSON.stringify({ jsonrpc: "2.0", method: "x" }))).toBeUndefined();
    expect(requestKey(JSON.stringify([{ jsonrpc: "2.0", id: 1 }]))).toBeUndefined();
    expect(requestKey("")).toBeUndefined();
    expect(requestKey("not json")).toBeUndefined();
  });
});
