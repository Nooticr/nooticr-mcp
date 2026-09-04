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
import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { landingPage } from "../../cloudflare/src/site/landing.js";
import { termsPage, privacyPage } from "../../cloudflare/src/site/legal.js";
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

test("no page logs a console error", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  for (const path of ["/", "/terms", "/privacy", "/dashboard", "/signed-out"]) {
    await page.goto(base + path);
    await page.waitForTimeout(150);
  }
  expect(errors).toEqual([]);
});
