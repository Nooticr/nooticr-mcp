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

test("the analysis player uses the proxied media, not the signed CDN url", async ({ page }) => {
  await page.setContent(ORCHYN_UI_TEMPLATE);
  await page.evaluate(
    (d) => window.postMessage(
      { method: "ui/notifications/tool-result", params: { structuredContent: d } }, "*"),
    ANALYSIS,
  );
  await page.waitForTimeout(500);
  const src = await page.locator("video").first().getAttribute("src");
  expect(src).toBe(ANALYSIS.post.videoProxyUrl);
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
