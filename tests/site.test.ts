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
import { TOOLS } from "../cloudflare/src/site/catalogue.js";
import { documentationPage } from "../cloudflare/src/site/documentation.js";
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
  analyze_post_fast: 2,
  write_hooks: 2,
  score_draft: 2,
  repurpose_post: 2,
  find_hook_pattern: 2,
  create_variants: 3,
  niche_report: 3,
  compare_posts: 8,
  // Per creator checked, not per call — the unit price is what the pages show.
  catch_up_watchlist: 2,
};

/** Tools the server grants one free use of (AI_MCP_TOOLS). */
const FREE_FIRST_USE = ["analyze_post", "understand_social_post", "analyze_creator_profile"];

describe("landing page", () => {
  const html = landingPage(URL, API);

  it("lists every billable tool at the price the server actually charges", () => {
    for (const [tool, cost] of Object.entries(SERVER_PRICING)) {
      const heading = `>${tool}</h3>`;
      expect(html, `${tool} missing from the page`).toContain(heading);
      // The tool name and its badge sit together in one card.
      const card = html.slice(html.indexOf(heading));
      const badge = card.slice(0, 320).match(/(\d+) cr</);
      expect(badge, `no credit badge near ${tool}`).toBeTruthy();
      expect(Number(badge![1]), `${tool} is advertised at the wrong price`).toBe(cost);
    }
  });

  it("advertises a free first use for exactly the tools that get one", () => {
    for (const tool of FREE_FIRST_USE) {
      const at = html.indexOf(`>${tool}</h3>`);
      expect(at, `${tool} missing`).toBeGreaterThan(-1);
      expect(
        html.slice(at, at + 460),
        `${tool} should be marked free-first-use`
      ).toContain("First use free");
    }
    // A paid-only tool must not claim a free use.
    const at = html.indexOf(">get_social_media</h3>");
    expect(html.slice(at, at + 320)).not.toContain("First use free");
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

/**
 * The UI template is embedded twice: in a Rust raw string (where backslash
 * escapes stay literal) and in a TS template literal (where they are
 * resolved). Anything that relies on an escape therefore means one of the two
 * builds gets different source — and the TS one has silently shipped a
 * SyntaxError more than once this way.
 */
describe("UI template dual-host safety", () => {
  it("contains no backslash escapes that the two hosts would read differently", async () => {
    const { ORCHYN_UI_TEMPLATE } = await import("../src/shared/ui-template.js");
    // The TS build is the resolved one; compare against what Rust ships by
    // scanning the source literal for escapes inside the template body.
    // NB: `URL` is shadowed by a const at the top of this file, so resolve
    // the path with node:path rather than the WHATWG URL constructor.
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(here, "..", "src", "shared", "ui-template.ts"), "utf8");
    const start = raw.indexOf("export const ORCHYN_UI_TEMPLATE = `") + "export const ORCHYN_UI_TEMPLATE = `".length;
    const body = raw.slice(start, raw.indexOf("`;", start));

    // `\uXXXX`, `\n`, `\"` and friends all diverge. A literal `\\` is fine
    // (both hosts keep it) and regex classes like `[\\s]` are written escaped
    // on purpose, so only flag single-backslash sequences.
    const offenders = [...body.matchAll(/(^|[^\\])\\(["'nrtu])/g)].map((m) => {
      const at = m.index ?? 0;
      return body.slice(Math.max(0, at - 40), at + 40).replace(/\n/g, "\\n");
    });
    expect(
      offenders,
      `escape sequences here resolve in the TS build but not the Rust one:\n${offenders.join("\n---\n")}`
    ).toEqual([]);

    // And the resolved template must still be parseable.
    const script = ORCHYN_UI_TEMPLATE.match(/<script>([\s\S]*)<\/script>/)?.[1] ?? "";
    expect(() => new Function(script)).not.toThrow();
  });
});

/**
 * Tool surface parity.
 *
 * The tool list exists three times — the Rust MCP crate, the orchyn server,
 * and this TS package (which is what the Cloudflare worker and the npm CLI
 * actually serve). They are maintained by hand, and they have silently
 * diverged: four tools shipped in Rust reached no claude.ai user because the
 * TS list never learned about them. Pin the surface so that is loud.
 */
describe("tool surface", () => {
  const EXPECTED = [
    "search_mentions",
    "watch_creator",
    "unwatch_creator",
    "catch_up_watchlist",
    "get_social_media",
    "get_post_transcript",
    "discover_social_posts",
    "get_user_posts",
    "get_post_comments",
    "analyze_comments",
    "search_creators",
    "get_similar_creators",
    "discover_sounds",
    "discover_hashtags",
    "analyze_post",
    "understand_social_post",
    "analyze_creator_profile",
    "compare_posts",
    "analyze_post_fast",
    "write_hooks",
    "create_variants",
    "score_draft",
    "repurpose_post",
    "niche_report",
    "find_hook_pattern",
    "check_orchyn_credits",
    "buy_orchyn_credits",
    "orchyn_login",
    "show_comment_review",
  ];

  it("declares exactly the tools we intend to ship", async () => {
    const { TOOL_DEFS } = await import("../src/shared/tools-def.js").catch(async () => {
      // The module may export under a different name; fall back to scanning.
      return { TOOL_DEFS: null } as never;
    });
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const defs = readFileSync(join(here, "..", "src", "shared", "tools-def.ts"), "utf8");
    const names = [...defs.matchAll(/name:\s*"([a-z_]+)"/g)].map((m) => m[1]);
    expect(new Set(names)).toEqual(new Set(EXPECTED));
    expect(names.length, "duplicate tool names").toBe(new Set(names).size);
    void TOOL_DEFS;
  });

  it("registers a handler for every declared tool", async () => {
    // Asks the built server rather than grepping its source. The grep was a
    // proxy for this and stopped tracking it the moment three tools moved to
    // registerToolTask to accept a background task: they were registered and
    // working, and the pattern no longer matched, so the test failed for a
    // change it was never meant to police.
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
    const { createMcpServer } = await import("../src/shared/tools.js");
    const client = new Client({ name: "test", version: "1.0.0" });
    const server = createMcpServer(
      async () => ({ callTool: async () => ({ contentBlocks: [], structured: {} }) }) as never,
    );
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientSide), server.connect(serverSide)]);
    const registered = new Set((await client.listTools()).tools.map((t) => t.name));
    const missing = EXPECTED.filter((n) => !registered.has(n));
    expect(missing, `declared but never registered: ${missing.join(", ")}`).toEqual([]);
    // And nothing registered that was never declared.
    const undeclared = [...registered].filter((n) => !EXPECTED.includes(n));
    expect(undeclared, `registered but never declared: ${undeclared.join(", ")}`).toEqual([]);
  });

  it("prices every billable tool in its description", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const defs = readFileSync(join(here, "..", "src", "shared", "tools-def.ts"), "utf8");
    // Free because they fetch nothing: two account tools, a login, and the two
    // watchlist tools that only write stored state. catch_up_watchlist is not
    // here — it fetches per creator, and says so.
    const free = [
      "check_orchyn_credits",
      "buy_orchyn_credits",
      "orchyn_login",
      "watch_creator",
      "unwatch_creator",
      // Draws what the caller already worked out; makes no request at all.
      "show_comment_review",
    ];
    for (const name of EXPECTED) {
      if (free.includes(name)) continue;
      const block = defs.slice(defs.indexOf(`name: "${name}"`));
      const desc = block.slice(0, block.indexOf("inputSchema"));
      expect(
        /credit/i.test(desc),
        `${name} does not tell the agent what it costs`
      ).toBe(true);
    }
  });
});

/**
 * README parity.
 *
 * The README is where people decide whether to install this and what it will
 * cost them. It had drifted badly — twelve undocumented tools, a tool listed
 * at 10 credits that charges 6, and a "every tool's first use is free" promise
 * the billing code stopped honouring. Those are worse than gaps, so pin them.
 */
describe("README", () => {
  async function readme() {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    return readFileSync(join(here, "..", "README.md"), "utf8");
  }

  it("documents every tool the server registers", async () => {
    const doc = await readme();
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    // Asks the built server. Grepping tools.ts for registerTool was a proxy
    // for "what ships", and it silently stopped being one when the watchlist
    // tools were added in their own module: three undocumented tools, and a
    // green test.
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
    const { createMcpServer } = await import("../src/shared/tools.js");
    const client = new Client({ name: "test", version: "1.0.0" });
    const server = createMcpServer(
      async () => ({ callTool: async () => ({ contentBlocks: [], structured: {} }) }) as never,
    );
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientSide), server.connect(serverSide)]);
    const shipped = (await client.listTools()).tools.map((t) => t.name);
    const documented = new Set([...doc.matchAll(/\| `([a-z_]+)`/g)].map((m) => m[1]));
    const missing = shipped.filter((t) => !documented.has(t));
    expect(missing, `undocumented tools: ${missing.join(", ")}`).toEqual([]);
  });

  it("quotes the prices the server actually charges", async () => {
    const doc = await readme();
    // Row form: | `tool` | N (…) | …
    for (const [tool, cost] of Object.entries(SERVER_PRICING)) {
      const row = doc.match(new RegExp("\\| `" + tool + "` \\| (\\d+)"));
      expect(row, `${tool} has no priced row in the README`).toBeTruthy();
      expect(Number(row![1]), `README misprices ${tool}`).toBe(cost);
    }
  });

  it("does not promise a free first use for every tool", async () => {
    const doc = await readme();
    // Only AI_MCP_TOOLS get one; data tools bill from the first call.
    expect(doc).not.toMatch(/every tool.{0,30}first use is free/i);
    expect(doc).not.toMatch(/Every tool has \*\*one free first use/i);
    expect(doc).toMatch(/AI (analysis )?tools?\b[\s\S]{0,120}free the first time/i);
  });
});

