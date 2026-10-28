import { describe, expect, it } from "vitest";

import { bearerToken, trimTrailingSlashes } from "../src/shared/strings.js";

describe("trimTrailingSlashes", () => {
  it("drops every trailing slash and nothing else", () => {
    expect(trimTrailingSlashes("https://api.nooticr.com///")).toBe("https://api.nooticr.com");
    expect(trimTrailingSlashes("/a/b/")).toBe("/a/b");
    expect(trimTrailingSlashes("/")).toBe("");
    expect(trimTrailingSlashes("no-slash")).toBe("no-slash");
    expect(trimTrailingSlashes("")).toBe("");
  });

  it("stays linear on a long run of slashes that is not at the end", () => {
    // The regex this replaced retried the run from every position: seconds here.
    const evil = `${"/".repeat(200_000)}x`;
    const started = Date.now();
    expect(trimTrailingSlashes(evil)).toBe(evil);
    expect(Date.now() - started).toBeLessThan(200);
  });
});

describe("bearerToken", () => {
  it("reads the token from any casing of the scheme", () => {
    expect(bearerToken("Bearer abc.def")).toBe("abc.def");
    expect(bearerToken("bearer   abc  ")).toBe("abc");
    expect(bearerToken("BEARER\tabc")).toBe("abc");
  });

  it("refuses other schemes, a glued scheme and an empty token", () => {
    expect(bearerToken(undefined)).toBeUndefined();
    expect(bearerToken("Basic abc")).toBeUndefined();
    expect(bearerToken("Bearerabc")).toBeUndefined();
    expect(bearerToken("Bearer    ")).toBeUndefined();
  });

  it("stays linear on a long run of spaces", () => {
    const started = Date.now();
    expect(bearerToken(`Bearer ${" ".repeat(200_000)}`)).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(200);
  });
});
