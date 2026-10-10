/**
 * A tool that advertises a wait longer than its host will tolerate is worse
 * than one that advertises none.
 *
 * `scan_amazon_category` shipped with "default 90, max 240" for its
 * `waitSeconds`. Claude Code abandons a `tools/call` at 60 s, so the default
 * call failed there and the advertised maximum could not have succeeded at all
 * — and the failure is not a slow answer. The host reports a timeout, the
 * scanId goes with it, and a scan the caller already paid for keeps running
 * with nobody holding the handle to collect it. Asking for more time was the
 * one thing guaranteed to return less.
 *
 * The backend clamps the wait, so these numbers are prose, which is exactly
 * why nothing caught them: a schema can advertise a ceiling the server throws
 * away and every test still passes. This reads the built surface a host
 * actually receives.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

/** The shortest tool-call timeout among the hosts this server is served to. */
const SHORTEST_HOST_TIMEOUT_SECONDS = 60;

/** What nooticr-server's MAX_WAIT_SECONDS clamps every wait down to. */
const BACKEND_WAIT_CEILING_SECONDS = 55;

async function shippedTools() {
  const client = new Client({ name: "wait-ceiling", version: "1.0.0" });
  const server = createMcpServer(
    async () =>
      ({ callTool: async () => ({ contentBlocks: [], structured: {} }) }) as unknown as NooticrClient,
  );
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  return (await client.listTools()).tools;
}

/** Every second-count a tool's prose puts in front of a host. */
function advertisedWaits(tool: { description?: string; inputSchema?: unknown }): number[] {
  const props = (tool.inputSchema as { properties?: Record<string, { description?: string }> })
    ?.properties;
  const waitHints = Object.entries(props ?? {})
    .filter(([name]) => /wait/i.test(name))
    .map(([, v]) => v?.description ?? "");
  const prose = [tool.description ?? "", ...waitHints].join(" ");
  return [...prose.matchAll(/\b(?:default|max)\s+(\d+)\b/gi)].map((m) => Number(m[1]));
}

describe("advertised wait times", () => {
  it("never name a wait the host will not sit through", async () => {
    const tools = await shippedTools();
    const withWaits = tools.filter((t) => advertisedWaits(t).length > 0);
    // If this drops to zero the check has stopped checking anything.
    expect(withWaits.length).toBeGreaterThan(0);

    for (const tool of withWaits) {
      for (const seconds of advertisedWaits(tool)) {
        expect(
          seconds,
          `${tool.name} advertises a ${seconds}s wait; the host gives up at ` +
            `${SHORTEST_HOST_TIMEOUT_SECONDS}s and the backend clamps at ` +
            `${BACKEND_WAIT_CEILING_SECONDS}s`,
        ).toBeLessThanOrEqual(BACKEND_WAIT_CEILING_SECONDS);
      }
    }
  });

  it("tell the host that polling, not a longer wait, is how a scan gets more time", async () => {
    const tools = await shippedTools();
    const scan = tools.find((t) => t.name === "scan_amazon_category");
    expect(scan, "scan_amazon_category is not registered").toBeDefined();
    // The recovery has to be in the description itself: a host that times out
    // never sees the result, so the instruction to poll has to arrive before
    // the call, not inside its output.
    expect(scan?.description ?? "").toMatch(/amazon_scan_status/);
    expect(scan?.description ?? "").toMatch(/poll/i);
  });
});
