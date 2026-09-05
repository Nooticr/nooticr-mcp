/**
 * Comprehensive real-pipeline visual E2E: every reachable widget view this
 * repo's UI template renders, driven by a real tools/call through this
 * repo's real built CLI against scripts/fixture-server.mjs, with every
 * host-facing button in each view actually clicked — and, where a click's
 * outbound tools/call is itself testable, actually executed for real
 * (through the same client) rather than only checked as a shape.
 *
 * tests/e2e/agentic-visual.e2e.ts (port 8080) covers the posts-gallery view
 * in depth; this file (port 8081, so the two can run in the same
 * fullyParallel Playwright run without colliding) covers the other eight
 * reachable views, plus documents — with a real, executed, failing or
 * mis-rendering call, not a guess — several product bugs this exercise
 * surfaced that no existing test (hand-crafted-fixture or real-call-but-
 * never-rendered) had caught: see each test's comment for the specific
 * claim and where in ui-template.ts/tools.ts it comes from.
 *
 *   npx playwright test tests/e2e/agentic-visual-full-app.e2e.ts
 */
import { test, expect, type Page } from "@playwright/test";
import {
  startMcpE2eSession,
  renderRealResult,
  sentMessages,
  clearSentMessages,
  type McpE2eSession,
} from "./support/mcp-e2e-session.js";

const PORT = 8081;
const STUB_URL = "https://e2e.nooticr.test/import/tiktok/e2e-stub";

let session: McpE2eSession;

