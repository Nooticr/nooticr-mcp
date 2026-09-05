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
 * fullyParallel Playwright run without colliding) covers the other reachable
 * views. Several tests here fixed real product bugs this exercise
 * surfaced — no existing test (hand-crafted-fixture or real-call-but-never-
 * rendered) had caught them, since they only show up when a real tool
 * call's actual shape meets the widget. Two (compare_posts/analyze_post_fast
 * never producing the shapes their dead comparison/analysis views need)
 * were left as documented, deliberate non-fixes: see this repo's
 * docs/testing/agentic-e2e-testing.md for why. Each test's comment says
 * which is which and where in ui-template.ts/tools.ts/evidence.ts it lives.
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

  // FIXED (was a bug): the mention-picker's "Analyse these" button
  // (ui-template.ts) used to post analyze_comments with
  // {comments:[...], ids:[...]} — a shape its own {url, limit?}.strict()
  // inputSchema rejects every time. It now resolves which post(s) the
  // picks belong to and calls analyze_comments on that post's url when
  // they're all the same one (closing the loop for real below), or refuses
  // to send anything when they span multiple posts (the second case here).
  // Same Monitor view, same fix, also reachable from answer_my_audience,
  // show_comment_review and show_audience_replies.
  test("search_mentions Monitor view: filters/sort/select-all work, and 'Analyse these' calls analyze_comments correctly", async ({
    page,
  }: {
    page: Page;
  }) => {
    const result = await session.client.callTool({
      name: "search_mentions",
      arguments: { term: "fixture-brand", platforms: ["reddit"] },
    });
    expect(result.isError).not.toBe(true);
    const threads = (result.structuredContent as { threads?: Array<{ post?: { externalUrl?: string } }> }).threads ?? [];
    expect(threads.length).toBeGreaterThanOrEqual(2);
    const firstThreadUrl = threads[0].post?.externalUrl;
    expect(firstThreadUrl).toBeTruthy();

    await renderRealResult(page, result.structuredContent);
    await page.screenshot({ path: "test-results/visual-e2e/full-app-03-search-mentions-monitor.png" });

    // Local-only controls: filter, sort, per-thread "select all".
    await page.locator('.mchip[data-filter="reddit"]').click();
    await page.locator('.mchip[data-filter=""]').click();
    await page.locator('.msort-btn[data-sort="new"]').click();
    await expect(page.locator(".mention-pick").first()).toBeVisible();

    // Both mentions rendered first belong to the fixture's first thread
    // (each thread carries 2), so this is the same-post case.
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
    expect(params.arguments).toEqual({ url: firstThreadUrl, limit: 20 });

    // Close the loop: actually make this call and confirm it succeeds —
    // the real point of the fix, not just that the shape looks right.
    const followUp = await session.client.callTool({ name: params.name, arguments: params.arguments });
    expect(followUp.isError, `analyze_comments follow-up failed: ${JSON.stringify(followUp.content)}`).not.toBe(true);
  });

  test("search_mentions Monitor view: picking comments across two different posts refuses to send a broken call", async ({
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
    // One mention from each of the fixture's two threads.
    await page.locator(".mention-pick").nth(0).click();
    await page.locator(".mention-pick").nth(2).click();

    await clearSentMessages(page);
    await page.locator("#pickgo").click();
    await page.waitForTimeout(200);
    const sent = await sentMessages(page);
    expect(sent.find((m) => m.method === "tools/call"), "should not send analyze_comments a call it will reject").toBeUndefined();
    await expect(page.locator("#pickgo")).toContainText(/one post/i);
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

  // FIXED (was a bug): generate_captions's real output ({ok, cues,
  // transcript, cost, provider}) has no `available` field. The transcript
  // view's gate used to require `d.available` truthy before showing
  // anything, so this rendered "No transcript available." over real
  // cues/transcript. It now also accepts a present, non-empty `transcript`
  // as evidence of availability.
  test("generate_captions renders its real transcript, not 'No transcript available'", async ({
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
    await page.screenshot({ path: "test-results/visual-e2e/full-app-06-generate-captions-fixed.png" });
    await expect(page.getByText("No transcript available.")).not.toBeVisible();
    await expect(page.getByText(structured.transcript!)).toBeVisible();
  });

  test("get_post_transcript renders the real transcript, and its Copy button actually copies", async ({
    page,
  }: {
    page: Page;
  }) => {
    const result = await session.client.callTool({ name: "get_post_transcript", arguments: { url: STUB_URL } });
    expect(result.isError).not.toBe(true);
    const structured = result.structuredContent as { transcript?: string; available?: boolean };
    expect(structured.available).toBe(true);
    expect(structured.transcript).toBe("This is a fixture transcript for testing.");

    await renderRealResult(page, structured);
    await page.screenshot({ path: "test-results/visual-e2e/full-app-07-transcript.png" });
    await expect(page.getByText(structured.transcript!)).toBeVisible();

    // FIXED (was a bug): this button carried class="btn btn-sm" with a
    // data-copy attribute, but neither of the file's two copy-click
    // handlers (.copy-btn[data-copy], .copyable[data-copy]) matched it, so
    // clicking did nothing at all. It now also carries .copyable.
    await page.evaluate(() => {
      (window as unknown as { __copied: string[] }).__copied = [];
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: (t: string) => { (window as unknown as { __copied: string[] }).__copied.push(t); return Promise.resolve(); } },
        configurable: true,
      });
    });
    await page.locator("button[data-copy]").click();
    const copied = await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);
    expect(copied).toEqual([structured.transcript]);
    await expect(page.locator("button[data-copy]")).toHaveText("Copied");

    // Copying is purely local — it should never also post a message to the host.
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

  // FIXED (was two real bugs):
  // 1. checkoutUrl used to arrive mangled — proxyUrls() only exempted a
  //    fixed key list, and `checkoutUrl` fell through to the generic
  //    branch that rewrites any https:// string value regardless of key
  //    name, turning a Stripe Checkout link into a /media/proxy?url=...
  //    link. `checkoutUrl` is now in RAW_URL_KEYS and passes through raw.
  // 2. The checkout view hardcoded three fixed pack prices and had no
  //    click handler at all on .pack/.pack-featured. Each pack card is now
  //    a real <a href> to the real checkoutUrl, built from the real
  //    d.packs when present, so the existing generic anchor handler opens
  //    it via ui/open-link — same as every other "Open on ..." link.
  test("buy_nooticr_credits: the real checkoutUrl passes through raw, and clicking a pack opens it", async ({
    page,
  }: {
    page: Page;
  }) => {
    const result = await session.client.callTool({ name: "buy_nooticr_credits", arguments: {} });
    expect(result.isError).not.toBe(true);
    const structured = result.structuredContent as { checkoutUrl?: string };
    expect(structured.checkoutUrl).toBe("https://checkout.stripe.com/fixture-session");

    await renderRealResult(page, structured);
    await page.screenshot({ path: "test-results/visual-e2e/full-app-12-buy-credits-checkout.png" });

    await clearSentMessages(page);
    await page.locator(".pack, .pack-featured").first().click();
    await page.waitForTimeout(200);
    const sent = await sentMessages(page);
    const open = sent.find((m) => m.method === "ui/open-link");
    expect(open, `expected ui/open-link, got: ${sent.map((m) => m.method).join(",")}`).toBeTruthy();
    expect((open!.params as { url: string }).url).toBe(structured.checkoutUrl);
  });

  test("check_nooticr_credits renders the credits card", async ({ page }: { page: Page }) => {
    const result = await session.client.callTool({ name: "check_nooticr_credits", arguments: {} });
    expect(result.isError).not.toBe(true);
    await renderRealResult(page, result.structuredContent);
    await page.screenshot({ path: "test-results/visual-e2e/full-app-13-credits-card.png" });
    await expect(page.getByText("credits remaining")).toBeVisible();
  });

  // The five below are new: they close the loop the evidence-only tools
  // open (see docs/testing/agentic-e2e-testing.md) by giving the host
  // model's own written analysis/hooks/variants/repurposing/comparison
  // somewhere to render. show_comparison and show_analysis reuse existing
  // view branches (the comparison scoreboard, analysisCard); show_hooks,
  // show_variants and show_repurposed_post are new view code, so these are
  // this file's only coverage of whether that new code actually renders in
  // a real browser at all, not just that it type-checks.

  test("show_comparison renders the comparison scoreboard, winner marked", async ({ page }: { page: Page }) => {
    const result = await session.client.callTool({
      name: "show_comparison",
      arguments: {
        posts: [
          { platform: "tiktok", title: "Post A", views: 100, likes: 10 },
          { platform: "tiktok", title: "Post B", views: 900, likes: 90 },
        ],
        winner: 2,
        winnerReason: "Post B's hook named the audience in the first line.",
        differences: [{ factor: "Hook", detail: "B names the audience; A does not." }],
        lessons: ["Name the audience early."],
        nextTest: "Try naming the audience in the first line of the next post too.",
      },
    });
    expect(result.isError).not.toBe(true);
    await renderRealResult(page, result.structuredContent);
    await page.screenshot({ path: "test-results/visual-e2e/full-app-15-show-comparison.png" });
    await expect(page.getByText("BEST")).toBeVisible();
    await expect(page.getByText("Name the audience early.")).toBeVisible();
    await expect(page.getByText(/Try naming the audience/)).toBeVisible();
  });

  test("show_analysis renders analysisCard, and its follow-up actions round-trip for real", async ({
    page,
  }: {
    page: Page;
  }) => {
    const result = await session.client.callTool({
      name: "show_analysis",
      arguments: {
        url: STUB_URL,
        post: { platform: "tiktok", externalUrl: STUB_URL, contentType: "video", videoUrl: "https://e2e.nooticr.test/fixture/video.mp4" },
        analysis: {
          summary: "Strong hook naming the audience directly.",
          hookStrength: 8,
          suggestedHook: "If you've ever felt like this...",
          keyQuotes: ["This is the one thing nobody tells you."],
          suggestedHashtags: ["fixture", "hooks"],
          variationIdeas: ["Try the same hook with a different visual."],
        },
      },
    });
    expect(result.isError).not.toBe(true);
    await renderRealResult(page, result.structuredContent);
    await page.screenshot({ path: "test-results/visual-e2e/full-app-16-show-analysis.png" });
    await expect(page.getByText("Strong hook naming the audience directly.")).toBeVisible();
    await expect(page.getByText("AI analysis")).toBeVisible();

    const tools = await page.evaluate(() => [...document.querySelectorAll(".ai-btn")].map((b) => b.getAttribute("data-ai")));
    expect(tools).toEqual(["create_variants", "write_hooks", "repurpose_post", "analyze_comments"]);
    await clearSentMessages(page);
    await page.locator('.ai-btn[data-ai="write_hooks"]').click();
    await page.waitForTimeout(200);
    const sent = await sentMessages(page);
    const call = sent.find((m) => m.method === "tools/call");
    expect(call?.params).toEqual({ name: "write_hooks", arguments: { url: STUB_URL } });
  });

  test("show_hooks renders each hook with its device, and Copy works", async ({ page }: { page: Page }) => {
    const result = await session.client.callTool({
      name: "show_hooks",
      arguments: {
        url: STUB_URL,
        hooks: [
          { hook: "You've been doing this wrong the whole time.", mechanism: "accusation", why: "Stops anyone confident they already know this." },
          { hook: "Three numbers that explain everything.", mechanism: "number", why: "Promises a concrete payoff." },
        ],
      },
    });
    expect(result.isError).not.toBe(true);
    await renderRealResult(page, result.structuredContent);
    await page.screenshot({ path: "test-results/visual-e2e/full-app-17-show-hooks.png" });
    await expect(page.getByText("You've been doing this wrong the whole time.")).toBeVisible();
    await expect(page.getByText("accusation")).toBeVisible();

    await page.evaluate(() => {
      (window as unknown as { __copied: string[] }).__copied = [];
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: (t: string) => { (window as unknown as { __copied: string[] }).__copied.push(t); return Promise.resolve(); } },
        configurable: true,
      });
    });
    await page.locator(".quote-box button").first().click();
    const copied = await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);
    expect(copied).toEqual(["You've been doing this wrong the whole time."]);
  });

  test("show_variants renders each variant's hook/angle/beats/cta", async ({ page }: { page: Page }) => {
    const result = await session.client.callTool({
      name: "show_variants",
      arguments: {
        sourceUrl: STUB_URL,
        variants: [
          {
            title: "POV twist",
            hook: "POV: you just found out the hard way.",
            angle: "Same mechanism, told from the audience's point of view.",
            beats: ["Cold open on the mistake", "Reveal the fix", "Call to action"],
            cta: "Follow for more mistakes to avoid.",
            whyItCouldWork: "POV framing raises comment rate on this format.",
          },
        ],
      },
    });
    expect(result.isError).not.toBe(true);
    await renderRealResult(page, result.structuredContent);
    await page.screenshot({ path: "test-results/visual-e2e/full-app-18-show-variants.png" });
    await expect(page.getByText("POV twist")).toBeVisible();
    await expect(page.getByText("POV: you just found out the hard way.")).toBeVisible();
    await expect(page.getByText("Reveal the fix")).toBeVisible();
    await expect(page.getByText("Follow for more mistakes to avoid.")).toBeVisible();
  });

  test("show_repurposed_post renders one section per surface, and Copy works", async ({ page }: { page: Page }) => {
    const result = await session.client.callTool({
      name: "show_repurposed_post",
      arguments: {
        sourceUrl: STUB_URL,
        versions: [
          { surface: "X thread", content: "1/ Here's what nobody tells you about this." },
          { surface: "LinkedIn post", content: "A professional take on the same idea." },
        ],
      },
    });
    expect(result.isError).not.toBe(true);
    await renderRealResult(page, result.structuredContent);
    await page.screenshot({ path: "test-results/visual-e2e/full-app-19-show-repurposed-post.png" });
    await expect(page.getByText("X thread")).toBeVisible();
    await expect(page.getByText("Here's what nobody tells you about this.")).toBeVisible();

    await page.evaluate(() => {
      (window as unknown as { __copied: string[] }).__copied = [];
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: (t: string) => { (window as unknown as { __copied: string[] }).__copied.push(t); return Promise.resolve(); } },
        configurable: true,
      });
    });
    await page.locator(".copyable").first().click();
    const copied = await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);
    expect(copied).toEqual(["1/ Here's what nobody tells you about this."]);
  });
});
