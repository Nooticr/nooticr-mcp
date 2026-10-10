import { describe, it, expect } from "vitest";
import { needsSessionStamp } from "../cloudflare/src/endpoint.js";

/**
 * The failure: `openai-mcp/1.0.0` sent a `tools/call` with no
 * `mcp-session-id`. That routes to a brand-new Durable Object, so the DO is
 * cold, `reInitialize()` completes a handshake, and the transport ends up
 * holding a session the client was never told about — which the SDK's session
 * validation rejects with 400 (#68).
 *
 * A dropped `tools/call` is a dropped METERED call, failing at the transport
 * layer where the host cannot tell it apart from a malformed request of its
 * own making.
 */
describe("a request that arrives without a session", () => {
  it("gets this DO's session stamped on, rather than a 400 we caused", () => {
    // The exact observed case.
    expect(needsSessionStamp(null, "tools/call")).toBe(true);
    // And every other non-initialize method, since the mismatch is the same.
    for (const m of ["tools/list", "resources/read", "notifications/initialized", "ping"]) {
      expect(needsSessionStamp(null, m), `${m} sessionless`).toBe(true);
    }
  });

  it("leaves initialize alone, because that one has no session by design", () => {
    // The SDK assigns the session during initialize. Stamping would take that
    // decision away from it and hand the client an id it did not negotiate.
    expect(needsSessionStamp(null, "initialize")).toBe(false);
  });

  it("never overrides a session the client actually sent", () => {
    // The cold-start path this sits next to exists for exactly this case: a
    // client that HAS a session, arriving at a redeployed DO. Its id is the
    // one that matters and must survive untouched.
    expect(needsSessionStamp("abc-123", "tools/call")).toBe(false);
    expect(needsSessionStamp("abc-123", "initialize")).toBe(false);
  });

  it("stamps a request whose method could not be read", () => {
    // A GET (the SSE stream) has no body to sniff a method from. Sessionless
    // is still sessionless, and the same 400 is waiting for it.
    expect(needsSessionStamp(null, null)).toBe(true);
    expect(needsSessionStamp(null, "")).toBe(true);
  });
});
