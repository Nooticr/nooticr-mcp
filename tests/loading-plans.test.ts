/**
 * Every tool must say what it is doing and what it costs while it does it.
 *
 * This exists because the two slowest and dearest calls on the server —
 * `search_mentions` at up to 21 credits and `search_spoken_mentions` — had no
 * loading shape at all. They fell through to a generic grey box captioned
 * "Working", which is the least useful thing to show for the longest wait.
 * Nothing failed; the table just did not have a row for them.
 *
 * And the prices were wrong. The first version of the view carried a price
 * list typed in from nooticr-server's `mcp_tool_cost`, which prices a *direct*
 * `/mcp` call. Every evidence tool in this server fans out to cheaper ones
 * instead, so `analyze_post` was shown as 6 when it bills 3, and
 * `analyze_creator_profile` as 15 when it bills 2. A price on a loading screen
 * is a promise, so these check it against the same constants the tools bill
 * against rather than against a second copy.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer, uiTemplateFor } from "../src/shared/tools.js";
import { LOADING_PLANS, loadingPlansJson } from "../src/shared/loading-plans.js";
import { planCost } from "../src/shared/evidence.js";
import {
  MAX_SPOKEN_HANDLE_CALLS,
  MAX_SPOKEN_TRANSCRIPTS,
  SEARCH_PLATFORMS,
  searchMentionsCost,
} from "../src/shared/spend.js";

async function shippedTools() {
  const client = new Client({ name: "test", version: "1.0.0" });
  const server = createMcpServer(
    async () => ({ callTool: async () => ({ contentBlocks: [], structured: {} }) }) as never,
  );
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  return (await client.listTools()).tools.map((t) => t.name);
}

/**
 * The view's own arithmetic, restated — and restated is the word.
 *
 * The evaluator itself is JavaScript inside a template literal and cannot be
 * imported, so this is a second implementation of it and would stay green
 * through any divergence. It earns its place by checking the *data* against
 * the constants the tools bill against, which is what it can do quickly and
 * for every tool; the evaluator is checked where it actually runs, in
 * tests/e2e/ui-views.e2e.ts, and every case added here that exercises a new
 * branch (only, per, min/max, ceilingWith) needs its twin there or the branch
 * is only ever tested in the copy.
 */
function creditsFor(tool: string, args: Record<string, unknown> = {}): number {
  const plan = LOADING_PLANS[tool];
  if (!plan) return -1;
  if (plan.free) return 0;
  let total = 0;
  for (const s of plan.steps) total += s.credits;
  for (const unit of plan.perUnit ?? []) {
    if (unit.onlyWith && !args[unit.onlyWith]) continue;
    if (unit.perPlatform) {
      // The real list, not a fill of a stand-in network: Xiaohongshu costs 5
      // upstream where the rest cost 2, so padding the default with any other
      // name prices the all-networks sweep at 18 instead of 21 — which is the
      // exact number a user is being asked to spend without having read it.
      const named = Array.isArray(args.platforms) ? (args.platforms as string[]) : [];
      const chosen = named.length ? named : [...SEARCH_PLATFORMS];
      for (const p of chosen) total += p === "xiaohongshu" ? 5 : 2;
      continue;
    }
    const v = unit.arg ? args[unit.arg] : undefined;
    let n = Array.isArray(v) ? listCount(v, unit.only, unit.defaultCount)
      : typeof v === "number" ? Math.max(0, Math.floor(v))
      : unit.defaultCount;
    if (unit.per) n *= listCount(args[unit.per.arg], unit.per.only, unit.per.defaultCount);
    if (unit.ceilingWith && args[unit.ceilingWith]) n = unit.max ?? n;
    if (unit.min !== undefined && n > 0 && n < unit.min) n = unit.min;
    if (unit.max !== undefined && n > unit.max) n = unit.max;
    total += unit.credits * n;
  }
  return total;
}

/** Distinct values of an array argument the tool keeps, or its default. */
function listCount(v: unknown, only: readonly string[] | undefined, fallback: number): number {
  if (!Array.isArray(v) || !v.length) return fallback;
  const kept = new Set(
    v.map((x) => String(x).toLowerCase()).filter((x) => !only || only.includes(x)),
  );
  return kept.size;
}