/**
 * Credit-pack pricing parity.
 *
 * The pack prices are quoted in four places (landing page, dashboard, the
 * MCP checkout card, the README) and the credit amounts are granted by the
 * server. A mismatch here means a customer is charged one thing and told
 * another, so pin the set.
 */
describe("credit packs", () => {
  const PACKS = [
    { id: "starter", price: "$15", credits: 600 },
    { id: "pro", price: "$40", credits: 2000 },
    { id: "scale", price: "$85", credits: 5000 },
  ];

  it("the dashboard offers exactly the packs we sell", async () => {
    const html = dashboardPage(
      URL,
      { email: "a@b.co" },
      {
        balance: 0, totalCalls: 0, creditsSpent: 0, freeToolsRemaining: [],
        byTool: [], recent: [], pricing: [],
      },
      "tok"
    );
    for (const p of PACKS) {
      expect(html, `${p.id} price missing`).toContain(p.price);
      expect(html, `${p.id} credit count missing`).toContain(p.credits.toLocaleString("en-US"));
      expect(html, `${p.id} buy button missing`).toContain(`data-buy="${p.id}"`);
    }
    // The old entry price must not survive anywhere.
    expect(html).not.toContain("$12.50");
  });

  it("the landing page quotes the same prices", async () => {
    const html = landingPage(URL, API);
    for (const p of PACKS) expect(html, `${p.id} missing from pricing`).toContain(p.price);
    expect(html).not.toContain("$12.50");
    expect(html).toContain("600 credits");
  });

  it("the README quotes the same entry price", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const doc = readFileSync(join(here, "..", "README.md"), "utf8");
    expect(doc).not.toContain("$12.50");
  });
});

