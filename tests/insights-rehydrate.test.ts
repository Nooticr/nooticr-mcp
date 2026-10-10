/**
 * #107: show_amazon_category_insights draws the scan's own listings, re-read
 * by scanId, rather than whatever the model re-sends.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { MemoryWatchStore } from "../src/shared/watchlist.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

type Row = Record<string, unknown>;

const SCAN = {
  scanId: "scan-1",
  status: "done",
  complete: true,
  rollup: { brands: ["Acme", "Beta"] },
  products: [
    { asin: "B0ACME", title: "Acme Grinder", brand: "Acme", price: "$39.99", price_value: 39.99, reviews: [] },
    { asin: "B0BETA", title: "Beta Grinder", brand: "Beta", price: "$24.00", price_value: 24, reviews: [] },
  ],
};

async function connect(scan: Row | Error) {
  const calls: Array<{ name: string; args: Row }> = [];
  const nooticr = {
    me: async () => ({ id: "u1" }),
    callTool: async (name: string, args: Row) => {
      calls.push({ name, args });
      if (scan instanceof Error) throw scan;
      return { contentBlocks: [], structured: scan };
    },
  } as unknown as NooticrClient;
  const client = new Client({ name: "test", version: "1.0.0" }, { capabilities: {} });
  const server = createMcpServer(async () => nooticr, { watchStore: new MemoryWatchStore() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  return { client, calls };
}

async function show(client: Client, args: Row) {
  const res = (await client.callTool({ name: "show_amazon_category_insights", arguments: { category: "Coffee grinders", ...args } })) as {
    content: Array<{ text: string }>;
    structuredContent: Row & {
      products: Array<Row>;
      verification: Row & { notInScan?: string[]; unknownAsins?: string[] };
    };
  };
  return res;
}

describe("show_amazon_category_insights re-reads the scan", () => {
  it("draws the scan's own listings, not a mis-copied price", async () => {
    const { client, calls } = await connect(SCAN);
    const res = await show(client, {
      scanId: "scan-1",
      products: [{ asin: "B0ACME", title: "Acme Grinder", price: "$9.99" }],
    });
    expect(calls).toEqual([{ name: "amazon_scan_status", args: { scanId: "scan-1", waitSeconds: 0 } }]);
    expect(res.structuredContent.products.map((p) => p.price)).toEqual(["$39.99", "$24.00"]);
    expect(res.structuredContent.verification.status).toBe("verified");
    expect(res.structuredContent.rollup).toEqual({ brands: ["Acme", "Beta"] });
  });

  it("flags a listing the model invented and an ASIN the scan does not contain", async () => {
    const { client } = await connect(SCAN);
    const res = await show(client, {
      scanId: "scan-1",
      products: [{ asin: "B0FAKE", title: "Invented competitor" }],
      strengths: [
        { brand: "Acme", detail: "Burr consistency", asin: "B0ACME" },
        { brand: "Ghost", detail: "Made up", asin: "B0GHOST" },
      ],
    });
    const v = res.structuredContent.verification;
    expect(v.notInScan).toEqual(["B0FAKE"]);
    expect(v.unknownAsins).toEqual(["B0GHOST"]);
    expect(res.structuredContent.products.map((p) => p.asin)).not.toContain("B0FAKE");
    // Said in the text channel too, for the host that reads only that.
    expect(res.content[0].text).toContain("B0FAKE");
    expect(res.content[0].text).toContain("B0GHOST");
  });

  it("says when the scan was still running", async () => {
    const { client } = await connect({ ...SCAN, complete: false, status: "running" });
    const res = await show(client, { scanId: "scan-1" });
    expect(res.structuredContent.verification.scanComplete).toBe(false);
    expect(res.content[0].text).toMatch(/still running/);
  });

  it("without a scanId draws what was sent, marked unverified, and calls nothing", async () => {
    const { client, calls } = await connect(SCAN);
    const res = await show(client, { products: [{ asin: "B0X", title: "Sent" }] });
    expect(calls).toEqual([]);
    expect(res.structuredContent.verification.status).toBe("unverified");
    expect(res.structuredContent.products.map((p) => p.asin)).toEqual(["B0X"]);
    expect(res.content[0].text).toMatch(/not checked against a scan/);
  });

  it("falls back to what was sent, unverified, when the scan cannot be re-read", async () => {
    const { client } = await connect(new Error("scan expired"));
    const res = await show(client, { scanId: "scan-1", products: [{ asin: "B0X" }] });
    expect(res.structuredContent.verification.status).toBe("unverified");
    expect(String(res.structuredContent.verification.note)).toContain("scan expired");
    expect(res.structuredContent.products).toHaveLength(1);
  });

  it("stays free", async () => {
    const { client } = await connect(SCAN);
    const res = await show(client, { scanId: "scan-1" });
    expect(res.structuredContent.mcpCredits).toEqual({ cost: 0 });
  });
});
