/**
 * The portfolio watch's two free reads of itself (#99): editing its terms,
 * and reading its share of voice out of the run series.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

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
const text = (r: unknown) =>
  ((r as { content: Array<{ type: string; text?: string }> }).content ?? [])
    .map((c) => c.text ?? "")
    .join("\n");

describe("update_watch_portfolio", () => {
  it("passes add/remove straight to the backend and relays a trimmed network", async () => {
    const client = await connect({
      updated: true,
      watchId: "w1",
      terms: ["acme", "rival", "third"],
      platformsSearched: ["reddit"],
      platformsSkipped: ["tiktok"],
      costPerRun: 6,
      budgetPerRun: 8,
      cost: 0,
      message: "Split 3 ways, the 8-credit budget no longer reaches tiktok.",
    });
    const result = await client.callTool({
      name: "update_watch_portfolio",
      arguments: { watchId: "w1", add: ["third"] },
    });
    expect(calls).toEqual([
      { name: "update_watch_portfolio", args: { watchId: "w1", add: ["third"] } },
    ]);
    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as Record<string, unknown>).platformsSkipped).toEqual([
      "tiktok",
    ]);
    // The trimmed network reaches a host that reads only text blocks too.
    expect(text(result)).toContain("tiktok");
  });

  it("is marked as a closed-world write that destroys nothing", async () => {
    const client = await connect({});
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "update_watch_portfolio");
    expect(tool?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    });
  });
});

describe("mention_trend on a portfolio", () => {
  const run = (daysAgo: number, perTerm: Record<string, unknown>) => ({
    ranAt: new Date(Date.UTC(2026, 0, 31 - daysAgo)).toISOString(),
    found: 10,
    reported: 2,
    perPlatform: { reddit: { found: 10, reported: 2 } },
    perTerm,
    medianViews: null,
    postsScored: null,
    costCredits: 4,
  });

  it("states each term's latest share of voice, and how it moved", async () => {
    const client = await connect({
      watchId: "w1",
      kind: "portfolio",
      term: "acme vs rival",
      terms: ["acme", "rival"],
      platforms: ["reddit"],
      windowDays: 90,
      retainedDays: 365,
      runs: [
        // Newest first, as the backend returns it.
        run(0, { acme: { found: 6, reported: 1, share: 60 }, rival: { found: 4, reported: 1, share: 40 } }),
        run(7, { acme: { found: 5, reported: 1, share: 50 }, rival: { found: 5, reported: 1, share: 50 } }),
        run(14, { acme: { found: 3, reported: 1, share: 30 }, rival: { found: 7, reported: 1, share: 70 } }),
      ],
      recurring: [],
    });
    const result = await client.callTool({ name: "mention_trend", arguments: { watchId: "w1" } });
    const guidance = String((result.structuredContent as Record<string, unknown>).guidance);
    expect(guidance).toContain("acme: 60% of mentions found (6), from 30%");
    expect(guidance).toContain("rival: 40% of mentions found (4), from 70%");
    expect(text(result)).toContain("share of all mentions");
  });

  it("names a term whose latest sweep failed instead of reading it as zero", async () => {
    const client = await connect({
      watchId: "w1",
      kind: "portfolio",
      term: "acme vs rival",
      runs: [run(0, { acme: { found: 10, reported: 2, share: 100 }, rival: { found: 0, reported: 0, share: 0, error: "timed out" } })],
      recurring: [],
    });
    const result = await client.callTool({ name: "mention_trend", arguments: { watchId: "w1" } });
    expect(text(result)).toContain("rival: not searched in the latest run");
  });
});