/**
 * The version the server reports to clients is a hand-maintained constant,
 * and it had drifted: /health and serverInfo announced 1.18.1 while the
 * package was on 1.19.0. Clients and connector reviews read that number.
 */
describe("server version", () => {
  it("matches the published package version", async () => {
    const { MCP_SERVER_VERSION } = await import("../src/shared/tools.js");
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));
    expect(MCP_SERVER_VERSION).toBe(pkg.version);
  });
});

/**
 * Plugin manifest parity.
 *
 * The manifest sat at 1.7.4 while the package reached 1.20.0, and still
 * described seven platforms and "multimodal AI analysis" — it predated
 * LinkedIn, transcripts and every tool that creates something. It is the
 * first thing a marketplace reviewer reads.
 */
describe("plugin manifest", () => {
  async function read(rel: string) {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    return JSON.parse(readFileSync(join(here, "..", rel), "utf8"));
  }

  it("tracks the published package version", async () => {
    const plugin = await read(".claude-plugin/plugin.json");
    const pkg = await read("package.json");
    expect(plugin.version).toBe(pkg.version);
  });

  it("names every platform the server supports", async () => {
    const plugin = await read(".claude-plugin/plugin.json");
    const blob = `${plugin.description} ${(plugin.keywords ?? []).join(" ")}`.toLowerCase();
    for (const p of PLATFORMS) {
      const needle = p.name.toLowerCase().replace("x", "x").split("/")[0];
      expect(blob, `${p.name} missing from the plugin manifest`).toContain(needle);
    }
  });

  it("describes what the tools actually do now", async () => {
    const plugin = await read(".claude-plugin/plugin.json");
    const market = await read(".claude-plugin/marketplace.json");
    for (const d of [plugin.description, market.plugins[0].description]) {
      // It reads and it creates — the description must not stop at analysis.
      expect(d).toMatch(/transcript/i);
      expect(d).toMatch(/hook|variant|draft/i);
    }
  });
});

