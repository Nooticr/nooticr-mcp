/**
 * The run series a watch keeps, and the one thing its guidance has to prevent
 * (issue #28).
 *
 * Every other read here answers about now. This one answers about change, and
 * change is where a confident wrong sentence is cheapest to produce: two
 * points read as a trend, the edge of the retention window read as silence,
 * or a direction subtracted from the wrong end of a newest-first array.
 *
 * That last one is not hypothetical. Driving this tool for real and reading
 * the series by hand produced "TikTok fell from 5 to 12" — the numbers right,
 * the verb backwards. So the direction is computed in the guidance now, and
 * the test below is the one that would have caught it.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

/** Newest first, as the backend returns it. */
function series(weeks: Array<{ tiktok: number; reddit: number; reported?: number }>) {
  return weeks.map((w, i) => ({
    ranAt: new Date(Date.UTC(2026, 0, 31 - i * 7)).toISOString(),
    found: w.tiktok + w.reddit,
    reported: w.reported ?? 0,
    perPlatform: {
      tiktok: { found: w.tiktok, reported: 0 },
      reddit: { found: w.reddit, reported: 0 },
    },
    medianViews: null,
    postsScored: null,
    costCredits: 4,
  }));
}

const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
async function connect(structured: Record<string, unknown>) {
  calls.length = 0;
  const nooticr = {
    me: async () => ({ id: "u1" }),
    callTool: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return { contentBlocks: [{ type: "text", text: "{}" }], structured };
    },
  } as unknown as NooticrClient;
  const client = new Client({ name: "test", version: "1.0.0" });
  const server = createMcpServer(async () => nooticr);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  await client.listTools();
  return client;
}
const call = async (client: Client, args: Record<string, unknown>, name = "mention_trend") =>
  client.callTool({ name, arguments: args }, undefined, { timeout: 30_000 });

const HISTORY = (runs: unknown[], extra: Record<string, unknown> = {}) => ({
  watchId: "w1",
  kind: "mentions",
  term: "nooticr",
  platforms: ["tiktok", "reddit"],
  windowDays: 90,
  retainedDays: 365,
  watchCreatedAt: "2025-06-01T00:00:00.000Z",
  runs,
  runCount: runs.length,
  found: { newest: 16, oldest: 16 },
  medianViews: { newest: null, oldest: null },
  recurring: [],
  ...extra,
});

