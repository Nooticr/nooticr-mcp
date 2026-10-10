/**
 * #95: the eleven non-Amazon marketplaces get the insights card Amazon has,
 * labelled with their own site and re-read from the scan like Amazon's (#107).
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { MemoryWatchStore } from "../src/shared/watchlist.js";
import { categoryGuidance } from "../src/shared/amazon.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

type Row = Record<string, unknown>;

const SCAN = {
  scanId: "scan-lz",
  status: "done",
  complete: true,
  rollup: { brands: ["Kobo"] },
  products: [{ sku: "LZ-1", title: "Kobo grinder", brand: "Kobo", price: "S$49", reviews: [] }],
};

async function connect() {
  const calls: Array<{ name: string; args: Row }> = [];
  const nooticr = {
    me: async () => ({ id: "u1" }),
    callTool: async (name: string, args: Row) => {
      calls.push({ name, args });
      return { contentBlocks: [], structured: SCAN };
    },
  } as unknown as NooticrClient;
  const client = new Client({ name: "t", version: "1" }, { capabilities: {} });
  const server = createMcpServer(async () => nooticr, { watchStore: new MemoryWatchStore() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  return { client, calls };
}

describe("show_marketplace_category_insights", () => {
  it("re-reads the scan through marketplace_scan_status with the same marketplace", async () => {
    const { client, calls } = await connect();
    const res = (await client.callTool({
      name: "show_marketplace_category_insights",
      arguments: {
        marketplace: "lazada",
        scanId: "scan-lz",
        category: "Coffee grinders",
        strengths: [{ brand: "Ghost", detail: "made up", asin: "LZ-GHOST" }],
        products: [{ sku: "LZ-1", price: "S$1" }],
      },
    })) as { content: Array<{ text: string }>; structuredContent: Row & { products: Row[]; verification: Row } };
    expect(calls).toEqual([
      { name: "marketplace_scan_status", args: { marketplace: "lazada", scanId: "scan-lz", waitSeconds: 0 } },
    ]);
    const sc = res.structuredContent;
    expect(sc.marketplace).toBe("lazada");
    expect(sc.products.map((p) => p.price)).toEqual(["S$49"]);
    expect(sc.verification.status).toBe("verified");
    expect(sc.verification.unknownAsins).toEqual(["LZ-GHOST"]);
    expect(res.content[0].text).toContain("on Lazada");
    expect(sc.mcpCredits).toEqual({ cost: 0 });
  });

  it("refuses an unknown marketplace without calling anything", async () => {
    const { client, calls } = await connect();
    const res = (await client.callTool({
      name: "show_marketplace_category_insights",
      arguments: { marketplace: "ebay", category: "x" },
    })) as { isError?: boolean };
    expect(res.isError).toBe(true);
    expect(calls).toEqual([]);
  });

  it("is what a finished marketplace scan now points at, with the marketplace", () => {
    const g = categoryGuidance({
      label: "grinders", products: 1, reviews: 3, ratingsRepresented: 10, brands: ["Kobo"],
      complete: true, scanId: "scan-lz", pending: 0,
      site: "Lazada", statusTool: "marketplace_scan_status", statusArgs: { marketplace: "lazada" },
      insightsTool: "show_marketplace_category_insights",
    });
    expect(g).toContain('call show_marketplace_category_insights with what you concluded and scanId "scan-lz", marketplace "lazada".');
  });
});