/**
 * Documentation page.
 *
 * IT administrators read this when deciding whether to approve the server,
 * so the claims in it are load-bearing. Pin the ones that would be damaging
 * to get wrong: what it cannot do, where data goes, and what a call costs.
 */
describe("documentation", () => {
  const html = documentationPage(URL, API);

  it("documents every tool at the price the server charges", () => {
    for (const [tool, cost] of Object.entries(SERVER_PRICING)) {
      expect(html, `${tool} missing`).toContain(`<code>${tool}</code>`);
      const at = html.indexOf(`<code>${tool}</code>`);
      expect(
        html.slice(at, at + 220),
        `${tool} documented at the wrong price`
      ).toContain(`${cost} cr`);
    }
    for (const free of [
      "check_orchyn_credits",
      "buy_orchyn_credits",
      "orchyn_login",
      "watch_creator",
      "unwatch_creator",
    ]) {
      expect(html).toContain(`<code>${free}</code>`);
    }
  });

  it("states plainly what the server cannot do", () => {
    // The questions an admin actually asks, and the answers we must not soften.
    expect(html).toMatch(/cannot|never/i);
    expect(html).toContain("Connect to any social account");
    expect(html).toMatch(/Post, comment, like, follow or message/);
    expect(html).toMatch(/private messages/i);
    expect(html).toMatch(/readOnlyHint/);
  });

  it("discloses retention and subprocessors", () => {
    expect(html).toContain("Cloudflare");
    expect(html).toContain("Stripe");
    expect(html).toMatch(/not sold/i);
    expect(html).toMatch(/not used to train/i);
    // The load-bearing negative: retrieved content is not stored.
    expect(html).toMatch(/Content of retrieved posts/);
  });

  it("explains access and revocation", () => {
    expect(html).toContain("social:read");
    expect(html).toContain("credits:spend");
    expect(html).toMatch(/PKCE/);
    expect(html).toMatch(/To revoke/);
  });

  it("links the legal documents and support", () => {
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain("support@orchyn.com");
  });

  it("quotes the current pack prices", () => {
    expect(html).toContain("$15");
    expect(html).not.toContain("$12.50");
  });

  it("escapes interpolated values", () => {
    const evil = documentationPage('https://x"><script>alert(1)</script>', API);
    expect(evil).not.toContain("<script>alert(1)</script>");
  });
});