describe("loading plans", () => {
  it("covers every tool the server registers", async () => {
    const missing = (await shippedTools()).filter((t) => !LOADING_PLANS[t]);
    // A tool with no plan draws a grey box captioned "Working" — which is
    // exactly what search_mentions did for the longest wait on the server.
    expect(missing, `tools with no loading state: ${missing.join(", ")}`).toEqual([]);
  });

  it("plans nothing the server does not serve", async () => {
    const shipped = new Set(await shippedTools());
    const stale = Object.keys(LOADING_PLANS).filter((t) => !shipped.has(t));
    expect(stale, `plans for tools that no longer exist: ${stale.join(", ")}`).toEqual([]);
  });

  it("prices each evidence tool at what it actually fans out to", () => {
    // The exact numbers the hand-copied table got wrong.
    expect(creditsFor("analyze_post")).toBe(planCost("analyze_post"));
    expect(creditsFor("analyze_post")).toBe(3);
    expect(creditsFor("analyze_creator_profile")).toBe(2);
    expect(creditsFor("understand_social_post")).toBe(3);
    expect(creditsFor("analyze_post_fast")).toBe(2);
    expect(creditsFor("compare_posts")).toBe(1);
  });

  it("prices a sweep by the networks it will actually reach", () => {
    // The case the whole price-on-the-wait idea is for: an omitted platforms
    // argument means all nine networks, and nothing the caller read said so.
    expect(creditsFor("search_mentions")).toBe(searchMentionsCost());
    expect(creditsFor("search_mentions")).toBe(21);
    expect(creditsFor("search_mentions", { platforms: ["tiktok", "youtube"] })).toBe(4);
    // Xiaohongshu costs more upstream and the ledger must not flatten it.
    expect(creditsFor("search_mentions", { platforms: ["xiaohongshu"] })).toBe(5);
  });

  it("counts a per-item fan-out from the argument that sets it", () => {
    expect(creditsFor("answer_my_audience")).toBe(14);
    expect(creditsFor("answer_my_audience", { limit: 2 })).toBe(6);
    expect(creditsFor("what_should_i_make_next")).toBe(12);
    // A seed creator is the second call who_should_i_work_with only sometimes makes.
    expect(creditsFor("who_should_i_work_with")).toBe(2);
    expect(creditsFor("who_should_i_work_with", { seed: "@a" })).toBe(4);
  });

  it("prices a spoken sweep at the worst case the tool actually clamps to", () => {
    // Every number here is one jobs.ts computes for confirmSpend before it
    // spends anything. The two are shown to the same person minutes apart, so
    // a gap between them reads as one of them lying.
    //
    // Both networks swept (2 each) + the default 8 transcripts at 1.
    expect(creditsFor("search_spoken_mentions", { term: "n", niche: "skincare" })).toBe(12);
    // A network the tool filters out is a network it never sweeps: the enum
    // keeps tiktok and youtube and drops the rest, so this is one sweep.
    expect(
      creditsFor("search_spoken_mentions", {
        term: "n",
        niche: "skincare",
        platforms: ["instagram", "reddit", "tiktok"],
      }),
    ).toBe(10);
    // maxTranscripts is clamped server-side; quoting the argument as typed
    // promised 200 credits for a call that can spend 20.
    expect(
      creditsFor("search_spoken_mentions", { term: "n", niche: "s", maxTranscripts: 200 }),
    ).toBe(4 + MAX_SPOKEN_TRANSCRIPTS);
    // A named handle is checked once per network, not once.
    expect(
      creditsFor("search_spoken_mentions", { term: "n", usernames: ["@a", "@b"] }),
    ).toBe(2 * 2 * 2 + 8);
    // The watchlist's length is not knowable from a sandboxed view, so the
    // answer is the ceiling the tool clamps to rather than the zero this
    // priced it at before.
    expect(
      creditsFor("search_spoken_mentions", { term: "n", useWatchlist: true }),
    ).toBe(MAX_SPOKEN_HANDLE_CALLS * 2 + 8);
  });

  it("says free rather than nothing for the tools that fetch nothing", async () => {
    const free = (await shippedTools()).filter((t) => LOADING_PLANS[t]?.free);
    // A user with an empty balance needs to see which calls still work.
    expect(free).toContain("check_nooticr_credits");
    expect(free).toContain("list_social_connections");
    expect(free).toContain("score_draft");
    for (const t of free) expect(creditsFor(t), `${t} is free`).toBe(0);
  });

  it("claims no per-line progress, because there is no channel for it", () => {
    // MCP Apps hands a view tool-input, tool-input-partial, tool-result and
    // tool-cancelled — no progress. A ledger row that showed a done state
    // would be asserting a completion the server never reported.
    const json = loadingPlansJson();
    expect(json).not.toMatch(/"done"|"completed"|"progress"/);
    for (const plan of Object.values(LOADING_PLANS)) {
      for (const step of plan.steps) {
        expect(step).not.toHaveProperty("done");
        expect(typeof step.credits).toBe("number");
      }
    }
  });

  it("reaches the view with its placeholder actually substituted", () => {
    // The raw template still carries __NOOTICR_PLANS__; a browser test that
    // renders that gets a view with no prices and no ledger, and passes.
    const html = uiTemplateFor("search_mentions");
    expect(html).not.toContain("__NOOTICR_PLANS__");
    expect(html).toContain('"search_mentions"');
  });
});