describe("mention_trend", () => {
  it("reads the backend's stored history and charges nothing", async () => {
    const client = await connect(HISTORY(series([{ tiktok: 12, reddit: 4 }])));
    await call(client, { term: "nooticr" });
    expect(calls.map((c) => c.name)).toEqual(["brand_watch_history"]);
    expect(calls[0].args).toMatchObject({ term: "nooticr" });
  });

  it("needs a watch, and says so without fetching", async () => {
    const client = await connect(HISTORY([]));
    const res = await call(client, {});
    expect(calls).toHaveLength(0);
    const sc = res.structuredContent as Record<string, unknown>;
    expect(sc.billable).toBe(false);
    expect(String(res.content?.[0]?.text)).toMatch(/watchId.*or.*term/i);
  });

  it("states each network's direction, computed rather than derivable", async () => {
    // The exact bug this exists for. `runs` is newest-first: tiktok is 12 in
    // the newest point and 5 in the oldest, so it ROSE. Subtracting the ends
    // by hand said it fell.
    const runs = series([
      { tiktok: 12, reddit: 4 },
      { tiktok: 11, reddit: 5 },
      { tiktok: 9, reddit: 7 },
      { tiktok: 5, reddit: 11 },
    ]);
    const client = await connect(HISTORY(runs));
    const text = String((await call(client, { term: "nooticr" })).content?.[0]?.text);
    expect(text).toContain("tiktok rose from 5 to 12");
    expect(text).toContain("reddit fell from 11 to 4");
    expect(text, "the wrong direction must not appear anywhere").not.toContain("tiktok fell");
  });

  it("refuses to call a direction on two points", async () => {
    const client = await connect(HISTORY(series([{ tiktok: 12, reddit: 4 }, { tiktok: 2, reddit: 1 }])));
    const text = String((await call(client, { term: "nooticr" })).content?.[0]?.text);
    expect(text).toMatch(/Two points are not a trend/);
    expect(text).toMatch(/too short to call a direction/);
    // ...and does not then go on to name directions anyway.
    expect(text).not.toMatch(/rose from|fell from/);
  });

  it("says an empty history means it has not run, not that nobody spoke", async () => {
    const client = await connect(HISTORY([]));
    const text = String((await call(client, { term: "nooticr" })).content?.[0]?.text);
    // The distinction and the reason it holds. Asserting only the distinction
    // let a mutant delete "a watch records a point every time it sweeps" —
    // which is the fact that makes an empty history mean "has not run".
    expect(text).toMatch(/No runs recorded for "nooticr"/);
    expect(text).toMatch(/records a point every time it sweeps/);
    expect(text).toMatch(/has not run yet rather than that nobody has said anything/);
  });

  it("warns that the left edge is the record, not the beginning", async () => {
    const client = await connect(HISTORY(series([{ tiktok: 3, reddit: 3 }, { tiktok: 3, reddit: 3 }, { tiktok: 3, reddit: 3 }])));
    const text = String((await call(client, { term: "nooticr" })).content?.[0]?.text);
    expect(text).toMatch(/Do not read the left edge as the start of anything/);
    expect(text).toContain("Runs are kept for 365 days");
    expect(text).toContain("2025-06-01");
  });

  it("separates found from reported, because they answer different questions", async () => {
    const client = await connect(HISTORY(series([
      { tiktok: 8, reddit: 8, reported: 0 },
      { tiktok: 8, reddit: 8, reported: 5 },
      { tiktok: 8, reddit: 8, reported: 5 },
    ])));
    const text = String((await call(client, { term: "nooticr" })).content?.[0]?.text);
    // Both halves: the claim and its consequence. An earlier version asserted
    // only the consequence sentence, so a mutant that deleted the claim
    // survived — the two live in adjacent strings of one push.
    expect(text).toMatch(/`found` and `reported` are different questions/);
    expect(text).toMatch(/stopped moving rather than stopped/);
  });

  it("names the second axis on a competitor watch", async () => {
    const runs = series([{ tiktok: 12, reddit: 0 }, { tiktok: 12, reddit: 0 }, { tiktok: 12, reddit: 0 }]).map(
      (r, i) => ({ ...r, medianViews: [128_000, 61_000, 40_000][i] }),
    );
    const client = await connect(
      HISTORY(runs, { kind: "competitor", competitorHandle: "rival", medianViews: { newest: 128_000, oldest: 40_000 } }),
    );
    const text = String((await call(client, { term: "rival" })).content?.[0]?.text);
    // A creator can clear their own median every week while the median falls.
    // Both halves again, for the same reason as above.
    expect(text).toMatch(/that is the second axis/i);
    expect(text).toMatch(/beat their own median every week while/);
    expect(text).toMatch(/shrinking account having good weeks/);
    expect(text).toContain("40,000 to 128,000");
  });

  it("frames recurring entries as fingerprints, not as text it kept", async () => {
    const client = await connect(
      HISTORY(series([{ tiktok: 3, reddit: 3 }, { tiktok: 3, reddit: 3 }, { tiktok: 3, reddit: 3 }]), {
        recurring: [{ mentionKey: "k1", timesSeen: 6, firstReportedAt: "2026-01-01T00:00:00Z", lastSeenAt: "2026-01-31T00:00:00Z" }],
      }),
    );
    const text = String((await call(client, { term: "nooticr" })).content?.[0]?.text);
    expect(text).toMatch(/fingerprints, not text/);
    expect(text).toMatch(/deliberately not stored/);
  });

  it("says it is free, and why", async () => {
    const client = await connect(HISTORY(series([{ tiktok: 3, reddit: 3 }])));
    const text = String((await call(client, { term: "nooticr" })).content?.[0]?.text);
    expect(text).toMatch(/free because the sweeps were already billed/);
  });
});

describe("show_trend", () => {
  it("makes no request and carries both caveats as fields", async () => {
    const client = await connect({});
    const res = await call(
      client,
      { points: [{ ranAt: "2026-01-01T00:00:00Z", found: 3 }], tooShort: true, edgeIsRecordStart: true },
      "show_trend",
    );
    expect(calls).toHaveLength(0);
    const sc = res.structuredContent as Record<string, unknown>;
    expect(sc.trend).toBe(true);
    // Fields rather than prose, so the view can draw them and cannot quietly
    // omit them.
    expect(sc.tooShort).toBe(true);
    expect(sc.edgeIsRecordStart).toBe(true);
    expect(sc.metric).toBe("found");
  });
});
