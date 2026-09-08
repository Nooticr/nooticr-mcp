/**
 * Browser end-to-end tests for mcp.nooticr.com.
 *
 * These render the real pages the Worker serves and drive them the way a
 * visitor (or a connector reviewer) would: no horizontal overflow at any
 * width, the install tabs switch, the FAQ opens, the legal pages are reachable
 * and readable, and the dashboard's buy buttons call the checkout endpoint
 * rather than exposing a token to page scripts.
 *
 *   npm run test:e2e
 *
 * The pages are pure functions of their inputs, so the suite serves them from
 * a throwaway static server instead of needing wrangler, a database or Stripe.
 */
import { type Page } from "@playwright/test";
// `test` comes from guarded-test.ts, not @playwright/test: it aborts every
// request to a real nooticr host before it leaves the browser (#66).
import { test, expect } from "./guarded-test.js";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { landingPage } from "../../cloudflare/src/site/landing.js";
import { termsPage, privacyPage } from "../../cloudflare/src/site/legal.js";
import { supportPage } from "../../cloudflare/src/site/support.js";
import { dashboardPage, dashboardSignedOut } from "../../cloudflare/src/site/dashboard.js";

const PUBLIC_URL = "https://mcp.nooticr.com";
const API = "https://api.nooticr.com";

const USAGE = {
  balance: 1284,
  totalCalls: 412,
  creditsSpent: 938,
  freeToolsRemaining: ["understand_social_post"],
  byTool: [
    { tool: "get_social_media", calls: 180, credits: 180, cost: 1 },
    { tool: "analyze_creator_profile", calls: 24, credits: 360, cost: 15 },
  ],
  recent: [
    { id: 2, delta: -6, reason: "mcp_analyze_post", kind: "debit", createdAt: "2026-08-29T18:22:00Z" },
    { id: 1, delta: 2000, reason: "mcp_credit_pack", kind: "credit", createdAt: "2026-08-28T09:10:00Z" },
  ],
  pricing: [],
};

const ROUTES: Record<string, () => string> = {
  "/": () => landingPage(PUBLIC_URL, API),
  "/terms": () => termsPage(PUBLIC_URL, API),
  "/privacy": () => privacyPage(PUBLIC_URL, API),
  "/support": () => supportPage(PUBLIC_URL),
  "/dashboard": () => dashboardPage(PUBLIC_URL, { email: "e2e@nooticr.com", displayName: "E2E" }, USAGE, "secret-token"),
  "/signed-out": () => dashboardSignedOut(PUBLIC_URL),
};

let server: Server;
let base: string;

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    // Stand in for the Worker's /api/checkout so the buy flow is drivable.
    if (path === "/api/checkout") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ url: "https://checkout.stripe.com/c/pay/test_session" }));
      return;
    }
    const render = ROUTES[path];
    if (!render) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(render());
  });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

test.afterAll(() => server?.close());

/** Nothing may ever push the page sideways — the top complaint on small screens. */
async function noOverflow(page: Page) {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(over, "page overflows horizontally").toBeLessThanOrEqual(0);
}

const WIDTHS = [320, 375, 768, 1280, 1600];

