import { describe, it, expect } from "vitest";
import { isWellKnown } from "../cloudflare/src/index.js";

/**
 * RFC 9728 §3.1 and RFC 8414 §3 both tell a client to build the metadata URL
 * by inserting the well-known segment BEFORE the resource path. A client that
 * knows the resource is `https://mcp.nooticr.com/mcp` therefore asks for
 * `/.well-known/oauth-protected-resource/mcp`.
 *
 * We matched the bare root form only, so that 404'd — 75 times in a week from
 * `undici`, the MCP TypeScript SDK's own fetch (#65).
 */
describe("well-known discovery paths", () => {
  const RESOURCE = "/.well-known/oauth-protected-resource";
  const AUTH = "/.well-known/oauth-authorization-server";

  it("serves the path-inserted form the RFCs tell clients to construct", () => {
    expect(isWellKnown(`${RESOURCE}/mcp`, RESOURCE)).toBe(true);
    expect(isWellKnown(`${AUTH}/mcp`, AUTH)).toBe(true);
    // A deeper resource path is the same construction, one segment further.
    expect(isWellKnown(`${RESOURCE}/mcp/v1`, RESOURCE)).toBe(true);
  });

  it("still serves the bare root form", () => {
    // The 401 challenge's WWW-Authenticate points here, and connectors that
    // hit the challenge first have always used it. Breaking this to fix the
    // other would trade one broken path for another.
    expect(isWellKnown(RESOURCE, RESOURCE)).toBe(true);
    expect(isWellKnown(AUTH, AUTH)).toBe(true);
  });

  it("does not match a different document that merely shares a prefix", () => {
    // Why this is a segment check and not `startsWith`. These are other
    // documents — or nothing at all — and answering them with our metadata
    // would be worse than the 404 they should get.
    expect(isWellKnown(`${RESOURCE}-of-somebody-else`, RESOURCE)).toBe(false);
    expect(isWellKnown(`${AUTH}x`, AUTH)).toBe(false);
    expect(isWellKnown("/.well-known/oauth-protected-resourceX", RESOURCE)).toBe(false);
  });

  it("does not match a shorter or unrelated path", () => {
    expect(isWellKnown("/.well-known", RESOURCE)).toBe(false);
    expect(isWellKnown("/mcp", RESOURCE)).toBe(false);
    expect(isWellKnown("", RESOURCE)).toBe(false);
  });

  it("keeps the two documents distinct from each other", () => {
    // They are served by different branches and carry different bodies; a
    // matcher loose enough to confuse them would serve the wrong one.
    expect(isWellKnown(`${AUTH}/mcp`, RESOURCE)).toBe(false);
    expect(isWellKnown(`${RESOURCE}/mcp`, AUTH)).toBe(false);
  });
});
