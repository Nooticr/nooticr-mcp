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
import { argumentsDigest } from "../src/shared/tools.js";

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

/**
 * The same flaw existed one layer down, in the billing key.
 *
 * The server namespaces the reference by tool name, but the worker supplied
 * only `${session}:${requestId}` — so two calls to the same tool that shared a
 * JSON-RPC id shared one charge, and the second ran free. It was masked while
 * the replay cache collided first; fixing that exposed it.
 */
describe("arguments digest", () => {
  it("distinguishes calls that differ only in their arguments", () => {
    expect(argumentsDigest({ niche: "fitness", platform: "tiktok" }))
      .not.toBe(argumentsDigest({ niche: "fitness", platform: "instagram" }));
  });

  it("is stable for the same arguments, whatever the key order", () => {
    expect(argumentsDigest({ a: 1, b: [2, { c: 3 }] }))
      .toBe(argumentsDigest({ b: [2, { c: 3 }], a: 1 }));
  });

  it("handles the argument-less tools without throwing", () => {
    expect(argumentsDigest(undefined)).toBe(argumentsDigest(null));
    expect(argumentsDigest({})).toBeTypeOf("string");
  });

  it("notices a changed value anywhere in the arguments", () => {
    const base = { url: "https://tiktok.com/@u/video/1", count: 3 };
    expect(argumentsDigest(base)).not.toBe(argumentsDigest({ ...base, count: 4 }));
    expect(argumentsDigest(base)).not.toBe(
      argumentsDigest({ ...base, url: "https://tiktok.com/@u/video/2" }));
  });
});

/**
 * Browser clients (claude.ai adding a custom connector) could not complete the
 * handshake: the worker set access-control-allow-origin but never
 * access-control-expose-headers, so page scripts could not read the response
 * headers the protocol depends on. allow-headers does not cover this — that
 * governs what the browser may send, not what it may read back.
 */
describe("CORS exposure for browser MCP clients", () => {
  it("exposes the headers the protocol depends on", async () => {
    const { MCP_EXPOSED_HEADERS } = await import("../cloudflare/src/index.js");
    const exposed = MCP_EXPOSED_HEADERS.split(",").map((h) => h.trim().toLowerCase());
    // Streamable HTTP carries the session here; without it there is no session.
    expect(exposed).toContain("mcp-session-id");
    // The 401 points at the authorisation server through this one; without it
    // the client cannot discover where to log in.
    expect(exposed).toContain("www-authenticate");
    expect(exposed).toContain("mcp-protocol-version");
  });
});
