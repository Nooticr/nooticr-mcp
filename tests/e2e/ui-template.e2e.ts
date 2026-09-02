/**
 * Browser end-to-end tests for the MCP Apps UI template.
 *
 * These exist because of a bug that only showed up on a phone: the media card
 * takes its width from the stage height via the aspect ratio, so a short
 * frame collapsed a portrait card to ~112px while its 38px controls stayed
 * put — the video ended up narrower than its own buttons. Layout maths that
 * only breaks at certain viewport sizes needs a real browser to catch.
 *
 *   npx playwright test tests/e2e/ui-template.e2e.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { ORCHYN_UI_TEMPLATE } from "../../src/shared/ui-template.js";

// The flat shape postCard() actually reads: a videoUrl is what promotes a
// card to .card-media and builds the player. Nesting it under video.url (the
// obvious guess) renders a plain text card and makes the width assertions
// below vacuous.
const POSTS = [1, 2, 3].map((i) => ({
  platform: "tiktok",
  caption: `Post ${i}`,
  creatorHandle: `user${i}`,
  externalUrl: `https://www.tiktok.com/@u${i}/video/${i}`,
  videoUrl: "https://mcp.orchyn.com/media/x.mp4",
  contentType: "video",
  views: 1540000, likes: 488700, comments: 2700, shares: 1400,
}));

// A post with a thumbnail but no video renders the plain card, which is where
// the platform badge (and pColorText) lives — the media card uses an overlay
// pill instead.
const THUMB_POSTS = [{
  platform: "tiktok",
  caption: "So you want to be a mangaka huh?",
  creatorHandle: "iruy",
  externalUrl: "https://www.tiktok.com/@iruy/video/1",
  thumbnailUrl: "https://mcp.orchyn.com/media/t.jpg",
  views: 1540000, likes: 488700, comments: 2700,
}];

const HASHTAGS = {
  country: "US", days: 7,
  hashtags: [
    { hashtag: "dollyparton", posts: 305100, views: 1540000000, trend: "rising", url: "https://x" },
    { hashtag: "dolly", posts: 84000, views: 282900000, trend: "cooling", url: "https://x" },
  ],
};

async function renderTemplate(page: Page, data: unknown) {
  await page.setContent(ORCHYN_UI_TEMPLATE);
  await page.evaluate(
    (d) => window.postMessage(
      { method: "ui/notifications/tool-result", params: { structuredContent: d } }, "*"),
    data,
  );
  await page.waitForTimeout(500);
}

// Relative luminance and contrast ratio, per WCAG 2.1.
function contrast(fg: string, bg: string): number {
  const chan = (s: string) => (s.match(/\d+/g) ?? ["0", "0", "0"]).slice(0, 3).map(Number);
  const lum = ([r, g, b]: number[]) => {
    const f = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const a = lum(chan(fg)), b = lum(chan(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// A short frame is the case that broke: the old code floored the stage at
// 200px, which the 9:16 ratio turned into a 112px-wide card.
for (const height of [300, 480, 760]) {
  test(`media card stays full-width in a 390x${height} frame`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height });
    await renderTemplate(page, { posts: POSTS });
    const card = page.locator(".card-media").first();
    await expect(card).toBeVisible();
    const width = await card.evaluate((el) => Math.round(el.getBoundingClientRect().width));
    expect(width).toBeGreaterThan(300);
  });
}

// The card's width used to be derived from --stage-max, which was derived
// from the height the host had given the frame. That height is a placeholder
// the host sets while waiting for us to report ours, and it differs every time
// a virtualising host unmounts a card on scroll and mounts it again -- so the
// same card settled at 492x277, 706x397 or 738x415 depending on nothing but
// the placeholder. Size must be a function of the content and the width.
for (const [label, fmt] of [["landscape", "Long-form"], ["portrait", "Short-form"]] as const) {
  test(`${label} stage size ignores the height the host starts with`, async ({ page }) => {
    await page.route("**/media/resolve**", () => { /* deliberately hangs */ });
    const seen = new Set<string>();
    for (const start of [300, 480, 700]) {
      await page.setViewportSize({ width: 760, height: start });
      await renderTemplate(page, { posts: [{
        platform: "youtube", contentType: "video", detectedFormat: fmt,
        duration: fmt === "Long-form" ? 1424 : 42, views: 9,
        externalUrl: "https://www.youtube.com/watch?v=abcdefghijk",
        videoFallbackUrl: "https://api.orchyn.com/media/resolve?url=x&kind=video&sig=s",
      }] });
      seen.add(await page.locator(".mp-stage").first().evaluate((el) => {
        const r = el.getBoundingClientRect();
        return `${Math.round(r.width)}x${Math.round(r.height)}`;
      }));
    }
    expect(seen.size, `sizes seen: ${[...seen].join(", ")}`).toBe(1);
  });
}