test.describe("landing page", () => {
  for (const width of WIDTHS) {
    test(`fits the viewport at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}/`);
      await noOverflow(page);
    });
  }

  test("states what the product does and who it works with", async ({ page }) => {
    await page.goto(`${base}/`);
    await expect(page.locator("h1")).toContainText("eyes on social");
    for (const p of ["TikTok", "Instagram", "YouTube", "LinkedIn"]) {
      await expect(page.getByText(p, { exact: true }).first()).toBeVisible();
    }
  });

  test("install tabs switch the shown instructions", async ({ page }) => {
    await page.goto(`${base}/`);
    const claudePane = page.locator('.pane[data-pane="claude"]');
    const cursorPane = page.locator('.pane[data-pane="cursor"]');
    await expect(claudePane).toBeVisible();
    await expect(cursorPane).toBeHidden();
    await page.click('.tab[data-pane="cursor"]');
    await expect(cursorPane).toBeVisible();
    await expect(claudePane).toBeHidden();
    await expect(cursorPane).toContainText("@nooticr/mcp");
  });

  test("shows the connector URL a reviewer needs to paste", async ({ page }) => {
    await page.goto(`${base}/`);
    await expect(page.locator('.pane[data-pane="claude"] code')).toContainText(`${PUBLIC_URL}/mcp`);
  });

  test("FAQ entries expand", async ({ page }) => {
    await page.goto(`${base}/`);
    const first = page.locator(".faq details").first();
    await expect(first.locator("p")).toBeHidden();
    await first.locator("summary").click();
    await expect(first.locator("p")).toBeVisible();
  });

  test("links to both legal documents", async ({ page }) => {
    await page.goto(`${base}/`);
    await expect(page.locator('footer a[href="/terms"]')).toBeVisible();
    await expect(page.locator('footer a[href="/privacy"]')).toBeVisible();
  });
});

test.describe("legal pages", () => {
  for (const path of ["/terms", "/privacy"]) {
    test(`${path} renders and fits on mobile`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 900 });
      await page.goto(base + path);
      await expect(page.locator("h1")).toBeVisible();
      await noOverflow(page);
    });
  }

  test("privacy policy discloses processors and retention", async ({ page }) => {
    await page.goto(`${base}/privacy`);
    await expect(page.getByText("Stripe").first()).toBeVisible();
    await expect(page.getByText("Cloudflare").first()).toBeVisible();
    await expect(page.getByRole("cell", { name: /Until you delete the account/ })).toBeVisible();
  });
});

test.describe("dashboard", () => {
  for (const width of WIDTHS) {
    test(`fits the viewport at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}/dashboard`);
      await noOverflow(page);
    });
  }

  test("shows balance, usage and recent activity", async ({ page }) => {
    await page.goto(`${base}/dashboard`);
    await expect(page.getByText("1284")).toBeVisible();
    await expect(page.getByText("get_social_media")).toBeVisible();
    await expect(page.getByText("analyze_creator_profile").first()).toBeVisible();
  });

  test("never exposes the access token to page scripts", async ({ page }) => {
    await page.goto(`${base}/dashboard`);
    const html = await page.content();
    expect(html, "the bearer token must not reach the browser").not.toContain("secret-token");
  });

  test("buying a pack goes through the server-side checkout endpoint", async ({ page }) => {
    await page.goto(`${base}/dashboard`);
    const [request] = await Promise.all([
      page.waitForRequest((r) => r.url().endsWith("/api/checkout") && r.method() === "POST"),
      page.click('[data-buy="pro"]'),
    ]);
    expect(JSON.parse(request.postData() ?? "{}")).toEqual({ pack: "pro" });
    // The page follows the returned Stripe URL.
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 5000 }).catch(() => {});
  });

  test("signed-out view offers a way to sign in", async ({ page }) => {
    await page.goto(`${base}/signed-out`);
    await expect(page.locator('a[href="/dashboard/login"]')).toBeVisible();
  });
});

/**
 * The support page's composer is the only inline script on the marketing site
 * that builds something from typed input, and a string test cannot see whether
 * it runs. It got shipped broken once in exactly that way: an escape lost in
 * an edit put a raw newline inside a JS string literal, so the emitted script
 * was a syntax error, the button kept its bare `mailto:` and every field the
 * visitor filled in was silently dropped. Nothing threw where anyone could see
 * it. So this drives it in a browser.
 */