// The public docs once claimed 5 tools were free on first use when the server
// treated 12 that way — understating our own free tier, and wrong in the
// direction that makes a reviewer's evaluation run out of credits early.
// This is the server's list, transcribed from AI_MCP_TOOLS in mcp_tools.rs.
describe("free first use", () => {
  const SERVER_AI_TOOLS = [
    "analyze_post", "understand_social_post", "analyze_creator_profile",
    "analyze_comments", "compare_posts", "analyze_post_fast", "write_hooks",
    "create_variants", "score_draft", "repurpose_post", "niche_report",
    "find_hook_pattern",
  ].sort();

  it("marks exactly the tools the server bills as AI", () => {
    const marked = TOOLS.filter((t) => t.freeFirstUse).map((t) => t.name).sort();
    expect(marked).toEqual(SERVER_AI_TOOLS);
  });

  it("keeps a full review pass inside the 20-credit welcome grant", () => {
    const payable = TOOLS.filter((t) => !t.freeFirstUse)
      .reduce((sum, t) => sum + t.cost, 0);
    expect(payable).toBeLessThanOrEqual(20);
  });
});

/**
 * `tools-def.ts` declares what we intend to ship; `tools.ts` is what a client
 * is actually handed. They drifted: `search_mentions` shipped reading comment
 * text — the whole point of it — while the declaration still told the model
 * "matches captions and titles, not comment text", and five platform lists
 * named eight networks after two more had been added. A description is the
 * only thing a model has to decide whether a tool can answer, so a stale one
 * is not a documentation bug; it makes a working tool unreachable.
 */
describe("the declared tools and the shipped tools agree", () => {
  const shipped = async () => {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
    const { createMcpServer } = await import("../src/shared/tools.js");
    const client = new Client({ name: "test", version: "1.0.0" });
    const server = createMcpServer(
      async () => ({ callTool: async () => ({ contentBlocks: [], structured: {} }) }) as never,
    );
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(a), server.connect(b)]);
    return (await client.listTools()).tools;
  };

  const declared = async () => {
    const { TOOL_DEFINITIONS } = await import("../src/shared/tools-def.js");
    return TOOL_DEFINITIONS as Array<{ name: string; description: string }>;
  };

  // The two are worded independently on purpose, so this pins the facts they
  // must not disagree on rather than the prose. The platform list is the one
  // that drifted, and it is the one a model reads to decide whether a URL is
  // even worth passing.
  const NETWORKS = [
    "tiktok", "instagram", "youtube", "reddit", "weibo",
    "douyin", "xiaohongshu", "bilibili", "linkedin",
  ];
  const networksIn = (text: string) => {
    const said = text.toLowerCase();
    return NETWORKS.filter((n) => said.includes(n)).sort();
  };

  it("claims the same networks in both", async () => {
    const live = Object.fromEntries((await shipped()).map((t) => [t.name, t.description ?? ""]));
    const drifted: string[] = [];
    for (const def of await declared()) {
      const l = live[def.name];
      if (l === undefined) continue; // covered by the declared/registered test
      const a = networksIn(l).join(","), b = networksIn(def.description).join(",");
      if (a !== b) drifted.push(`${def.name}: shipped [${a}] vs declared [${b}]`);
    }
    expect(drifted, "one file was updated and the other was not").toEqual([]);
  });

  /**
   * Every network the tool will actually search has to appear in the sentence
   * the model reads, or it will never think to ask for it.
   */
  it("names every network search_mentions can search", async () => {
    const tool = (await shipped()).find((t) => t.name === "search_mentions")!;
    const schema = JSON.stringify(tool.inputSchema);
    const platforms = [...schema.matchAll(/"(youtube|tiktok|instagram|douyin|xiaohongshu|twitter|bilibili|reddit|weibo)"/g)]
      .map((m) => m[1]);
    expect(new Set(platforms).size, "the enum should list nine networks").toBe(9);
    const said = (tool.description ?? "").toLowerCase();
    const unnamed = [...new Set(platforms)].filter((p) => {
      const alias = { twitter: "x/twitter", xiaohongshu: "xiaohongshu" }[p] ?? p;
      return !said.includes(alias);
    });
    expect(unnamed, "networks the tool searches but never mentions").toEqual([]);
  });

  /** The one it got wrong: it reads comments, and used to deny it. */
  it("does not deny reading comments", async () => {
    const tool = (await shipped()).find((t) => t.name === "search_mentions")!;
    expect(tool.description ?? "").not.toMatch(/not comment text/i);
    expect(tool.description ?? "").toMatch(/comments/i);
  });
});