// A slide whose image dies used to leave a black stage with the music still
// listed underneath, permanently -- the thumbnail had a fallback and self-healed
// through the resolver, slides had none and nothing retried.
test("a dead slide falls back instead of going black", async ({ page }) => {
  const cover = "https://api.orchyn.com/media/resolve?url=post&kind=thumbnail&sig=s";
  await page.route("**/slide-*.jpg", (r) => r.abort());
  await page.route("**/media/resolve**", (r) =>
    r.fulfill({ status: 200, contentType: "image/gif",
      // 1x1 transparent gif
      body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64") }));
  await renderTemplate(page, { posts: [{
    platform: "tiktok", contentType: "slideshow", slideCount: 3,
    creatorHandle: "u", externalUrl: "https://www.tiktok.com/@u/photo/1",
    thumbnailFallbackUrl: cover,
    mediaItems: [1, 2, 3].map((i) => ({ kind: "image", proxy_url: `https://cdn.example/slide-${i}.jpg` })),
  }] });
  await page.waitForTimeout(900);
  const healed = await page.evaluate(() =>
    [...document.querySelectorAll(".mp-slide")].map((s) => (s as HTMLImageElement).getAttribute("src")));
  expect(healed.every((s) => s === "https://api.orchyn.com/media/resolve?url=post&kind=thumbnail&sig=s"))
    .toBe(true);
});

// ChatGPT dispatches openai:set_globals for theme, display mode and height
// changes as well as for results. Rendering on every one rebuilt every <video>
// and <audio> in the view, which is the flashing users saw -- and Chrome logged
// 982 "too many WebMediaPlayers already in existence" interventions as the
// discarded players piled up.
test("a repeated set_globals does not re-render the view", async ({ page }) => {
  await page.route("**/media/**", () => { /* deliberately hangs */ });
  await page.setContent(ORCHYN_UI_TEMPLATE);
  const payload = { posts: [{
    platform: "tiktok", contentType: "video", duration: 12, views: 5,
    creatorHandle: "u", externalUrl: "https://www.tiktok.com/@u/video/1",
    videoUrl: "https://cdn.example/a.mp4", musicUrl: "https://cdn.example/a.mp3",
  }] };
  await page.evaluate((d) => {
    const w = window as unknown as Record<string, unknown>;
    w.__made = 0;
    new MutationObserver((recs) => {
      for (const r of recs)
        for (const n of Array.from(r.addedNodes)) {
          const el = n as HTMLElement;
          if (!el.querySelectorAll) continue;
          const n2 = (el.tagName === "VIDEO" ? 1 : 0) + el.querySelectorAll("video").length;
          (w.__made as number) && 0;
          w.__made = (w.__made as number) + n2;
        }
    }).observe(document.body, { childList: true, subtree: true });
    w.openai = { toolOutput: d };
    // Same object every time, as a host reusing its globals does.
    for (let i = 0; i < 12; i++) {
      window.dispatchEvent(new CustomEvent("openai:set_globals", {
        detail: { globals: { theme: i % 2 ? "dark" : "light", toolOutput: d } },
      }));
    }
  }, payload);
  await page.waitForTimeout(600);
  // Counting the elements left behind proves nothing: each render replaces the
  // DOM, so one video survives either way. What matters is how many were
  // *created* — every discarded one is a WebMediaPlayer Chrome had to hold.
  const created = await page.evaluate(() => (window as unknown as { __made: number }).__made);
  expect(created, "media elements created across 12 set_globals events").toBe(1);
  // And it did render once, rather than being skipped entirely.
  expect(await page.evaluate(() => document.querySelectorAll(".mp video").length)).toBe(1);
});

// ChatGPT injects window.openai asynchronously. A single read at parse time
// finds nothing and never looks again, so the view sat on its placeholder while
// the host held the result the whole time — which is the "Results will appear
// here" report. OpenAI's own guidance is to wait for the global and retry.
test("picks up a window.openai injected after load", async ({ page }) => {
  await page.route("**/media/**", () => { /* deliberately hangs */ });
  await page.setContent(ORCHYN_UI_TEMPLATE);
  // Nothing yet: the host has not injected anything.
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.querySelectorAll(".mp").length)).toBe(0);

  // The host arrives late, and never dispatches set_globals.
  await page.evaluate((d) => {
    (window as unknown as Record<string, unknown>).openai = { toolOutput: d };
  }, { posts: [{
    platform: "tiktok", contentType: "video", duration: 9, views: 3,
    creatorHandle: "u", externalUrl: "https://www.tiktok.com/@u/video/1",
    videoUrl: "https://cdn.example/a.mp4",
  }] });

  await expect
    .poll(async () => page.evaluate(() => document.querySelectorAll(".mp").length), { timeout: 6000 })
    .toBe(1);
});

// A <video> poster cannot report failure — there is no error event for it — so
// a dead cover left a black stage that nothing could notice or retry. TikTok
// cover signatures expire in hours, so this is the ordinary case: measured on a
// two-hour-old payload whose cover answered 403 while its video still played.
test("a dead video poster is swapped for the resolver's", async ({ page }) => {
  const fresh = "https://api.orchyn.com/media/resolve?url=post&kind=thumbnail&sig=s";
  await page.route("**/dead-cover.jpg", (r) => r.abort());
  await page.route("**/media/resolve**", (r) =>
    r.fulfill({ status: 200, contentType: "image/gif",
      body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64") }));
  await page.route("**/a.mp4", () => { /* hangs, so nothing else disturbs the poster */ });
  await renderTemplate(page, { posts: [{
    platform: "tiktok", contentType: "video", duration: 11, views: 4,
    creatorHandle: "u", externalUrl: "https://www.tiktok.com/@u/video/1",
    videoUrl: "https://cdn.example/a.mp4",
    thumbnailUrl: "https://cdn.example/dead-cover.jpg",
    thumbnailFallbackUrl: fresh,
  }] });
  await expect
    .poll(async () => page.locator("video").first().getAttribute("poster"), { timeout: 6000 })
    .toBe(fresh);
});

// Reported from MCPJam's multi-host view: Claude and Cursor shimmered while
// ChatGPT showed "Results will appear here as soon as a tool returns" for the
// whole call. A ChatGPT-shaped host mounts the view as part of a tool call, so
// window.openai existing with no output yet *is* the loading state — requiring
// toolInput first meant a host that sets it late, or never, kept the idle
// placeholder up throughout.
test("a chatgpt-shaped host with no output yet shows loading, not idle", async ({ page }) => {
  await page.setContent(ORCHYN_UI_TEMPLATE);
  await page.waitForTimeout(200);
  // Idle before any host appears, which is correct.
  expect(await page.evaluate(() => /Results will appear here/.test(document.body.innerText))).toBe(true);

  // The host mounts: present, but with neither toolInput nor toolOutput.
  await page.evaluate(() => { (window as unknown as Record<string, unknown>).openai = {}; });
  await expect
    .poll(async () => page.evaluate(() => ({
      idle: /Results will appear here/.test(document.body.innerText),
      shimmer: document.querySelectorAll("[class*=sk-]").length,
    })), { timeout: 5000 })
    .toEqual({ idle: false, shimmer: expect.any(Number) });
  expect(await page.evaluate(() => document.querySelectorAll("[class*=sk-]").length))
    .toBeGreaterThan(0);
});

// On ChatGPT the skeleton is driven by the poll rather than by a tool-input
// notification, so renderLoading ran every 250ms for the whole call — and once
// more per set_globals, which fires for theme, display mode and height changes
// too. Each run replaced #app, restarting .fade-in (opacity 0, shifted 8px
// down), the load-bar sweep and every skeleton shine four times a second: the
// blinking that was reported. Counting the rebuilds is the assertion; counting
// what is left on screen would pass either way.
test("the chatgpt skeleton is painted once, not on every tick", async ({ page }) => {
  await page.setContent(ORCHYN_UI_TEMPLATE);
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__paints = 0;
    new MutationObserver((recs) => {
      for (const r of recs)
        for (const n of Array.from(r.addedNodes)) {
          const el = n as HTMLElement;
          if (el.querySelector && el.querySelector(".load-bar")) w.__paints = (w.__paints as number) + 1;
        }
    }).observe(document.getElementById("app") as Node, { childList: true, subtree: true });
    // The host mounts the view as part of a call: present, no output yet.
    w.openai = { toolInput: { username: "iruy" } };
  });
  await page.waitForTimeout(1400);           // ~5 poll ticks at 250ms
  await page.evaluate(() => {
    for (let i = 0; i < 8; i++)
      window.dispatchEvent(new CustomEvent("openai:set_globals", {
        detail: { globals: { theme: i % 2 ? "dark" : "light" } },
      }));
  });
  await page.waitForTimeout(300);
  await expect(page.locator(".load-bar")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __paints: number }).__paints),
    "skeleton rebuilds across ~5 poll ticks and 8 set_globals events").toBe(1);
});

// The poll gave up after 40 ticks — ten seconds — and put the idle placeholder
// back. Every tool here that fetches a feed or watches a video runs longer than
// that, so the shimmer was taken down in the middle of a call that was still
// running; and since the poll is the only way a host that merely sets the
// global is ever read, the result that followed was never picked up either.
test("the chatgpt shimmer outlives a call longer than ten seconds", async ({ page }) => {
  await page.clock.install();
  await page.setContent(ORCHYN_UI_TEMPLATE);
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).openai = { toolInput: { username: "iruy" } };
  });
  await page.clock.runFor(1000);
  await expect(page.locator(".load-bar")).toBeVisible();

  // Well past the old budget, and past a slow tool call too.
  await page.clock.runFor(60_000);
  await expect(page.locator(".load-bar")).toBeVisible();
  expect(await page.evaluate(() => /Results will appear here/.test(document.body.innerText)))
    .toBe(false);

  // Still watching: a host that only sets the global is still read.
  await page.evaluate(() => {
    (window as unknown as { openai: Record<string, unknown> }).openai.toolOutput =
      { balance: 42, tier: "pro" };
  });
  await page.clock.runFor(3000);
  await expect(page.locator(".load-bar")).toHaveCount(0);
  expect(await page.evaluate(() => document.body.innerText)).toContain("42");
});

test("no horizontal overflow on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await renderTemplate(page, { posts: POSTS });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the card paints no background of its own", async ({ page }) => {
  await renderTemplate(page, HASHTAGS);
  const { bodyBg, scheme } = await page.evaluate(() => ({
    bodyBg: getComputedStyle(document.body).backgroundColor,
    scheme: getComputedStyle(document.documentElement).colorScheme,
  }));
  expect(bodyBg).toBe("rgba(0, 0, 0, 0)");
  // Without this the browser paints the iframe canvas white in a dark chat.
  expect(scheme).toBe("light dark");
});

