/**
 * A running scan must be polled to the end before anything is concluded.
 * Hosts were writing the category read and signing off at 4 of 10 listings,
 * because "still running" was one sentence among instructions to write it.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { MemoryWatchStore } from "../src/shared/watchlist.js";
import { categoryGuidance, nextPoll } from "../src/shared/amazon.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

const base = {
  label: "burr grinders",
  products: 4,
  reviews: 40,
  ratingsRepresented: 1200,
  brands: ["Acme"],
  complete: true,
  scanId: "scan-9",
  pending: 0,
};

describe("categoryGuidance while a scan is running", () => {
  const running = categoryGuidance({ ...base, complete: false, pending: 6, total: 10, status: "running" });

  it("opens and closes with the poll, not the read", () => {
    expect(running.startsWith("NOT FINISHED: 4 of 10 listings collected so far, 6 still being collected.")).toBe(true);
    expect(running).toMatch(/do not end your turn/);
    expect(running).toContain('amazon_scan_status {"scanId":"scan-9"}');
    expect(running.trim().split("\n").pop()).toContain("Your next step is amazon_scan_status");
  });

  it("withholds the show_* pointer until the set is complete", () => {
    expect(running).not.toContain("call show_amazon_category_insights");
    expect(running).toMatch(/When the scan is complete — not before/);
  });

  it("says when to give up, so polling cannot loop forever", () => {
    expect(running).toMatch(/status "failed", or returns the same number of listings three calls in a row/);
  });

  it("names the marketplace in the poll for the other sites", () => {
    const g = categoryGuidance({
      ...base, complete: false, pending: 6, total: 10, status: "running",
      statusTool: "marketplace_scan_status", statusArgs: { marketplace: "lazada" }, insightsTool: null,
    });
    expect(g).toContain('marketplace_scan_status {"scanId":"scan-9","marketplace":"lazada"}');
  });

  it("treats a failed scan as final and partial, not as something to poll", () => {
    const g = categoryGuidance({ ...base, complete: false, pending: 6, total: 10, status: "failed" });
    expect(g).not.toContain("NOT FINISHED");
    expect(g).toMatch(/will not finish/);
    expect(g).toMatch(/covers 4 of 10 listings, not the full set/);
  });

  it("leaves a finished scan exactly as it was", () => {
    const g = categoryGuidance(base);
    expect(g).not.toMatch(/NOT FINISHED|Your next step/);
    expect(g).toContain("call show_amazon_category_insights");
  });
});

describe("server instructions", () => {
  it("tell every host to poll a scan to its end", async () => {
    const { SERVER_INSTRUCTIONS } = await import("../src/shared/getting-started.js");
    expect(SERVER_INSTRUCTIONS).toMatch(/keep polling until it is complete before concluding/);
  });
});

describe("nextPoll", () => {
  it("is set only while the scan runs", () => {
    expect(nextPoll({ scanId: "s", complete: false, status: "running" }, "amazon_scan_status")).toMatchObject({
      tool: "amazon_scan_status", arguments: { scanId: "s" },
    });
    expect(nextPoll({ scanId: "s", complete: true }, "amazon_scan_status")).toBeNull();
    expect(nextPoll({ scanId: "s", complete: false, status: "failed" }, "amazon_scan_status")).toBeNull();
  });
});

describe("through the real tool", () => {
  it("amazon_scan_status on a running scan says poll again, in both channels", async () => {
    const nooticr = {
      me: async () => ({ id: "u1" }),
      callTool: async () => ({
        contentBlocks: [],
        structured: {
          scanId: "scan-9", status: "running", complete: false, query: "burr grinders",
          progress: { total: 10, done: 4 },
          products: [{ asin: "B01", title: "Acme", brand: "Acme", reviews: [] }],
          rollup: {},
        },
      }),
    } as unknown as NooticrClient;
    const client = new Client({ name: "t", version: "1" }, { capabilities: {} });
    const server = createMcpServer(async () => nooticr, { watchStore: new MemoryWatchStore() });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(a), server.connect(b)]);
    const res = (await client.callTool({ name: "amazon_scan_status", arguments: { scanId: "scan-9" } })) as {
      content: Array<{ text: string }>;
      structuredContent: Record<string, unknown>;
    };
    expect(res.content[0].text.startsWith("NOT FINISHED")).toBe(true);
    // The text channel ends on the digest; the poll must come after it.
    expect(res.content[0].text.trim().endsWith('Call amazon_scan_status {"scanId":"scan-9"} now, before writing anything else.')).toBe(true);
    expect(res.structuredContent.nextCall).toMatchObject({ tool: "amazon_scan_status", arguments: { scanId: "scan-9" } });
    expect(String(res.structuredContent.guidance)).toMatch(/^NOT FINISHED/);
  });
});