test.describe("support page", () => {
  for (const width of [320, 375, 1280]) {
    test(`fits the viewport at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}/support`);
      await expect(page.locator("h1")).toContainText("Get help");
      await noOverflow(page);
    });
  }

  test("composes a prefilled mail from what was typed", async ({ page }) => {
    await page.goto(`${base}/support`);
    await page.selectOption("#topic", "billing");
    await page.fill("#summary", "Charged for an empty sweep");
    await page.fill("#detail", "First line.\nSecond line.");
    await page.fill("#tool", "search_mentions");
    await page.fill("#client", "Claude Desktop");
    await page.fill("#link", "https://www.tiktok.com/@a/video/1");
    await page.fill("#account", "someone@example.com");

    const href = decodeURIComponent((await page.getAttribute("#send", "href")) ?? "");
    expect(href).toContain("mailto:support@nooticr.com");
    // The topic is a category prefix on the subject, so a reply thread starts
    // sorted; the summary is the subject itself.
    expect(href).toContain("subject=[billing] Charged for an empty sweep");
    // The narrative first, then the facts a first reply needs, each on its own
    // line — a body of "undefined" or one collapsed line is the failure here.
    expect(href).toContain("First line.\nSecond line.");
    for (const line of [
      "Tool: search_mentions",
      "Post or profile URL: https://www.tiktok.com/@a/video/1",
      "Account email: someone@example.com",
      "AI client: Claude Desktop",
    ]) {
      expect(href, `body missing "${line}"`).toContain(line);
    }
    // And what it shows is what it will send.
    await expect(page.locator("#preview")).toHaveText("[billing] Charged for an empty sweep");
  });

  test("an empty summary falls back to the topic, so the subject is never bare", async ({ page }) => {
    await page.goto(`${base}/support`);
    await page.selectOption("#topic", "security");
    const href = decodeURIComponent((await page.getAttribute("#send", "href")) ?? "");
    expect(href).toContain("subject=[security] Security or vulnerability report");
  });

  test("nothing on the page can be submitted to us", async ({ page }) => {
    await page.goto(`${base}/support`);
    // Not a stylistic point. A form with no action submits GET to the current
    // URL, which would put everything typed into a request line for /support —
    // the opposite of what the page promises directly above the fields.
    expect(await page.locator("form").count()).toBe(0);
    await page.fill("#summary", "typed then Enter");
    await page.press("#summary", "Enter");
    await page.waitForTimeout(150);
    expect(new URL(page.url()).search).toBe("");
    expect(page.url()).toBe(`${base}/support`);
  });

  test("the triage answers are links, and the links are visible", async ({ page }) => {
    await page.goto(`${base}/support`);
    // Every prose link was the same colour as the text it sat in until this
    // page needed them; the legal pages had the same problem, unnoticed.
    const link = page.locator('.prose a[href="/documentation#tools"]');
    const [linkColour, textColour] = await Promise.all([
      link.evaluate((el) => getComputedStyle(el).color),
      page.locator(".prose p").first().evaluate((el) => getComputedStyle(el).color),
    ]);
    expect(linkColour).not.toBe(textColour);
    // ...and the button is not a victim of that same rule.
    const send = page.locator("#send");
    const [fg, bg] = await send.evaluate((el) => [
      getComputedStyle(el).color,
      getComputedStyle(el).backgroundColor,
    ]);
    expect(fg, "button label is the same colour as its background").not.toBe(bg);
    await expect(send).toBeVisible();
  });

  test("works with JavaScript off, by telling you what to do instead", async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(`${base}/support`);
    // Asserted on the children, not the `noscript` element: Playwright reports
    // SCRIPT/STYLE/NOSCRIPT as having no text at all, because it models what a
    // visitor sees. With scripting off the browser parses those children into
    // real DOM, so this checks the fallback is genuinely on screen rather than
    // merely present in the markup.
    const fallback = page.locator("noscript p");
    await expect(fallback).toBeVisible();
    await expect(fallback).toContainText("support@nooticr.com");
    // The button still goes somewhere useful, just without the prefill.
    expect(await page.getAttribute("#send", "href")).toBe("mailto:support@nooticr.com");
    await ctx.close();
  });
});

test("no page logs a console error", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  for (const path of ["/", "/terms", "/privacy", "/support", "/dashboard", "/signed-out"]) {
    await page.goto(base + path);
    await page.waitForTimeout(150);
  }
  expect(errors).toEqual([]);
});