for (const scheme of ["dark", "light"] as const) {
  test(`text meets WCAG AA in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });

    await renderTemplate(page, HASHTAGS);
    // The hashtag rows are anchors. Unstyled, they fell back to the UA's link
    // blue, which sat around 3:1 on the dark card.
    const rows = await page.evaluate(() => {
      const el = document.querySelector(".comment-row") as HTMLElement | null;
      if (!el) return null;
      let bg = "rgba(0, 0, 0, 0)";
      let n: HTMLElement | null = el;
      while (n && (bg === "rgba(0, 0, 0, 0)" || bg === "transparent")) {
        bg = getComputedStyle(n).backgroundColor; n = n.parentElement;
      }
      return { fg: getComputedStyle(el).color, bg };
    });
    expect(rows).not.toBeNull();
    expect(contrast(rows!.fg, rows!.bg)).toBeGreaterThanOrEqual(4.5);

    // TikTok, Douyin and X are pure-black brands; used as label text on the
    // dark card the badge was effectively invisible.
    await renderTemplate(page, { posts: THUMB_POSTS });
    const badge = await page.evaluate(() => {
      const el = document.querySelector(".badge") as HTMLElement | null;
      if (!el) return null;
      let bg = "rgba(0, 0, 0, 0)";
      let n: HTMLElement | null = el;
      while (n && (bg === "rgba(0, 0, 0, 0)" || bg === "transparent")) {
        bg = getComputedStyle(n).backgroundColor; n = n.parentElement;
      }
      return { fg: getComputedStyle(el).color, bg };
    });
    expect(badge).not.toBeNull();
    expect(contrast(badge!.fg, badge!.bg)).toBeGreaterThanOrEqual(4.5);
  });
}

// Compare was inert for two independent reasons, so both are pinned here.
test("selecting posts and pressing Compare calls the tool", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await page.setContent(ORCHYN_UI_TEMPLATE);
  await page.evaluate(() => {
    (window as unknown as { __sent: unknown[] }).__sent = [];
    const orig = window.parent.postMessage.bind(window.parent);
    window.parent.postMessage = (m: unknown, o: string) => {
      (window as unknown as { __sent: unknown[] }).__sent.push(JSON.parse(JSON.stringify(m)));
      return orig(m as never, o as never);
    };
  });
  await page.evaluate(
    (d) => window.postMessage(
      { method: "ui/notifications/tool-result", params: { structuredContent: d } }, "*"),
    { posts: POSTS },
  );
  await page.waitForTimeout(600);

  // These fixtures point at a URL that does not resolve, so the failure
  // overlay is showing — the case where the overlay used to cover the
  // checkbox at z-index 4 and make the card impossible to select.
  await expect(page.locator(".mp-err").first()).toBeVisible();

  await page.locator(".mp-pick").nth(0).click();
  await page.locator(".mp-pick").nth(1).click();
  await expect(page.locator("#pickgo")).toBeEnabled();

  await page.evaluate(() => { (window as unknown as { __sent: unknown[] }).__sent = []; });
  await page.locator("#pickgo").click();
  await page.waitForTimeout(250);

  const sent = await page.evaluate(
    () => (window as unknown as { __sent: { method: string; params?: unknown }[] }).__sent);
  const call = sent.find((m) => m.method === "tools/call");
  // MCP Apps reuses the core tools/call for invocation; a ui-prefixed name is
  // answered by no host, which is what made the button appear to do nothing.
  expect(call, `expected a tools/call, got: ${sent.map((m) => m.method).join(",")}`).toBeTruthy();
  expect(call!.params).toEqual({
    name: "compare_posts",
    arguments: { urls: [POSTS[0].externalUrl, POSTS[1].externalUrl] },
  });
});

// An analysis result, shaped the way analyze_post_fast returns one.
const ANALYSIS = {
  mode: "fast", analyzed: true,
  post: {
    platform: "tiktok", caption: "So you want to be a mangaka huh?", creatorHandle: "iruy",
    externalUrl: "https://www.tiktok.com/@iruy/video/1", contentType: "video",
    // The raw CDN link is signed and short-lived; the proxied companion is
    // what the sandboxed frame can actually load.
    videoUrl: "https://v16-signed.tiktokcdn.com/expiring/video.mp4",
    videoProxyUrl: "https://api.orchyn.com/media/proxy?url=enc",
    thumbnailUrl: "https://p16.tiktokcdn.com/t.jpg",
    thumbnailProxyUrl: "https://api.orchyn.com/media/proxy?url=t",
    views: 1540000, likes: 488700, comments: 2700,
  },
  analysis: {
    summary: "Strong hook.", hookStrength: 8, whyItWorks: "Names the audience.",
    scriptStructure: { hook: "h", buildUp: "b", payoff: "p", cta: "c" },
    viralTriggers: ["identity"], keyQuotes: ["q"], variationIdeas: ["v"],
    suggestedHook: "s", suggestedHashtags: ["manga"], niche: "manga",
  },
};

// The player starts on the platform URL by design and keeps the proxy as its
// one retry, so what this asserts is the *outcome* once the signed CDN link
// refuses the frame. It used to leave that link unrouted and read the src at a
// fixed 500ms, which made it a race against DNS: it passed on CI, where the
// failure lands fast enough for the retry to have fired, and failed locally,
// where it does not. Fail the link deliberately and wait for the swap.
test("the analysis player falls back to the proxy when the signed CDN url dies", async ({ page }) => {
  await page.route("**/expiring/video.mp4", (r) => r.abort());
  await page.setContent(ORCHYN_UI_TEMPLATE);
  await page.evaluate(
    (d) => window.postMessage(
      { method: "ui/notifications/tool-result", params: { structuredContent: d } }, "*"),
    ANALYSIS,
  );
  // The initial choice is the platform URL — one less hop that can fail.
  await expect
    .poll(async () => page.locator("video").first().getAttribute("src"), { timeout: 6000 })
    .toBe(ANALYSIS.post.videoProxyUrl);
});

test("analysis actions are offered once each and call their tool", async ({ page }) => {
  await page.setContent(ORCHYN_UI_TEMPLATE);
  await page.evaluate(() => {
    (window as unknown as { __sent: unknown[] }).__sent = [];
    const orig = window.parent.postMessage.bind(window.parent);
    window.parent.postMessage = (m: unknown, o: string) => {
      (window as unknown as { __sent: unknown[] }).__sent.push(JSON.parse(JSON.stringify(m)));
      return orig(m as never, o as never);
    };
  });
  await page.evaluate(
    (d) => window.postMessage(
      { method: "ui/notifications/tool-result", params: { structuredContent: d } }, "*"),
    ANALYSIS,
  );
  await page.waitForTimeout(500);

  // The card used to render postCard's own action row *and* its follow-up
  // row, showing three of these twice.
  const tools = await page.evaluate(
    () => [...document.querySelectorAll(".ai-btn")].map((b) => b.getAttribute("data-ai")));
  expect(tools).toEqual(["create_variants", "write_hooks", "repurpose_post", "analyze_comments"]);

  for (const tool of tools) {
    await page.evaluate(() => { (window as unknown as { __sent: unknown[] }).__sent = []; });
    await page.locator(`.ai-btn[data-ai="${tool}"]`).click();
    await page.waitForTimeout(200);
    const sent = await page.evaluate(
      () => (window as unknown as { __sent: { method: string; params?: unknown }[] }).__sent);
    const call = sent.find((m) => m.method === "tools/call");
    expect(call, `${tool} sent no tools/call`).toBeTruthy();
    expect(call!.params).toEqual({
      name: tool, arguments: { url: ANALYSIS.post.externalUrl },
    });
  }
});

// Links leave the frame through the host, not through the anchor: a sandboxed
// view cannot navigate the top-level window, so every "Open on ..." button and
// every trending-hashtag row was inert.
test("external links ask the host to open them", async ({ page }) => {
  await page.setContent(ORCHYN_UI_TEMPLATE);
  await page.evaluate(() => {
    (window as unknown as { __sent: unknown[] }).__sent = [];
    const orig = window.parent.postMessage.bind(window.parent);
    window.parent.postMessage = (m: unknown, o: string) => {
      (window as unknown as { __sent: unknown[] }).__sent.push(JSON.parse(JSON.stringify(m)));
      return orig(m as never, o as never);
    };
  });
  await page.evaluate(
    (d) => window.postMessage(
      { method: "ui/notifications/tool-result", params: { structuredContent: d } }, "*"),
    { posts: POSTS },
  );
  await page.waitForTimeout(500);

  await page.evaluate(() => { (window as unknown as { __sent: unknown[] }).__sent = []; });
  await page.locator(".mp-open").first().click();
  await page.waitForTimeout(200);
  const sent = await page.evaluate(
    () => (window as unknown as { __sent: { method: string; params?: unknown }[] }).__sent);
  const open = sent.find((m) => m.method === "ui/open-link");
  expect(open, `expected ui/open-link, got: ${sent.map((m) => m.method).join(",")}`).toBeTruthy();
  expect(open!.params).toEqual({ url: POSTS[0].externalUrl });
});

// Reported from ChatGPT: pressing Compare inside the view said "Copy failed"
// and nothing ran. ChatGPT's Apps SDK does not answer the MCP Apps postMessage
// bridge — a widget there invokes a tool with window.openai.callTool and opens
// a link with window.openai.openExternal. The view only ever posted tools/call
// and ui/open-link, so every button posted into the void, waited out its
// 1500ms timeout and fell through to the clipboard, which a sandboxed widget
// iframe has no permission to write either. Hence the message, and hence
// nothing happening.
test.describe("chatgpt host actions", () => {
  // The Apps SDK surface, plus a clipboard that rejects the way a sandboxed
  // widget iframe's does — so a regression lands on "Copy failed", not on a
  // silent pass because the fallback happened to work.
  const asChatGpt = async (page: Page, payload: unknown) => {
    await page.setContent(ORCHYN_UI_TEMPLATE);
    await page.evaluate((d) => {
      const w = window as unknown as Record<string, unknown>;
      w.__sent = [];
      const orig = window.parent.postMessage.bind(window.parent);
      window.parent.postMessage = (m: unknown, o: string) => {
        (w.__sent as unknown[]).push(JSON.parse(JSON.stringify(m)));
        return orig(m as never, o as never);
      };
      w.__called = [];
      w.__opened = [];
      if (!navigator.clipboard)
        Object.defineProperty(navigator, "clipboard", { value: {}, configurable: true });
      navigator.clipboard.writeText = () =>
        Promise.reject(new DOMException("Write permission denied.", "NotAllowedError"));
      w.openai = {
        toolOutput: d,
        callTool: async (name: string, args: unknown) => {
          (w.__called as unknown[]).push({ name, args });
          return { content: [] };
        },
        openExternal: (o: { href: string }) => { (w.__opened as unknown[]).push(o.href); },
      };
      window.dispatchEvent(new CustomEvent("openai:set_globals",
        { detail: { globals: { toolOutput: d } } }));
    }, payload);
    await page.waitForTimeout(600);
  };

  const readSpies = (page: Page) => page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    return {
      called: w.__called as { name: string; args: unknown }[],
      opened: w.__opened as string[],
      bridge: (w.__sent as { method: string }[]).map((m) => m.method).filter(Boolean),
    };
  });

  test("Compare runs the tool instead of failing to copy", async ({ page }) => {
    await asChatGpt(page, { posts: POSTS });
    await page.locator(".mp-pick").nth(0).click();
    await page.locator(".mp-pick").nth(1).click();
    await expect(page.locator("#pickgo")).toBeEnabled();
    await page.locator("#pickgo").click();
    await page.waitForTimeout(400);

    const { called, bridge } = await readSpies(page);
    expect(called).toEqual([{
      name: "compare_posts",
      args: { urls: [POSTS[0].externalUrl, POSTS[1].externalUrl] },
    }]);
    // The dead bridge must not be used when the host offers its own API.
    expect(bridge).not.toContain("tools/call");
    await expect(page.locator("#pickgo")).not.toHaveText(/failed/i);
  });

  test("every analysis action button reaches the tool", async ({ page }) => {
    await asChatGpt(page, ANALYSIS);
    const tools = await page.evaluate(
      () => [...document.querySelectorAll(".ai-btn")].map((b) => b.getAttribute("data-ai")));
    expect(tools).toEqual(["create_variants", "write_hooks", "repurpose_post", "analyze_comments"]);

    for (const tool of tools) {
      await page.locator(`.ai-btn[data-ai="${tool}"]`).click();
      await page.waitForTimeout(200);
      await expect(page.locator(`.ai-btn[data-ai="${tool}"]`)).not.toContainText(/failed|Try in chat/i);
      await page.waitForTimeout(1700);   // let the label restore before the next
    }
    const { called, bridge } = await readSpies(page);
    expect(called.map((c) => c.name)).toEqual(tools);
    expect(called.every((c) => JSON.stringify(c.args) === JSON.stringify({ url: ANALYSIS.post.externalUrl }))).toBe(true);
    expect(bridge).not.toContain("tools/call");
  });

  test("a link leaves through openExternal", async ({ page }) => {
    await asChatGpt(page, { posts: POSTS });
    await page.locator(".mp-open").first().click();
    await page.waitForTimeout(300);
    const { opened, bridge } = await readSpies(page);
    expect(opened).toEqual([POSTS[0].externalUrl]);
    expect(bridge).not.toContain("ui/open-link");
  });
});

// The bug as reported, and it was on Claude: pressing Compare said "Copy
// failed" while the host was running the tool perfectly well. The fallback
// fired at 1500ms — but a tool call is not a UI event. Measured against the
// live server, discover_social_posts takes 10.3s and compare_posts 10.4s, so
// the deadline expired seven times over on the ordinary path, every time. The
// user was told the call had failed, the clipboard fallback then failed too
// (a sandboxed widget iframe has no clipboard-write grant), and the real
// result — when it arrived — was dropped on the floor.
test("a slow tool call is not reported as a failure", async ({ page }) => {
  const RESULT = {
    country: "US", days: 7,
    hashtags: [{ hashtag: "compared", posts: 1, views: 2, trend: "rising", url: "https://x.com" }],
  };
  // The view has to sit in a frame whose parent is the host. At top level
  // window.parent is the view itself, so the tools/call it posts arrives back
  // at its own listener and resolves the very request it just made — which
  // makes any timing assertion here vacuous.
  await page.setContent(
    `<!doctype html><body style="margin:0"><iframe id="w" style="width:420px;height:900px;border:0"></iframe></body>`);
  await page.evaluate(({ tpl, result }) => {
    const f = document.getElementById("w") as HTMLIFrameElement;
    window.addEventListener("message", (ev) => {
      const d = ev.data as { id?: number; method?: string };
      if (!d || d.id == null || !d.method) return;
      const isCall = d.method === "tools/call";
      // Handshake at once, tool four seconds later: well past the old 1500ms
      // deadline, well inside what a real call takes.
      setTimeout(() => f.contentWindow?.postMessage(
        { jsonrpc: "2.0", id: d.id, result: isCall ? { structuredContent: result } : {} }, "*"),
        isCall ? 4000 : 0);
    });
    f.srcdoc = tpl;
  }, { tpl: ORCHYN_UI_TEMPLATE, result: RESULT });
  await page.waitForTimeout(400);

  const inner = page.frames().find((f) => f !== page.mainFrame())!;
  await inner.evaluate(() => {
    // A sandboxed widget iframe carries no clipboard-write grant, so the
    // fallback this used to take cannot succeed either.
    if (!navigator.clipboard)
      Object.defineProperty(navigator, "clipboard", { value: {}, configurable: true });
    navigator.clipboard.writeText = () =>
      Promise.reject(new DOMException("Write permission denied.", "NotAllowedError"));
  });
  await inner.evaluate((d) => window.postMessage(
    { method: "ui/notifications/tool-result", params: { structuredContent: d } }, "*"), { posts: POSTS });
  await page.waitForTimeout(700);

  const frame = page.frameLocator("#w");
  await frame.locator(".mp-pick").nth(0).click();
  await frame.locator(".mp-pick").nth(1).click();
  await expect(frame.locator("#pickgo")).toBeEnabled();
  await frame.locator("#pickgo").click();

  // Watch the whole flight rather than sampling the end: the old build showed
  // the failure at 1.5s and had restored the idle label by ~3.3s, so a single
  // late assertion would call this fixed while it was broken.
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(250);
    const shown = await inner.evaluate(() => document.getElementById("app")?.innerText || "");
    expect(shown, `a failure was reported ${i * 250}ms into a call the host was still running`)
      .not.toMatch(/Copy failed|Try in chat/i);
  }

  // And the response is not merely awaited, it is rendered.
  await expect.poll(async () =>
    inner.evaluate(() => document.getElementById("app")?.textContent || ""), { timeout: 8000 })
    .toContain("compared");
});

test("the open button sits in the overlay, not in a footer row", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 820 });
  await page.setContent(ORCHYN_UI_TEMPLATE);
  await page.evaluate(
    (d) => window.postMessage(
      { method: "ui/notifications/tool-result", params: { structuredContent: d } }, "*"),
    { posts: POSTS },
  );
  await page.waitForTimeout(500);

  // The footer cost a whole row under every card in a gallery.
  await expect(page.locator(".card-foot")).toHaveCount(0);

  const geom = await page.evaluate(() => {
    const open = document.querySelector(".mp-open")?.getBoundingClientRect();
    const pick = document.querySelector(".mp-pick")?.getBoundingClientRect();
    if (!open || !pick) return null;
    return {
      sameRow: Math.abs(open.top - pick.top) < 2,
      overlaps: !(open.right <= pick.left || pick.right <= open.left),
      openLeftOfPick: open.right <= pick.left,
    };
  });
  expect(geom).not.toBeNull();
  expect(geom!.sameRow).toBe(true);
  expect(geom!.overlaps).toBe(false);
  expect(geom!.openLeftOfPick).toBe(true);
});

// ui/notifications/tool-input is the one the spec requires and sends exactly
// once; tool-input-partial is optional streaming on top of it. The view
// listened only for the partial, and gated the shimmer on a params.name the
// spec never sends — so hosts left it sitting on the idle placeholder until
// the result arrived.
test.describe("loading state", () => {
  const send = (page: Page, method: string, params: unknown) =>
    page.evaluate(([m, p]) => window.postMessage({ method: m, params: p }, "*"),
      [method, params] as [string, unknown]);

  const appText = (page: Page) =>
    page.evaluate(() => (document.getElementById("app")?.textContent || "").trim());

  test("the required tool-input notification starts the shimmer", async ({ page }) => {
    await page.setContent(ORCHYN_UI_TEMPLATE);
    await page.waitForTimeout(300);
    expect(await appText(page)).toContain("Results will appear");

    // Exactly the spec payload: arguments only, no tool name.
    await send(page, "ui/notifications/tool-input", { arguments: { url: "https://tiktok.com/@a/video/1" } });
    await page.waitForTimeout(250);

    await expect(page.locator(".load-bar")).toBeVisible();
    expect(await appText(page)).not.toContain("Results will appear");
  });

  // With no tool name available, the arguments decide the skeleton.
  for (const [args, label, cards, rows] of [
    [{ urls: ["a", "b", "c"] }, "Comparing posts", 3, 0],
    [{ country: "US", days: 7 }, "Reading the trend board", 0, 6],
    [{ username: "iruy" }, "Loading their posts", 3, 0],
    [{ url: "https://x" }, "Working on the post", 1, 0],
  ] as [Record<string, unknown>, string, number, number][]) {
    test(`shapes the skeleton from ${Object.keys(args).join("+")}`, async ({ page }) => {
      await page.setContent(ORCHYN_UI_TEMPLATE);
      await send(page, "ui/notifications/tool-input", { arguments: args });
      await page.waitForTimeout(250);
      await expect(page.locator(".load-head")).toContainText(label);
      await expect(page.locator(".sk-card")).toHaveCount(cards);
      await expect(page.locator(".sk-row")).toHaveCount(rows);
    });
  }

  test("a cancelled call says so instead of shimmering forever", async ({ page }) => {
    await page.setContent(ORCHYN_UI_TEMPLATE);
    await send(page, "ui/notifications/tool-input", { arguments: { url: "https://x" } });
    await page.waitForTimeout(200);
    await send(page, "ui/notifications/tool-cancelled", { reason: "user stopped it" });
    await page.waitForTimeout(200);
    expect(await appText(page)).toContain("Cancelled: user stopped it");
    await expect(page.locator(".load-bar")).toHaveCount(0);
  });

  test("the result replaces the shimmer", async ({ page }) => {
    await page.setContent(ORCHYN_UI_TEMPLATE);
    await send(page, "ui/notifications/tool-input", { arguments: { country: "US" } });
    await page.waitForTimeout(200);
    await send(page, "ui/notifications/tool-result", {
      structuredContent: {
        country: "US", days: 7,
        hashtags: [{ hashtag: "x", posts: 1, views: 2, trend: "rising", url: "https://x.com" }],
      },
    });
    await page.waitForTimeout(350);
    await expect(page.locator(".load-bar")).toHaveCount(0);
    expect(await appText(page)).toContain("Trending hashtags");
  });
});

// Media plays from the platform URL directly; /media/proxy is only a retry.
test.describe("media source", () => {
  const render = async (page: Page, post: Record<string, unknown>) => {
    await page.setContent(ORCHYN_UI_TEMPLATE);
    await page.evaluate(
      (d) => window.postMessage(
        { method: "ui/notifications/tool-result", params: { structuredContent: d } }, "*"),
      { post },
    );
    await page.waitForSelector(".mp", { timeout: 5000 });
  };

  const BASE = {
    platform: "tiktok", caption: "c", creatorHandle: "u",
    externalUrl: "https://www.tiktok.com/@u/video/1", contentType: "video", views: 1,
  };

  test("plays the platform url, carrying the proxy as a retry", async ({ page }) => {
    // Hold the request open rather than letting it fail: an unreachable URL
    // errors on its own schedule, and the retry below would swap the src out
    // from under the assertion. Never fulfilling the route means no error
    // event, so the initial choice is what we actually measure.
    await page.route("**/direct.mp4", () => { /* deliberately hangs */ });
    await render(page, { ...BASE, videoUrl: "https://cdn.example/direct.mp4",
      videoProxyUrl: "https://api.orchyn.com/media/proxy?url=enc" });
    const initial = await page.evaluate(() => ({
      src: document.querySelector("video")?.getAttribute("src"),
      fallback: document.querySelector(".mp")?.getAttribute("data-mp-fallback"),
    }));
    expect(initial.src).toBe("https://cdn.example/direct.mp4");
    expect(initial.fallback).toBe("https://api.orchyn.com/media/proxy?url=enc");
  });

  // A /media/resolve link is expensive on the server side: a provider call
  // that takes eight to twenty-five seconds, or a full yt-dlp download.
  // Preloading every card on a page of eight therefore pays that eight times
  // over for cards nobody looks at -- which is what got us rate limited by
  // Bilibili. Only a card actually on screen may warm itself, and only once.
  test("only the card on screen warms a resolver-backed video", async ({ page }) => {
    await page.route("**/media/resolve**", () => { /* deliberately hangs */ });
    await page.setViewportSize({ width: 390, height: 700 });
    const posts = Array.from({ length: 8 }, (_, i) => ({
      ...BASE, platform: "bilibili", duration: 269, id: `p${i}`,
      externalUrl: `https://www.bilibili.com/video/BV${i}`,
      videoFallbackUrl: `https://api.orchyn.com/media/resolve?url=enc${i}&kind=video&sig=s`,
    }));
    await page.setContent(ORCHYN_UI_TEMPLATE);
    await page.evaluate((d) => window.postMessage(
      { method: "ui/notifications/tool-result", params: { structuredContent: d } }, "*"), { posts });
    await page.waitForTimeout(800);

    const preloads = await page.evaluate(() =>
      Array.from(document.querySelectorAll("video")).map((v) => v.preload));
    // Whatever the layout does with the rest, the ones out of sight must not
    // have started anything.
    expect(preloads.length).toBeGreaterThan(1);
    expect(preloads[preloads.length - 1]).toBe("none");
    expect(preloads.filter((p) => p === "metadata").length).toBeLessThan(preloads.length);
  });

  // With preload="none" the browser knows nothing about the video until the
  // first press, so the scrubber read "0:00 / 0:00" and the card looked like
  // it had failed before anyone touched it. The listing already carries the
  // duration.
  test("shows the real duration before anything has loaded", async ({ page }) => {
    await page.route("**/media/resolve**", () => { /* deliberately hangs */ });
    await render(page, { ...BASE, platform: "youtube", duration: 1424,
      videoFallbackUrl: "https://api.orchyn.com/media/resolve?url=enc&kind=video&sig=s" });
    const shown = await page.locator(".mp-dur").first().textContent();
    expect(shown).toBe("23:44");
  });

  test("still preloads a direct cdn video", async ({ page }) => {
    // There a preload is a cheap range request, and it is what makes the
    // first frame appear without a click.
    await page.route("**/direct.mp4", () => { /* deliberately hangs */ });
    await render(page, { ...BASE, videoUrl: "https://cdn.example/direct.mp4" });
    expect(await page.evaluate(() => document.querySelector("video")?.getAttribute("preload")))
      .toBe("metadata");
  });

  test("retries through the proxy once, then reports failure", async ({ page }) => {
    await render(page, { ...BASE, videoUrl: "https://cdn.example/direct.mp4",
      videoProxyUrl: "https://api.orchyn.com/media/proxy?url=enc" });
    await page.evaluate(() => document.querySelector("video")!.dispatchEvent(new Event("error")));
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => document.querySelector("video")?.getAttribute("src")))
      .toBe("https://api.orchyn.com/media/proxy?url=enc");
    // The retry is spent; a second failure is a real failure.
    await page.evaluate(() => document.querySelector("video")!.dispatchEvent(new Event("error")));
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => document.querySelector(".mp-err")?.hidden)).toBe(false);
  });

  test("thumbnail, music and sound covers use the platform url", async ({ page }) => {
    // healPosters probes the poster and swaps to the proxy when the probe
    // *errors*, so an unrouted thumbnail made this a race against DNS: green
    // locally, red on CI, and a red CI skips the deploy and the publish for a
    // reason that is not real. Answer the probe instead of holding it open —
    // holding leaves the request pending, and the setContent below then waits
    // on a load event that never comes.
    await page.route("**/t.jpg", (r) => r.fulfill({
      status: 200, contentType: "image/gif",
      body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"),
    }));
    await render(page, { ...BASE, videoUrl: "https://cdn.example/v.mp4",
      thumbnailUrl: "https://cdn.example/t.jpg",
      thumbnailProxyUrl: "https://api.orchyn.com/media/proxy?url=t",
      musicUrl: "https://cdn.example/m.mp3",
      musicProxyUrl: "https://api.orchyn.com/media/proxy?url=m" });
    expect(await page.evaluate(() => document.querySelector("video")?.getAttribute("poster")))
      .toBe("https://cdn.example/t.jpg");
    expect(await page.evaluate(() => document.querySelector("audio")?.getAttribute("src")))
      .toBe("https://cdn.example/m.mp3");

    await page.setContent(ORCHYN_UI_TEMPLATE);
    await page.evaluate(() => window.postMessage({
      method: "ui/notifications/tool-result",
      params: { structuredContent: { sounds: [{
        title: "t", author: "a", platform: "tiktok",
        coverUrl: "https://cdn.example/cover.jpg",
        coverProxyUrl: "https://api.orchyn.com/media/proxy?url=c",
        playUrl: "https://cdn.example/play.mp3",
        playProxyUrl: "https://api.orchyn.com/media/proxy?url=p", videoCount: 5 }] } },
    }, "*"));
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.querySelector("audio")?.getAttribute("src")))
      .toBe("https://cdn.example/play.mp3");
  });
});

