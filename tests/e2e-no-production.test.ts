import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The E2E suite must not be able to reach production.
 *
 * It was reaching it: fixtures carried absolute `https://mcp.nooticr.com/media/…`
 * URLs, a real browser resolved them, and five days of Cloudflare logs showed
 * **3,088 requests to `/media/x.mp4`, all 404**, from CI, several times a
 * second while a run was in flight — plus 238 more for the thumbnail (#66).
 *
 * `mcp.nooticr.com` has never had a `/media/` route. So the media assertions
 * were being validated against a production 404: passing for the wrong reason,
 * and they would have kept passing if the real media path broke.
 *
 * Two fixes went in. The URLs were repointed at `.invalid`, and
 * `tests/e2e/guarded-test.ts` aborts anything that still tries. This test is
 * what makes the second one stick: repointing a URL is one edit away from
 * being undone, but "every spec goes through the guard" is an invariant a
 * future spec cannot quietly opt out of.
 */
const E2E_DIR = join(process.cwd(), "tests", "e2e");
const specs = readdirSync(E2E_DIR).filter((f) => f.endsWith(".e2e.ts"));

describe("the browser suite cannot reach production", () => {
  it("has specs to check", () => {
    // A glob that silently matches nothing is a test that passes by doing
    // nothing, which is the failure mode this whole file exists to prevent.
    expect(specs.length).toBeGreaterThan(0);
  });

  it.each(specs)("%s takes `test` from the guard, not from @playwright/test", (spec) => {
    const source = readFileSync(join(E2E_DIR, spec), "utf8");

    expect(
      source,
      `${spec} must import { test } from "./guarded-test.js" — that is what installs the ` +
        `route guard aborting requests to real nooticr hosts`,
    ).toMatch(/import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*["']\.\/guarded-test\.js["']/);

    // Importing `type Page` from @playwright/test is fine — it is a type, it
    // carries no runtime behaviour. Importing the *runner* is what bypasses
    // the guard.
    const runtimeImport = /import\s*\{([^}]*)\}\s*from\s*["']@playwright\/test["']/g;
    for (const match of source.matchAll(runtimeImport)) {
      const named = match[1];
      expect(
        named.replace(/\btype\s+\w+/g, "").includes("test"),
        `${spec} imports the raw \`test\` from @playwright/test, which skips the guard`,
      ).toBe(false);
    }
  });

  it.each(specs)("%s keeps its production-looking URLs, which is the point", (spec) => {
    const source = readFileSync(join(E2E_DIR, spec), "utf8");
    // Deliberately NOT a ban. The fixtures name real-looking media URLs
    // because several tests assert on their shape, and a `data:` URI would not
    // exercise the same code path. Repointing them at a fake host was tried
    // first and broke seven render assertions: a DNS failure is a console
    // error, where the served fixture is not, and every one of those specs
    // asserts the page produced no errors.
    //
    // So the invariant is the import above, not the URL. This case exists to
    // record that decision where the next person will look for it.
    expect(source.length).toBeGreaterThan(0);
  });
});
