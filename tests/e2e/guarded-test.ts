/**
 * The `test` every browser spec here uses, with production put out of reach.
 *
 * ## Why
 *
 * The suite serves its pages from a local throwaway server, which is right.
 * But the pages are built with `PUBLIC_URL = "https://mcp.nooticr.com"` and
 * several fixtures carry absolute production URLs, and a real browser resolves
 * those. Five days of Cloudflare logs:
 *
 * ```
 * mcp.nooticr.com/media/x.mp4   3,088   all 404   ua=…Chrome (= devices["Desktop Chrome"])
 * mcp.nooticr.com/media/t.jpg     238   all 404
 * ```
 *
 * `mcp.nooticr.com` has never had a `/media/` route, so every one of those was
 * a 404 against production, from CI, several times a second while a run was in
 * flight (#66).
 *
 * Three costs, and the third is the one that bites a test suite: production
 * analytics become majority-synthetic, `/health` volume becomes
 * indistinguishable from an attack, and **the media assertions were being
 * validated against a production 404** — passing for the wrong reason, and
 * they would have kept passing if the real media path broke.
 *
 * ## What this does
 *
 * Serves every request to a real nooticr host from here, instead of letting it
 * leave the browser. Serving rather than aborting is not a detail: an abort —
 * like a DNS failure, and like the 4xx production was actually returning — is
 * logged as a console error, and nearly every spec in this suite asserts the
 * page produced none. `ui-views.e2e.ts` worked this out first and had exactly
 * this route with exactly this reasoning; this is that route, made general so
 * `ui-template.e2e.ts` (the actual source of the 3,326 hits, with eighteen
 * route handlers and none for production) cannot miss it.
 *
 * Registered as an automatic fixture, so it is in place before any spec body
 * runs — and because Playwright matches the most recently registered route
 * first, a spec's own `page.route("**\/media/resolve**", …)` still wins over
 * this. That ordering is deliberate: this is the floor, not an override.
 *
 * The fixture URLs stay realistic on purpose — several tests assert on their
 * shape, and a `data:` URI would not exercise the same code path. What changes
 * is that they now resolve here. `tests/e2e-no-production.test.ts` asserts
 * every spec imports from this file, which is the invariant a new spec cannot
 * quietly opt out of by editing one URL.
 */
import { test as base, expect } from "@playwright/test";

/** Hosts that are real infrastructure, not fixtures. */
const PRODUCTION_HOSTS = /(^|\.)nooticr\.com$/i;

/** A 1x1 GIF, so an <img> gets bytes it can decode instead of an error. */
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

export const test = base.extend<{ blockProduction: void }>({
  blockProduction: [
    async ({ page }, use) => {
      await page.route("**/*", async (route) => {
        let host = "";
        try {
          host = new URL(route.request().url()).hostname;
        } catch {
          await route.fallback();
          return;
        }
        if (!PRODUCTION_HOSTS.test(host)) {
          // Not production. Hand it on to whatever the spec registered, or to
          // the network — `fallback` rather than `continue` so a spec's own
          // handler still gets its turn.
          await route.fallback();
          return;
        }

        const url = route.request().url();
        if (/\.(mp4|webm|m3u8)$/.test(url)) {
          // An empty 200 rather than a failure. The <video> element raises its
          // own error event for undecodable bytes, which is not a console
          // error — where a 4xx, or a DNS failure, IS logged as one and would
          // break every spec that asserts the page produced no errors.
          await route.fulfill({ status: 200, contentType: "video/mp4", body: "" });
          return;
        }
        if (/\.(png|jpe?g|gif|webp|avif|svg)$/.test(url)) {
          await route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL });
          return;
        }
        // Anything else production might be asked for: answered, not aborted,
        // for the same reason.
        await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      });

      await use();
    },
    { auto: true },
  ],
});

export { expect };