// A view is reused across tool calls. toolResultReceived was set on the first
// result and never cleared, so every later call skipped the shimmer and left
// the previous tool's cards on screen — asking for Instagram posts and then
// TikTok showed the Instagram ones again.
test("a second tool call in the same view replaces the first", async ({ page }) => {
  const feed = (platform: string) => ({
    platform,
    posts: [1, 2].map((i) => ({
      platform, caption: `${platform} post ${i}`, creatorHandle: `${platform}_user${i}`,
      externalUrl: `https://${platform}.com/p/${i}`, contentType: "video",
      videoUrl: `https://cdn.example/${platform}${i}.mp4`,
      thumbnailUrl: `https://cdn.example/${platform}${i}.jpg`,
      views: 1, likes: 2, comments: 3,
    })),
  });
  const send = (method: string, params: unknown) =>
    page.evaluate(([m, p]) => window.postMessage({ method: m, params: p }, "*"),
      [method, params] as [string, unknown]);
  const appText = () =>
    page.evaluate(() => (document.getElementById("app")?.textContent || "").trim());

  await page.setContent(ORCHYN_UI_TEMPLATE);
  await send("ui/notifications/tool-input", { arguments: { niche: "fitness", platform: "instagram" } });
  await page.waitForTimeout(150);
  await send("ui/notifications/tool-result", { structuredContent: feed("instagram") });
  await page.waitForTimeout(350);
  expect(await appText()).toContain("instagram_user1");

  // Same view, new call.
  await send("ui/notifications/tool-input", { arguments: { niche: "fitness", platform: "tiktok" } });
  await page.waitForTimeout(200);
  await expect(page.locator(".load-bar")).toBeVisible();
  expect(await appText(), "stale results must not sit under the new request")
    .not.toContain("instagram_user1");

  await send("ui/notifications/tool-result", { structuredContent: feed("tiktok") });
  await page.waitForTimeout(350);
  const final = await appText();
  expect(final).toContain("tiktok_user1");
  expect(final).not.toContain("instagram_user1");
});


