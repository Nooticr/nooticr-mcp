/**
 * Tests for the mcp.orchyn.com pages.
 *
 * The point of these is not that the HTML "looks right" — it is that the
 * public claims stay true. The landing page states per-tool prices, which
 * networks are covered and what the free tier is; a reviewer and a paying
 * user both rely on those being accurate. If the server's pricing changes and
 * nobody updates the page, that is a billing surprise, so it fails here first.
 */
import { describe, it, expect } from "vitest";
import { landingPage } from "../cloudflare/src/site/landing.js";
import { termsPage, privacyPage, LEGAL_EFFECTIVE } from "../cloudflare/src/site/legal.js";
import { dashboardPage, dashboardSignedOut } from "../cloudflare/src/site/dashboard.js";
import { PLATFORMS } from "../cloudflare/src/site/platforms.js";

const URL = "https://mcp.orchyn.com";
const API = "https://api.orchyn.com";

/**
 * The authoritative cost table, mirrored from orchyn-server's `mcp_tool_cost`
 * (crates/server/src/mcp_tools.rs). Keep both in step.
 */
const SERVER_PRICING: Record<string, number> = {
  get_social_media: 1,
  discover_social_posts: 2,
  get_user_posts: 2,
  get_post_comments: 2,
  search_creators: 2,
  get_similar_creators: 2,
  discover_sounds: 2,
  analyze_post: 6,
  understand_social_post: 6,
  analyze_creator_profile: 15,
};

/** Tools the server grants one free use of (AI_MCP_TOOLS). */
const FREE_FIRST_USE = ["analyze_post", "understand_social_post", "analyze_creator_profile"];

describe("landing page", () => {
  const html = landingPage(URL, API);

  it("lists every billable tool at the price the server actually charges", () => {
    for (const [tool, cost] of Object.entries(SERVER_PRICING)) {
      expect(html, `${tool} missing from the page`).toContain(tool);
      // The tool name and its badge sit together in one card.
      const card = html.slice(html.indexOf(tool));
      const badge = card.slice(0, 320).match(/(\d+) cr</);
      expect(badge, `no credit badge near ${tool}`).toBeTruthy();
      expect(Number(badge![1]), `${tool} is advertised at the wrong price`).toBe(cost);
    }
  });

  it("advertises a free first use for exactly the tools that get one", () => {
    for (const tool of FREE_FIRST_USE) {
      const card = html.slice(html.indexOf(tool), html.indexOf(tool) + 420);
      expect(card, `${tool} should be marked free-first-use`).toContain("First use free");
    }
    // A paid-only tool must not claim a free use.
    const paid = html.slice(html.indexOf("get_social_media"), html.indexOf("get_social_media") + 300);
    expect(paid).not.toContain("First use free");
  });

  it("names every platform the server supports", () => {
    for (const p of PLATFORMS) expect(html).toContain(p.name);
    expect(PLATFORMS.length).toBeGreaterThanOrEqual(8);
  });

  it("links the legal pages a connector review requires", () => {
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
  });

  it("points installers at the real connector URL", () => {
    expect(html).toContain(`${URL}/mcp`);
    expect(html).toContain("@orchyn/mcp");
  });

  it("escapes interpolated values", () => {
    const evil = landingPage("https://x.test\"><script>alert(1)</script>", API);
    expect(evil).not.toContain("<script>alert(1)</script>");
  });
});

describe("legal pages", () => {
  it("state an effective date and cross-link each other", () => {
    const t = termsPage(URL, API);
    const p = privacyPage(URL, API);
    expect(t).toContain(LEGAL_EFFECTIVE);
    expect(p).toContain(LEGAL_EFFECTIVE);
    expect(t).toContain('href="/privacy"');
    expect(p).toContain('href="/terms"');
  });

  it("disclose what is collected and what is not", () => {
    const p = privacyPage(URL, API);
    // Claims a reviewer checks for, and that the implementation must honour.
    expect(p).toContain("do <strong>not</strong> sell your data");
    expect(p).toContain("Stripe");
    expect(p).toContain("Cloudflare");
    // Retention is disclosed per-category in the collection table.
    expect(p).toContain("Kept for");
    expect(p).toContain("Until you delete the account");
  });

  it("terms cover payment, acceptable use and liability", () => {
    const t = termsPage(URL, API);
    for (const heading of ["Credits and payment", "Acceptable use", "Liability", "Termination"]) {
      expect(t, `terms missing "${heading}"`).toContain(heading);
    }
  });
});

describe("dashboard", () => {
  const usage = {
    balance: 42,
    totalCalls: 7,
    creditsSpent: 19,
    freeToolsRemaining: ["analyze_post"],
    byTool: [{ tool: "get_social_media", calls: 5, credits: 5, cost: 1 }],
    recent: [
      { id: 2, delta: -1, reason: "mcp_get_social_media", kind: "debit", createdAt: "2026-08-29T10:00:00Z" },
      { id: 1, delta: 20, reason: "welcome_grant", kind: "credit", createdAt: "2026-08-28T10:00:00Z" },
    ],
    pricing: [],
  };

  it("shows the numbers it was given", () => {
    const html = dashboardPage(URL, { email: "a@b.co", displayName: "A" }, usage, "tok");
    expect(html).toContain("42");
    expect(html).toContain("get_social_media");
    expect(html).toContain("a@b.co");
  });

  it("never puts the access token in the page", () => {
    const secret = "super-secret-token-value";
    const html = dashboardPage(URL, { email: "a@b.co" }, usage, secret);
    expect(html, "the bearer token must not be rendered into HTML").not.toContain(secret);
  });

  it("handles a brand-new account with no activity", () => {
    const empty = { ...usage, balance: 0, totalCalls: 0, creditsSpent: 0, byTool: [], recent: [] };
    const html = dashboardPage(URL, {}, empty, "tok");
    expect(html).toContain("No tool calls yet");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("undefined");
  });

  it("signed-out view offers a way in and does not leak an error object", () => {
    const html = dashboardSignedOut(URL);
    expect(html).toContain("/dashboard/login");
    expect(html).not.toContain("undefined");
  });

  it("escapes a hostile display name", () => {
    const html = dashboardPage(URL, { displayName: '<img src=x onerror=alert(1)>' }, usage, "t");
    expect(html).not.toContain("<img src=x onerror");
  });
});