test.describe.serial("every reachable widget view, driven by a real tool call", () => {
  test.beforeAll(async () => {
    session = await startMcpE2eSession(PORT);
  });
  test.afterAll(async () => {
    await session.close();
  });

  test("single post card: external link and all four ai-btn actions round-trip for real", async ({
    page,
  }: {
    page: Page;
  }) => {
    const result = await session.client.callTool({ name: "get_social_media", arguments: { url: STUB_URL } });
    expect(result.isError).not.toBe(true);

    await renderRealResult(page, result.structuredContent);
    await page.screenshot({ path: "test-results/visual-e2e/full-app-01-single-post.png" });

    // The generic anchor handler (ui-template.ts's own click handler, shared
    // by .mp-open and postCard's "View on ..." link) — real externalUrl in,
    // real ui/open-link out.
    await clearSentMessages(page);
    await page.locator(".mp-open, a.btn").first().click();
    await page.waitForTimeout(200);
    const openSent = await sentMessages(page);
    const open = openSent.find((m) => m.method === "ui/open-link");
    expect(open, `expected ui/open-link, got: ${openSent.map((m) => m.method).join(",")}`).toBeTruthy();
    expect((open!.params as { url: string }).url).toBe(STUB_URL);

    // The four ai-btn actions (postAiActions, ui-template.ts:611-614) — for
    // each, click it, capture exactly what the widget sent, then actually
    // execute that call for real through the same client. This is the
    // "does clicking really drive the right next thing" check: not just
    // that the message looks right, but that following through on it works.
    const expectedTools = ["create_variants", "write_hooks", "repurpose_post", "analyze_comments"];
    const seenTools = await page.evaluate(() =>
      [...document.querySelectorAll(".ai-btn")].map((b) => b.getAttribute("data-ai"))
    );
    expect(seenTools).toEqual(expectedTools);

    for (const tool of expectedTools) {
      await clearSentMessages(page);
      await page.locator(`.ai-btn[data-ai="${tool}"]`).click();
      await page.waitForTimeout(200);
      const sent = await sentMessages(page);
      const call = sent.find((m) => m.method === "tools/call");
      expect(call, `${tool}: expected a tools/call, got ${sent.map((m) => m.method).join(",")}`).toBeTruthy();
      const params = call!.params as { name: string; arguments: Record<string, unknown> };
      expect(params.name).toBe(tool);
      expect(params.arguments).toEqual({ url: STUB_URL });

      // Close the loop: actually make this call, exactly as a host would
      // after the click, and confirm it succeeds.
      const followUp = await session.client.callTool({ name: params.name, arguments: params.arguments });
      expect(followUp.isError, `${tool} follow-up call failed: ${JSON.stringify(followUp.content)}`).not.toBe(true);
    }
  });

  // BUG (product, not test): compare_posts's real evidence plan
  // (src/shared/evidence.ts's compare_posts entry) only ever fetches
  // urls[0] via get_social_media — it never sets `.comparison` and never
  // returns a `posts` array. The dedicated comparison scoreboard
  // (ui-template.ts:2375, `d.comparison!==undefined && Array.isArray(d.posts)`)
  // is therefore unreachable: a real compare_posts call, including one
  // triggered by clicking "Compare" after picking two gallery posts, always
  // renders as an ordinary single-post card for the first URL only, silently
  // discarding the second. tests/e2e/ui-template.e2e.ts's own comparison-view
  // tests only exist by injecting synthetic `comparison`-shaped data no real
  // call produces.
  test("compare_posts never actually produces a comparison (documents a real bug)", async ({
    page,
  }: {
    page: Page;
  }) => {
    const secondUrl = "https://www.tiktok.com/@fixture-other/video/999";
    const result = await session.client.callTool({
      name: "compare_posts",
      arguments: { urls: [STUB_URL, secondUrl] },
    });
    expect(result.isError).not.toBe(true);
    const structured = result.structuredContent as Record<string, unknown>;

    expect(structured.comparison, "compare_posts should not (yet) set .comparison — see comment above").toBeUndefined();
    expect(Array.isArray(structured.posts), "compare_posts should not (yet) return a posts array — see comment above").toBe(
      false
    );

    await renderRealResult(page, structured);
    await page.screenshot({ path: "test-results/visual-e2e/full-app-02-compare-posts-not-a-comparison.png" });
    // Renders as postCard() for STUB_URL alone — the "View on ..."/open link
    // target is the first URL, never the second.
    await page.locator(".mp-open, a.btn").first().click();
    await page.waitForTimeout(200);
    const sent = await sentMessages(page);
    const open = sent.find((m) => m.method === "ui/open-link");
    expect((open!.params as { url: string }).url).toBe(STUB_URL);
  });

  // BUG (product, not test), same family as the compare_posts one above:
  // analyze_post_fast (and analyze_post, understand_social_post) all run
  // through runEvidence() (tools.ts:362-427), which builds
  // {mode:"evidence", tool, evidenceFrom, ...} from a cheap "via" fetch and
  // never sets `.analysis`. The dedicated analysisCard view
  // (ui-template.ts:2373, `d.analysis && (d.post||d.url)`) — meters, an AI
  // verdict, a "More hooks" ai-btn follow-up row, copyable quote/hashtag
  // chips — is therefore unreachable by any tool call in this repo today.
  // tests/e2e/ui-template.e2e.ts's own analysisCard tests only exist by
  // injecting synthetic `analysis`-shaped data no real call produces.
  test("analyze_post_fast never actually produces an .analysis (documents the same dead-view bug for analysisCard)", async ({
    page,
  }: {
    page: Page;
  }) => {
    const result = await session.client.callTool({ name: "analyze_post_fast", arguments: { url: STUB_URL } });
    expect(result.isError).not.toBe(true);
    const structured = result.structuredContent as Record<string, unknown>;

    expect(structured.mode).toBe("evidence");
    expect(structured.analysis, "analyze_post_fast should not (yet) set .analysis — see comment above").toBeUndefined();

    await renderRealResult(page, structured);
    await page.screenshot({ path: "test-results/visual-e2e/full-app-14-analyze-post-fast-not-analysis-card.png" });
    // Renders as an ordinary single postCard() — no meters, no "More hooks"
    // row, no copyable chips — because the analysisCard gate never matches.
    await expect(page.locator(".ai-btn")).toHaveCount(4);
  });

  // BUG (product, not test): the mention-picker's "Analyse these" button
  // (ui-template.ts:1817-1841) posts analyze_comments with
  // {comments:[...], ids:[...]} — but analyze_comments's real inputSchema
  // (tools.ts) is `{url, limit?}.strict()`. A real host that actually
  // executes this call, rather than timing out into the clipboard fallback,
  // gets a schema validation rejection every time. This is exercised from
  // search_mentions here; the same Monitor view (and the same bug) is also
  // reachable from answer_my_audience, show_comment_review and
  // show_audience_replies.
  test("search_mentions Monitor view: filters/sort/select-all work, but 'Analyse these' sends analyze_comments an argument shape it rejects (documents a real bug)", async ({
    page,
  }: {
    page: Page;
  }) => {
    const result = await session.client.callTool({
      name: "search_mentions",
      arguments: { term: "fixture-brand", platforms: ["reddit"] },
    });
    expect(result.isError).not.toBe(true);

    await renderRealResult(page, result.structuredContent);
    await page.screenshot({ path: "test-results/visual-e2e/full-app-03-search-mentions-monitor.png" });

    // Local-only controls: filter, sort, per-thread "select all".
    await page.locator('.mchip[data-filter="reddit"]').click();
    await page.locator('.mchip[data-filter=""]').click();
    await page.locator('.msort-btn[data-sort="new"]').click();
    await expect(page.locator(".mention-pick").first()).toBeVisible();

    await page.locator(".mention-pick").nth(0).click();
    await page.locator(".mention-pick").nth(1).click();
    await page.screenshot({ path: "test-results/visual-e2e/full-app-04-search-mentions-picked.png" });

    await clearSentMessages(page);
    await page.locator("#pickgo").click();
    await page.waitForTimeout(200);
    const sent = await sentMessages(page);
    const call = sent.find((m) => m.method === "tools/call");
    expect(call, `expected a tools/call, got: ${sent.map((m) => m.method).join(",")}`).toBeTruthy();
    const params = call!.params as { name: string; arguments: Record<string, unknown> };
    expect(params.name).toBe("analyze_comments");
    // This is the bug: real analyze_comments wants {url, limit?}, not this.
    expect(params.arguments).toHaveProperty("comments");
    expect(params.arguments).toHaveProperty("ids");
    expect(params.arguments).not.toHaveProperty("url");

    // Prove it, rather than just asserting the shape: actually make this
    // exact call and confirm the SDK's own schema validation rejects it.
    let rejected = false;
    let rejectionMessage = "";
    try {
      const attempted = await session.client.callTool({ name: params.name, arguments: params.arguments });
      rejected = attempted.isError === true;
      rejectionMessage = JSON.stringify(attempted.content);
    } catch (err) {
      rejected = true;
      rejectionMessage = String(err);
    }
    expect(
      rejected,
      "expected the widget's real 'Analyse these' call to be rejected by analyze_comments's own " +
        "{url, limit?}.strict() schema — if this now passes, either the widget or the tool's " +
        "schema changed and this comment/test needs updating"
    ).toBe(true);
    expect(rejectionMessage.length).toBeGreaterThan(0);
  });

  test("show_comment_review renders the free, no-fetch review variant of the Monitor view", async ({
    page,
  }: {
    page: Page;
  }) => {
    // Takes its comments directly as input — no client.callTool at all
    // (src/shared/tools.ts's show_comment_review handler), so this needs no
    // fixture-server case: it's testing this repo's own local rendering
    // logic end to end, same as every other test here, just with no
    // upstream fetch in the loop.
    const result = await session.client.callTool({
      name: "show_comment_review",
      arguments: {
        url: STUB_URL,
        summary: "Fixture review summary.",
        comments: [
          { id: "rc-1", text: "Fixture praise comment.", author: "fixture_a", sentiment: "positive", category: "praise" },
          { id: "rc-2", text: "Fixture bug report.", author: "fixture_b", sentiment: "negative", category: "bug_report" },
        ],
      },
    });
    expect(result.isError).not.toBe(true);

    await renderRealResult(page, result.structuredContent);
    await page.screenshot({ path: "test-results/visual-e2e/full-app-05-show-comment-review.png" });

    await expect(page.locator(".mention-pick").first()).toBeVisible();
    await page.locator('.mchip[data-filter="bug_report"]').click();
    await expect(page.locator(".mention-pick")).toHaveCount(1);
    await page.locator('.mchip[data-filter=""]').click();
    await expect(page.locator(".mention-pick")).toHaveCount(2);
  });

  // BUG (product, not test): generate_captions's real output (own-account.ts,
  // passthrough of {ok, cues, transcript, cost, provider}) has no `available`
  // field. The Transcript view's gate (ui-template.ts:2479) is
  // `d.transcript!==undefined || (...)` — true, since transcript exists —
  // but the branch immediately checks `if(!d.available)`; `available` is
  // undefined, so `!undefined` is true, and it renders "No transcript
  // available." even though real cues/transcript came back. The cues[]
  // payload is never drawn by any branch.
  test("generate_captions renders 'No transcript available' despite real cues coming back (documents a real bug)", async ({
    page,
  }: {
    page: Page;
  }) => {
    const result = await session.client.callTool({ name: "generate_captions", arguments: {} });
    expect(result.isError).not.toBe(true);
    const structured = result.structuredContent as { transcript?: string; cues?: unknown[]; available?: boolean };
    expect(typeof structured.transcript).toBe("string");
    expect(structured.transcript!.length).toBeGreaterThan(0);
    expect(Array.isArray(structured.cues)).toBe(true);
    expect(structured.available).toBeUndefined();

    await renderRealResult(page, structured);
    await page.screenshot({ path: "test-results/visual-e2e/full-app-06-generate-captions-bug.png" });
    await expect(page.getByText("No transcript available.")).toBeVisible();
  });

  test("get_post_transcript renders the real transcript, but its Copy button is dead (documents a real bug)", async ({
    page,
  }: {
    page: Page;
  }) => {
    // BUG (product, not test): ui-template.ts:2491 gives this button
    // class="btn btn-sm" with a data-copy attribute; the only two
    // copy-click handlers in the file target .copy-btn[data-copy] and
    // .copyable[data-copy] — neither matches .btn.btn-sm. Clicking it does
    // nothing: no host message, no clipboard write, no error either.
    const result = await session.client.callTool({ name: "get_post_transcript", arguments: { url: STUB_URL } });
    expect(result.isError).not.toBe(true);
    const structured = result.structuredContent as { transcript?: string; available?: boolean };
    expect(structured.available).toBe(true);
    expect(structured.transcript).toBe("This is a fixture transcript for testing.");

    await renderRealResult(page, structured);
    await page.screenshot({ path: "test-results/visual-e2e/full-app-07-transcript.png" });
    await expect(page.getByText(structured.transcript!)).toBeVisible();

    await clearSentMessages(page);
    await page.locator("button[data-copy]").click();
    await page.waitForTimeout(200);
    const sent = await sentMessages(page);
    expect(sent.length, `Copy button unexpectedly sent a message: ${JSON.stringify(sent)}`).toBe(0);
  });

  test("discover_hashtags renders trending hashtags and each links out for real", async ({
    page,
  }: {
    page: Page;
  }) => {
    const result = await session.client.callTool({ name: "discover_hashtags", arguments: {} });
    expect(result.isError).not.toBe(true);
    const structured = result.structuredContent as { hashtags?: Array<{ url: string }> };
    expect(structured.hashtags?.length).toBeGreaterThan(0);

    await renderRealResult(page, structured);
    await page.screenshot({ path: "test-results/visual-e2e/full-app-08-discover-hashtags.png" });

    await clearSentMessages(page);
    await page.locator("a.comment-row").first().click();
    await page.waitForTimeout(200);
    const sent = await sentMessages(page);
    const open = sent.find((m) => m.method === "ui/open-link");
    expect(open, `expected ui/open-link, got: ${sent.map((m) => m.method).join(",")}`).toBeTruthy();
    expect((open!.params as { url: string }).url).toBe(structured.hashtags![0].url);
  });

  test("get_post_comments renders real comments, with a working local show-more toggle", async ({
    page,
  }: {
    page: Page;
  }) => {
    const result = await session.client.callTool({ name: "get_post_comments", arguments: { url: STUB_URL } });
    expect(result.isError).not.toBe(true);
    await renderRealResult(page, result.structuredContent);
    await page.screenshot({ path: "test-results/visual-e2e/full-app-09-get-post-comments.png" });

    const more = page.locator(".cmore").first();
    await expect(more).toHaveText("Show more");
    await more.click();
    await expect(more).toHaveText("Show less");
  });

  test("discover_sounds renders a playable sound card", async ({ page }: { page: Page }) => {
    const result = await session.client.callTool({ name: "discover_sounds", arguments: { keyword: "fixture" } });
    expect(result.isError).not.toBe(true);
    await renderRealResult(page, result.structuredContent);
    await page.screenshot({ path: "test-results/visual-e2e/full-app-10-discover-sounds.png" });
    await expect(page.locator(".au-play").first()).toBeVisible();
  });

  test("search_creators renders creator cards (no host-facing control on this card by design)", async ({
    page,
  }: {
    page: Page;
  }) => {
    const result = await session.client.callTool({ name: "search_creators", arguments: { keyword: "fixture" } });
    expect(result.isError).not.toBe(true);
    await renderRealResult(page, result.structuredContent);
    await page.screenshot({ path: "test-results/visual-e2e/full-app-11-search-creators.png" });
    await expect(page.locator(".creator-card").first()).toBeVisible();
  });

  // BUG x2 (product, not test):
  // 1. checkoutUrl arrives mangled. src/shared/tools.ts's proxyUrls() only
  //    exempts RAW_URL_KEYS (externalUrl, embedUrl, videoFallbackUrl,
  //    thumbnailFallbackUrl, musicFallbackUrl) or a fixed image-key list
  //    (thumbnailUrl, coverUrl, ...) from being rewritten; `checkoutUrl` is
  //    neither, so it falls through to the generic branch, which still
  //    matches any https:// *string value* regardless of key name and
  //    rewrites it through the image proxy — turning a Stripe Checkout
  //    link into `<base>/media/proxy?url=<encoded-stripe-url>`, a URL
  //    meant to serve image/video bytes, not redirect to a payment page.
  // 2. The checkout view (ui-template.ts:2622-2636) hardcodes three pack
  //    prices and ignores both d.checkoutUrl and the real contents of
  //    d.packs; and no click handler anywhere targets .pack/.pack-featured
  //    despite `.pack{cursor:pointer}` in the CSS — clicking a pack card
  //    does nothing regardless.
  // So even setting aside bug 2, bug 1 means there is no path today from
  // clicking a pack in this view to a working Stripe checkout even if bug 2
  // were fixed in isolation.
  test("buy_nooticr_credits: the real checkoutUrl arrives mangled by the image proxy, and clicking a pack does nothing either way (documents two real bugs)", async ({
    page,
  }: {
    page: Page;
  }) => {
    const result = await session.client.callTool({ name: "buy_nooticr_credits", arguments: {} });
    expect(result.isError).not.toBe(true);
    const structured = result.structuredContent as { checkoutUrl?: string };
    expect(
      structured.checkoutUrl,
      "checkoutUrl should be the real Stripe link, unmodified — if this now holds " +
        "the raw URL, bug 1 above has been fixed and this assertion should flip"
    ).not.toBe("https://checkout.stripe.com/fixture-session");
    expect(structured.checkoutUrl).toContain("/media/proxy?url=");
    expect(decodeURIComponent(structured.checkoutUrl!)).toContain("https://checkout.stripe.com/fixture-session");

    await renderRealResult(page, structured);
    await page.screenshot({ path: "test-results/visual-e2e/full-app-12-buy-credits-checkout.png" });

    await clearSentMessages(page);
    await page.locator(".pack, .pack-featured").first().click();
    await page.waitForTimeout(200);
    const sent = await sentMessages(page);
    expect(sent.length, `pack click unexpectedly sent a message: ${JSON.stringify(sent)}`).toBe(0);
  });

  test("check_nooticr_credits renders the credits card", async ({ page }: { page: Page }) => {
    const result = await session.client.callTool({ name: "check_nooticr_credits", arguments: {} });
    expect(result.isError).not.toBe(true);
    await renderRealResult(page, result.structuredContent);
    await page.screenshot({ path: "test-results/visual-e2e/full-app-13-credits-card.png" });
    await expect(page.getByText("credits remaining")).toBeVisible();
  });
});