// When a signed platform URL expires there is nothing left to proxy — the link
// is dead for the server too. The retry target is the resolver, which re-fetches
// the post and hands back a fresh link (and for YouTube/Bilibili, which publish
// no stream at all, downloads it once).
test.describe("self-healing media", () => {
  const RESOLVE = "https://api.orchyn.com/media/resolve?url=https%3A%2F%2Ftiktok.com%2F%40u%2Fvideo%2F1";
  const POST = {
    platform: "tiktok", caption: "c", creatorHandle: "u",
    externalUrl: "https://tiktok.com/@u/video/1", contentType: "video", views: 1,
    videoUrl: "https://cdn.example/expired.mp4",
    videoProxyUrl: "https://api.orchyn.com/media/proxy?url=x",
    videoFallbackUrl: `${RESOLVE}&kind=video`,
    musicUrl: "https://cdn.example/expired.mp3",
    musicFallbackUrl: `${RESOLVE}&kind=music`,
  };

  test("prefers the resolver over the proxy as the retry target", async ({ page }) => {
    await page.route("**/expired.mp4", () => { /* hold open */ });
    await page.setContent(ORCHYN_UI_TEMPLATE);
    await page.evaluate(
      (d) => window.postMessage(
        { method: "ui/notifications/tool-result", params: { structuredContent: d } }, "*"),
      { post: POST });
    await page.waitForSelector(".mp", { timeout: 5000 });

    expect(await page.evaluate(() => document.querySelector("video")?.getAttribute("src")))
      .toBe(POST.videoUrl);
    // Not videoProxyUrl: proxying an expired link fails just as surely.
    expect(await page.evaluate(() => document.querySelector(".mp")?.getAttribute("data-mp-fallback")))
      .toBe(POST.videoFallbackUrl);
    expect(await page.evaluate(() => document.querySelector("audio")?.getAttribute("data-fallback")))
      .toBe(POST.musicFallbackUrl);
  });

  test("swaps to the resolver when the platform link fails", async ({ page }) => {
    await page.route("**/expired.mp4", () => { /* hold open */ });
    await page.setContent(ORCHYN_UI_TEMPLATE);
    await page.evaluate(
      (d) => window.postMessage(
        { method: "ui/notifications/tool-result", params: { structuredContent: d } }, "*"),
      { post: POST });
    await page.waitForSelector(".mp", { timeout: 5000 });
    await page.evaluate(() => document.querySelector("video")!.dispatchEvent(new Event("error")));
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.querySelector("video")?.getAttribute("src")))
      .toBe(POST.videoFallbackUrl);
  });

  test("an expired thumbnail swaps to its fallback", async ({ page }) => {
    await page.setContent(ORCHYN_UI_TEMPLATE);
    await page.evaluate(() => {
      const img = document.createElement("img");
      img.src = "https://cdn.example/expired.jpg";
      img.setAttribute("data-fallback", "https://api.orchyn.com/media/resolve?url=x&kind=thumbnail");
      document.getElementById("app")!.appendChild(img);
      img.dispatchEvent(new Event("error"));
    });
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => document.querySelector("#app img")?.getAttribute("src")))
      .toBe("https://api.orchyn.com/media/resolve?url=x&kind=thumbnail");
  });
});

