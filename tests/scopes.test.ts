/**
 * Scope validation for the authorization endpoint.
 *
 * The worker compared each individual scope against the *joined* scope string,
 * so the moment there was more than one scope nothing could ever match and
 * every authorization was refused with invalid_scope — including a request
 * asking for exactly the supported set. That is what stopped the server being
 * added as a connector on claude.ai.
 */
import { describe, it, expect } from "vitest";
import { SCOPE, SCOPES, LEGACY_SCOPE, parseScopes, unsupportedScopes } from "../src/shared/oauth.js";

describe("authorization scopes", () => {
  it("accepts exactly what the metadata advertises", () => {
    // This is the request a client builds from scopes_supported. It was
    // rejected, which is the whole bug.
    expect(unsupportedScopes(SCOPE)).toEqual([]);
    expect(unsupportedScopes(SCOPES.join(" "))).toEqual([]);
  });

  it("accepts each supported scope on its own, and in any order", () => {
    for (const s of SCOPES) expect(unsupportedScopes(s)).toEqual([]);
    expect(unsupportedScopes([...SCOPES].reverse().join(" "))).toEqual([]);
  });

  it("still accepts the scope issued before the split", () => {
    // Clients connected before then still ask for it; refusing would break
    // every existing installation on upgrade.
    expect(unsupportedScopes(LEGACY_SCOPE)).toEqual([]);
    expect(unsupportedScopes(`${LEGACY_SCOPE} ${SCOPES[0]}`)).toEqual([]);
  });

  it("names only the scopes it does not recognise", () => {
    expect(unsupportedScopes("social:read admin:everything")).toEqual(["admin:everything"]);
    expect(unsupportedScopes("nope also:nope")).toEqual(["nope", "also:nope"]);
  });

  it("treats an absent or empty scope as asking for nothing", () => {
    for (const v of ["", "   ", null, undefined]) {
      expect(unsupportedScopes(v)).toEqual([]);
      expect(parseScopes(v)).toEqual([]);
    }
  });

  it("splits on any run of whitespace, as the spec allows", () => {
    expect(parseScopes("social:read   credits:spend")).toEqual(["social:read", "credits:spend"]);
    expect(parseScopes("\tsocial:read\ncredits:spend ")).toEqual(["social:read", "credits:spend"]);
  });
});
