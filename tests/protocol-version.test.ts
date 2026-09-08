import { describe, it, expect } from "vitest";
import { clampedProtocolVersion } from "../cloudflare/src/endpoint.js";

/**
 * The failure this prevents, measured over seven days of edge logs before the
 * fix: every POST carrying `MCP-Protocol-Version: 2026-07-28` was rejected 400
 * by the SDK's `validateProtocolVersion()` — before any method dispatch, so
 * those sessions never reached `tools/list`. 26.1% of Claude's authenticated
 * POSTs to `/mcp`, a clean 100% failure rate on that header value (#64).
 */
describe("negotiating a protocol version we do not speak", () => {
  it("clamps a newer version down instead of refusing the request", () => {
    // The exact value Claude's newer client sends.
    expect(clampedProtocolVersion("2026-07-28")).toBe("2025-11-25");
    // And anything beyond it, so the next bump does not need this test edited.
    expect(clampedProtocolVersion("2027-01-01")).toBe("2025-11-25");
    expect(clampedProtocolVersion("2025-11-26")).toBe("2025-11-25");
  });

  it("leaves a version the SDK already accepts completely alone", () => {
    // Rewriting these would be a no-op at best and a lie at worst — a client
    // that asked for 2025-06-18 negotiated that, and the SDK honours it.
    for (const ok of ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05", "2024-10-07"]) {
      expect(clampedProtocolVersion(ok), `${ok} is supported and must pass through`).toBeNull();
    }
  });

  it("does NOT clamp an older unrecognised version", () => {
    // The asymmetry is deliberate. Negotiating DOWN to what we speak is what
    // the spec asks for; silently upgrading a client that asked for something
    // ancient would hand it a dialect it never agreed to, and it would break
    // further in — where a clean 400 here would have said why.
    expect(clampedProtocolVersion("2024-01-01")).toBeNull();
    expect(clampedProtocolVersion("2019-07-01")).toBeNull();
  });

  it("does nothing when the client sent no version at all", () => {
    // 17 of 47 Claude requests in the sample carried no header and were fine:
    // the SDK has its own default for that, and inventing one here would take
    // that decision away from it.
    expect(clampedProtocolVersion(null)).toBeNull();
    expect(clampedProtocolVersion("")).toBeNull();
  });

  it("treats a malformed value as unrecognised rather than crashing", () => {
    // Header values are attacker-controlled. Whatever arrives, this returns a
    // string or null and never throws.
    expect(() => clampedProtocolVersion("not-a-date")).not.toThrow();
    expect(() => clampedProtocolVersion("../../etc/passwd")).not.toThrow();
    // "not-a-date" sorts after "2025-11-25", so it clamps rather than 400s.
    // That is the safe direction: the SDK then answers on a version we speak.
    expect(clampedProtocolVersion("not-a-date")).toBe("2025-11-25");
  });
});