/**
 * A TikTok photo post carries its slides *and* a server-rendered slideshow
 * video. The player decided "slideshow" from the absence of a video, so it
 * picked that video: the stage was a black rectangle while the separate audio
 * element played on, which is what a caller saw as a black screen with music.
 * contentType is what actually identifies a photo post.
 */
test.describe("slideshow detection", () => {
  const slides = [1, 2, 3].map((i) => ({ kind: "image", proxy_url: `https://cdn.example/s${i}.jpg` }));
  const base = { platform: "tiktok", caption: "c", creatorHandle: "u", views: 1 };

  const render = async (page: Page, post: Record<string, unknown>) => {
    await page.route("**/*.mp4", () => { /* hold open, never errors */ });
    await page.setContent(ORCHYN_UI_TEMPLATE);
    await page.evaluate(
      (d) => window.postMessage(
        { method: "ui/notifications/tool-result", params: { structuredContent: d } }, "*"),
      { post });
    await page.waitForSelector(".mp", { timeout: 5000 });
    return page.evaluate(() => ({
      hasVideo: !!document.querySelector(".mp-stage video"),
      slides: document.querySelectorAll(".mp-slide").length,
      mode: document.querySelector(".mp")?.getAttribute("data-mp"),
    }));
  };

  test("a photo post shows its slides, not the rendered video", async ({ page }) => {
    const m = await render(page, {
      ...base, contentType: "slideshow",
      externalUrl: "https://tiktok.com/@u/photo/1",
      videoUrl: "https://cdn.example/rendered.mp4",
      musicUrl: "https://cdn.example/m.mp3",
      mediaItems: slides,
    });
    expect(m.hasVideo, "the rendered slideshow video must not be the stage").toBe(false);
    expect(m.slides).toBe(3);
    expect(m.mode).toBe("slides");
  });

  test("a genuine video still plays as a video", async ({ page }) => {
    const m = await render(page, {
      ...base, contentType: "video",
      externalUrl: "https://tiktok.com/@u/video/1",
      videoUrl: "https://cdn.example/v.mp4",
    });
    expect(m.hasVideo).toBe(true);
    expect(m.mode).toBe("video");
  });

  test("slides with no video keep working", async ({ page }) => {
    const m = await render(page, {
      ...base, contentType: "slideshow",
      externalUrl: "https://tiktok.com/@u/photo/2", mediaItems: slides,
    });
    expect(m.slides).toBe(3);
    expect(m.mode).toBe("slides");
  });
});

/**
 * Brand monitoring.
 *
 * The screen this replaced put every comment at the same weight: a complaint
 * under a 25K-upvote thread read exactly like one under a post nobody saw,
 * there was no way to narrow a nine-platform sweep, and comments could only be
 * picked one at a time. What is asserted here is the triage the redesign is
 * for — the comment leads, the post carries its reach, the counts filter, and
 * a selection reaches the host as ids the tool itself issued.
 */
test.describe("brand monitoring", () => {
  const thread = (
    platform: string,
    title: string,
    reach: Record<string, number>,
    mentions: Array<Record<string, unknown>>,
    aboutTerm = false,
  ) => ({
    post: {
      platform, title, externalUrl: `https://${platform}.example/p/${title.length}`, ...reach,
    },
    postIsAboutTerm: aboutTerm,
    mentionCount: mentions.length,
    mentions,
  });

  const MENTIONS = {
    term: "nike",
    since: "2026-01-01",
    searched: ["reddit", "youtube", "tiktok"],
    totalMentions: 4,
    totalThreads: 3,
    byPlatform: { reddit: 3, tiktok: 1, youtube: 0 },
    hasMore: true,
    nextOffset: 3,
    unavailable: [{ platform: "weibo", reason: "provider returned 400" }],
    threads: [
      thread("reddit", "Down 75%, insiders are buying", { likes: 25000, comments: 1900 }, [
        { id: "reddit:a:0", text: "nike keeps missing, and nike knows it", username: "one",
          likes: 17, replies: 4, postedAt: "2026-08-11T00:00:00Z", hits: 2,
          avatarUrl: "https://cdn.example/a.jpg", avatarProxyUrl: "https://proxy.example/a.jpg" },
        // No proxy and a dead URL: the row that has to degrade to an initial.
        { id: "reddit:a:1", text: "asics will never catch up to nike", username: "two",
          likes: 2, postedAt: "2026-08-19T00:00:00Z", hits: 1,
          avatarUrl: "https://cdn.example/missing.jpg" },
      ]),
      thread("reddit", "Blown away", { likes: 530, comments: 186 }, [
        { id: "reddit:b:0", text: "Nike will keep coming up with materials", username: "three",
          likes: 5, postedAt: "2026-08-28T00:00:00Z", hits: 1 },
      ]),
      thread("tiktok", "haul", { views: 1200000, likes: 40 }, [
        { id: "tiktok:c:0", text: "wearing nike today", username: "four",
          likes: 0, postedAt: "2026-02-02T00:00:00Z", hits: 1 },
      ]),
    ],
  };

  const text = (page: Page, sel: string) => page.locator(sel).allInnerTexts();

  test("a row reads as a person saying something", async ({ page }) => {
    await renderTemplate(page, MENTIONS);
    // Who, then what they said, then what it earned — the order a feed of
    // strangers has to be read in.
    const order = await page.locator(".mention-body").first()
      .evaluate((el) => [...el.children].map((c) => c.className));
    expect(order).toEqual(["mention-head", "mention-text", "mention-meta"]);
    const [head, comment, meta] = await page.locator(".mention").first().evaluate((el) => [
      el.querySelector(".mention-head")!.getBoundingClientRect().top,
      el.querySelector(".mention-text")!.getBoundingClientRect().top,
      el.querySelector(".mention-meta")!.getBoundingClientRect().top,
    ]);
    expect(head).toBeLessThan(comment);
    expect(comment).toBeLessThan(meta);
    // The handle appears once. It used to print on both lines, because these
    // platforms hand back one identity string and the layout asked for two.
    const row = await page.locator(".mention").first().innerText();
    expect(row.split("@one").length - 1, "the handle is printed twice").toBe(1);
  });

  /**
   * Avatars were in every upstream comment payload and every mapper dropped
   * them, so a monitoring feed could only ever show initials. A face plus a
   * platform mark is what makes a column of strangers scannable.
   */
  test("each comment carries a face and the network it came from", async ({ page }) => {
    // Serve the proxy so the avatar loads. Without this the fake URL 404s and
    // the fallback correctly swaps it — which is the *next* test's subject,
    // and made this one a race between the assertion and the error event.
    const PIXEL = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    await page.route("https://proxy.example/**", (route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: PIXEL }),
    );
    await renderTemplate(page, MENTIONS);
    const rows = page.locator(".mention");
    // One badge per row, whatever the picture does.
    await expect(page.locator(".mention-av-badge svg")).toHaveCount(await rows.count());
    // The proxy is preferred over the platform CDN — the view is sandboxed and
    // these URLs are cross-origin and often signed — with the original as the
    // one retry.
    const first = page.locator(".mention-av-img").first();
    await expect(first).toHaveAttribute("src", "https://proxy.example/a.jpg");
    await expect(first).toHaveAttribute("data-fallback", "https://cdn.example/a.jpg");
    // An initial is drawn underneath, so a picture that never loads degrades
    // to a letter rather than a broken-image glyph.
    await expect(page.locator(".mention-av-init").first()).toHaveText("O");
  });

  test("a picture that cannot load uncovers the initial", async ({ page }) => {
    await renderTemplate(page, MENTIONS);
    const img = page.locator('.mention[data-mention-id="reddit:a:1"] .mention-av-img');
    // No fallback on this one, so its first failure is its last.
    await expect(img).toHaveJSProperty("naturalWidth", 0);
    await expect(img).toBeHidden();
    await expect(page.locator('.mention[data-mention-id="reddit:a:1"] .mention-av-init'))
      .toBeVisible();
  });

  test("says when a comment was written the way a person would", async ({ page }) => {
    const now = new Date();
    const at = (msAgo: number) => new Date(now.getTime() - msAgo).toISOString();
    await renderTemplate(page, {
      term: "nike",
      totalMentions: 3,
      byPlatform: { reddit: 3 },
      threads: [thread("reddit", "t", { likes: 1 }, [
        { id: "r:0", text: "nike", username: "a", likes: 0, postedAt: at(2 * 3600e3), hits: 1 },
        { id: "r:1", text: "nike", username: "b", likes: 0, postedAt: at(26 * 3600e3), hits: 1 },
        { id: "r:2", text: "nike", username: "c", likes: 0, postedAt: at(3 * 86400e3), hits: 1 },
      ])],
    });
    const times = await text(page, ".mention-when");
    // A monitoring feed is read for recency first; an ISO timestamp answers a
    // question nobody asked.
    expect(times[0]).toMatch(/^today at /);
    expect(times[1]).toMatch(/^yesterday at /);
    expect(times[2]).toBe("3 days ago");
  });

  test("shows how far the post carrying a comment actually reached", async ({ page }) => {
    await renderTemplate(page, MENTIONS);
    // Without this, a comment under a 25K thread and one under a dead post are
    // indistinguishable, which is the judgement the screen exists to support.
    expect(await text(page, ".mgroup-reach")).toEqual([
      "25.0K likes · 1.9K comments",
      "530 likes · 186 comments",
      "1.2M views · 40 likes",
    ]);
  });

  test("marks every occurrence of the term, not just the first", async ({ page }) => {
    await renderTemplate(page, MENTIONS);
    // The first comment names it twice; a single-match highlight would hide
    // the repetition the hit badge is claiming.
    const first = page.locator(".mention").first();
    await expect(first.locator("mark")).toHaveCount(2);
    await expect(first.locator(".mention-hits")).toHaveText("×2");
    // Nothing is claimed for a comment that names it once.
    await expect(page.locator(".mention").nth(1).locator(".mention-hits")).toHaveCount(0);
  });

  test("counts narrow the list without another paid call", async ({ page }) => {
    await renderTemplate(page, MENTIONS);
    await expect(page.locator(".mgroup")).toHaveCount(3);
    await page.locator('.mchip[data-filter="tiktok"]').click();
    await expect(page.locator(".mgroup")).toHaveCount(1);
    await expect(page.locator(".mgroup-plat")).toHaveText(/TikTok/);
    // A sandboxed view cannot re-query, so narrowing must be local.
    await page.locator('.mchip[data-filter=""]').click();
    await expect(page.locator(".mgroup")).toHaveCount(3);
  });

  test("a platform that returned nothing is shown but is not a dead end", async ({ page }) => {
    await renderTemplate(page, MENTIONS);
    // "we looked at YouTube and it was quiet" is an answer worth keeping; a
    // filter to it is an empty screen, so the chip does not offer one.
    const quiet = page.locator('.mchip[data-filter="youtube"]');
    await expect(quiet).toHaveText(/YouTube\s*0/);
    await expect(quiet).toBeDisabled();
    // And a platform that could not answer at all is named, not silently missing.
    await expect(page.locator(".mention-down")).toContainText("Weibo");
  });

  test("sorting by recency reorders without losing anything", async ({ page }) => {
    await renderTemplate(page, MENTIONS);
    const titles = () => text(page, ".mgroup-title");
    expect(await titles()).toEqual(["Down 75%, insiders are buying", "Blown away", "haul"]);
    await page.locator('.msort-btn[data-sort="new"]').click();
    // Newest comment in each group: 2026-08-28, 2026-08-19, 2026-02-02.
    expect(await titles()).toEqual(["Blown away", "Down 75%, insiders are buying", "haul"]);
    await expect(page.locator(".mention")).toHaveCount(4);
  });

  test("a group can be selected in one go, and the selection survives a filter", async ({ page }) => {
    await renderTemplate(page, MENTIONS);
    await page.locator("[data-group-all]").first().click();
    await expect(page.locator(".mention-pick:checked")).toHaveCount(2);
    await expect(page.locator("#pickhint")).toHaveText("2 comments selected");
    // Narrowing the view is not unpicking: reddit still holds both.
    await page.locator('.mchip[data-filter="reddit"]').click();
    await expect(page.locator(".mention-pick:checked")).toHaveCount(2);
    await page.locator('.mchip[data-filter="tiktok"]').click();
    await expect(page.locator(".mention-pick:checked")).toHaveCount(0);
    await expect(page.locator("#pickhint")).toHaveText("2 comments selected");
    await page.locator('.mchip[data-filter=""]').click();
    await expect(page.locator(".mention-pick:checked")).toHaveCount(2);
  });

  test("hands the host the ids the tool issued, not the text it rendered", async ({ page }) => {
    await page.setContent(ORCHYN_UI_TEMPLATE);
    await page.evaluate((d) => {
      const w = window as unknown as Record<string, unknown>;
      w.__called = [];
      w.openai = {
        toolOutput: d,
        callTool: async (name: string, args: unknown) => {
          (w.__called as unknown[]).push({ name, args });
          return { content: [] };
        },
      };
      window.dispatchEvent(new CustomEvent("openai:set_globals",
        { detail: { globals: { toolOutput: d } } }));
    }, MENTIONS);
    await page.waitForTimeout(600);
    await page.locator('.mention[data-mention-id="reddit:a:0"] .mention-pick').click();
    await page.locator('.mention[data-mention-id="tiktok:c:0"] .mention-pick').click();
    await page.locator("#pickgo").click();
    await page.waitForTimeout(400);
    const called = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__called as { name: string; args: Record<string, unknown> }[]);
    // Addressable is the point: another tool has to be able to act on exactly
    // these comments, which only the tool's own ids allow.
    expect(called).toHaveLength(1);
    expect(called[0].name).toBe("analyze_comments");
    expect(called[0].args.ids).toEqual(["reddit:a:0", "tiktok:c:0"]);
    expect(called[0].args.comments).toEqual([
      "nike keeps missing, and nike knows it", "wearing nike today",
    ]);
    await expect(page.locator("#pickgo")).not.toContainText(/failed|Try in chat/i);
  });

  test("pages from the offset the tool handed back, and only unfiltered", async ({ page }) => {
    await page.setContent(ORCHYN_UI_TEMPLATE);
    await page.evaluate((d) => {
      const w = window as unknown as Record<string, unknown>;
      w.__called = [];
      w.openai = {
        toolOutput: d,
        callTool: async (name: string, args: unknown) => {
          (w.__called as unknown[]).push({ name, args });
          return { content: [] };
        },
      };
      window.dispatchEvent(new CustomEvent("openai:set_globals",
        { detail: { globals: { toolOutput: d } } }));
    }, MENTIONS);
    await page.waitForTimeout(600);
    // A filtered page is a page of something else, so it is not offered.
    await page.locator('.mchip[data-filter="reddit"]').click();
    await expect(page.locator(".mention-more")).toHaveCount(0);
    await page.locator('.mchip[data-filter=""]').click();
    await page.locator(".mention-more").click();
    await page.waitForTimeout(400);
    const called = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__called as { name: string; args: unknown }[]);
    expect(called).toEqual([{ name: "search_mentions", args: { term: "nike", offset: 3 } }]);
  });

  /**
   * A coordinated burst is a real shape in this data: one Weibo thread in a
   * live sweep carried seven near-identical fan posts, which pushed three
   * other platforms off the first screen. Collapsing is not hiding — the count
   * is on the button, and opening it costs nothing.
   */
  const BURST = {
    term: "nike",
    totalMentions: 7,
    byPlatform: { weibo: 7 },
    threads: [{
      post: { platform: "weibo", title: "campaign", externalUrl: "https://weibo.example/p/1", likes: 40000 },
      postIsAboutTerm: true,
      mentionCount: 7,
      mentions: [0, 1, 2, 3, 4, 5, 6].map((i) => ({
        id: `weibo:x:${i}`, text: `support nike ${i}`, username: `fan${i}`,
        likes: i, postedAt: `2026-0${i + 1}-01T00:00:00Z`, hits: 1,
      })),
    }],
  };

  test("a burst under one post does not take the whole screen", async ({ page }) => {
    await renderTemplate(page, BURST);
    await expect(page.locator(".mention")).toHaveCount(4);
    await expect(page.locator(".mgroup-rest")).toHaveText("Show 3 more from this post");
    await page.locator(".mgroup-rest").click();
    await expect(page.locator(".mention")).toHaveCount(7);
    await expect(page.locator(".mgroup-rest")).toHaveText("Show fewer");
    // Opening a group is a decision; a sort must not quietly undo it.
    await page.locator('.msort-btn[data-sort="new"]').click();
    await expect(page.locator(".mention")).toHaveCount(7);
    await page.locator(".mgroup-rest").click();
    await expect(page.locator(".mention")).toHaveCount(4);
  });

  test("select all reaches the comments no row is showing", async ({ page }) => {
    await page.setContent(ORCHYN_UI_TEMPLATE);
    await page.evaluate((d) => {
      const w = window as unknown as Record<string, unknown>;
      w.__called = [];
      w.openai = {
        toolOutput: d,
        callTool: async (name: string, args: unknown) => {
          (w.__called as unknown[]).push({ name, args });
          return { content: [] };
        },
      };
      window.dispatchEvent(new CustomEvent("openai:set_globals",
        { detail: { globals: { toolOutput: d } } }));
    }, BURST);
    await page.waitForTimeout(600);
    await expect(page.locator(".mention")).toHaveCount(4);
    // "All" means all seven, not the four that happen to be rendered — the
    // whole point of collapsing is that it changes the view, not the data.
    await page.locator("[data-group-all]").click();
    await expect(page.locator("#pickhint")).toHaveText("7 comments selected");
    await expect(page.locator("[data-group-all]")).toHaveText("Clear these");
    await page.locator("#pickgo").click();
    await page.waitForTimeout(400);
    const called = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__called as { args: Record<string, unknown> }[]);
    expect(called[0].args.ids).toHaveLength(7);
    // And the text of a collapsed comment comes from the result, not the DOM.
    expect(called[0].args.comments).toHaveLength(7);
    expect((called[0].args.comments as string[])[6]).toBe("support nike 6");
    // Clicking again clears all seven.
    await page.locator("[data-group-all]").click();
    await expect(page.locator("#pickbar")).toBeHidden();
  });

  test("says nothing was found rather than showing an empty frame", async ({ page }) => {
    await renderTemplate(page, {
      term: "nike", threads: [], totalMentions: 0, byPlatform: { reddit: 0 }, searched: ["reddit"],
    });
    await expect(page.locator(".empty-state")).toContainText("Nobody has mentioned that yet");
  });

  test("drops a post that neither it nor its comments name the term", async ({ page }) => {
    await renderTemplate(page, {
      term: "nike",
      totalMentions: 1,
      byPlatform: { reddit: 1 },
      threads: [
        thread("reddit", "names it in the title", { likes: 10 }, [], true),
        // Nothing to say: no matching comment, and the post is not about it.
        thread("reddit", "unrelated", { likes: 10 }, [], false),
        thread("reddit", "has one", { likes: 10 }, [
          { id: "reddit:d:0", text: "nike", username: "x", likes: 0, hits: 1 },
        ]),
      ],
    });
    expect(await text(page, ".mgroup-title")).toEqual(["names it in the title", "has one"]);
    // The kept one explains why it is there instead of showing an empty list.
    await expect(page.locator(".mgroup-none")).toHaveText(
      "The post names nike, but none of its comments do.");
    await expect(page.locator(".mgroup").first().locator("[data-group-all]")).toHaveCount(0);
  });


  /**
   * A comment review — the same view, drawn from labels a model produced rather
   * than from a brand sweep.
   *
   * The sentiment and category chips are the thing that could not exist before.
   * A sweep has no basis for them: nothing in that payload says whether a
   * comment is angry, and colouring it from a keyword guess would be
   * confidently wrong about the exact thing being scanned for. Once a model has
   * read the words, the label is worth drawing.
   */
  test.describe("comment review", () => {
    const REVIEW = {
      review: true,
      term: "Why did nike lose 200B in value?",
      url: "https://www.youtube.com/watch?v=7wrjbQDxqkM",
      summary: "Mostly negative, with one specific bug worth filing.",
      totalMentions: 4,
      byCategory: { bug_report: 2, praise: 1, question: 1 },
      bySentiment: { negative: 2, positive: 1, neutral: 1 },
      threads: [
        {
          post: { platform: "youtube", title: "Why did nike lose 200B in value?",
                  externalUrl: "https://www.youtube.com/watch?v=7wrjbQDxqkM", views: 11300 },
          postIsAboutTerm: false,
          mentionCount: 4,
          mentions: [
            { id: "c:0", text: "checkout does nothing on iOS 18", username: "ana", likes: 12,
              sentiment: "negative", category: "bug_report", hits: 1 },
            { id: "c:1", text: "same here, cart empties itself", username: "bo", likes: 4,
              sentiment: "negative", category: "bug_report", hits: 1 },
            { id: "c:2", text: "best release yet honestly", username: "cy", likes: 40,
              sentiment: "positive", category: "praise", hits: 1 },
            { id: "c:3", text: "when does this ship in the EU?", username: "di", likes: 2,
              sentiment: "neutral", category: "question", hits: 1 },
          ],
        },
      ],
    };

    test("labels every comment with what the model decided", async ({ page }) => {
      await renderTemplate(page, REVIEW);
      await expect(page.locator(".mention")).toHaveCount(4);
      const chips = await page.locator(".mention").first().locator(".chip").allInnerTexts();
      // CSS capitalises them, which is what a reader sees.
      expect(chips).toEqual(["Negative", "Bug Report"]);
      // Sentiment earns colour because a model read the words; category is a
      // bucket, not a judgement, so it stays neutral.
      await expect(page.locator(".chip-negative").first()).toBeVisible();
      await expect(page.locator(".chip-positive")).toHaveCount(1);
    });

    test("a brand sweep carries no labels, because it has no basis for them", async ({ page }) => {
      await renderTemplate(page, MENTIONS);
      await expect(page.locator(".chip")).toHaveCount(0);
    });

    test("the counts become the filter, by category rather than by network", async ({ page }) => {
      await renderTemplate(page, REVIEW);
      const chips = await text(page, ".mchip");
      expect(chips.map((c) => c.replace(/\s+/g, " "))).toEqual([
        "All 4", "bug report 2", "praise 1", "question 1",
      ]);
      // One post, so the network is a constant — the useful cut is the label.
      await page.locator('.mchip[data-filter="bug_report"]').click();
      await expect(page.locator(".mention")).toHaveCount(2);
      await page.locator('.mchip[data-filter=""]').click();
      await expect(page.locator(".mention")).toHaveCount(4);
    });

    test("filtering inside one post keeps the post, not just its comments", async ({ page }) => {
      await renderTemplate(page, REVIEW);
      await page.locator('.mchip[data-filter="praise"]').click();
      // The group survives with one row, rather than the whole card vanishing —
      // the reader still needs to know which post they are looking at.
      await expect(page.locator(".mgroup")).toHaveCount(1);
      await expect(page.locator(".mention")).toHaveCount(1);
      await expect(page.locator(".mgroup-title")).toContainText("nike lose 200B");
    });

    test("leads with what the model concluded", async ({ page }) => {
      await renderTemplate(page, REVIEW);
      await expect(page.locator(".mention-term")).toContainText("Comment review");
      await expect(page.locator(".mention-summary")).toHaveText(
        "Mostly negative, with one specific bug worth filing.");
    });

    test("selection still works, so a labelled comment can be acted on", async ({ page }) => {
      await renderTemplate(page, REVIEW);
      // The point of classifying is doing something about it: the bug reports
      // have to be selectable as a set.
      await page.locator('.mchip[data-filter="bug_report"]').click();
      await page.locator("[data-group-all]").click();
      await expect(page.locator("#pickhint")).toHaveText("2 comments selected");
    });
  });
});
