/**
 * #100: this server registers no purchase tool, so nothing a connected model
 * can read may send it after one.
 *
 * Three places did: the backend's out-of-credits error ("call
 * buy_nooticr_credits - it returns a Stripe Checkout URL"), the `hint` beside
 * the billing URL check_nooticr_credits already strips, and the consent and
 * docs text for `credits:spend` ("open a checkout"). The backend can bring the
 * pitch back at any time without this repo noticing, so the checks here are on
 * what reaches a client, not only on this repo's own strings.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { MemoryWatchStore } from "../src/shared/watchlist.js";
import { NooticrClient, outOfCreditsMessage, safeCreditsHint } from "../src/shared/nooticr.js";

const PITCH = /buy_nooticr_credits|stripe|checkout/i;

// The message the backend sent before nooticr-server stopped sending it.
const OLD_BACKEND_ERROR =
  "Insufficient MCP credits — this tool costs 3 credit(s) but your balance is 1. New users get 20 " +
  "free credits for data tools.\\n To continue, either:\\n • Call the `buy_nooticr_credits` tool now — " +
  "it returns a Stripe Checkout URL to open in your browser, or\\n • Visit https://nooticr.com/settings?tab=billing to top up.";

async function connect(nooticr: unknown) {
  const client = new Client({ name: "test", version: "1.0.0" }, { capabilities: {} });
  const server = createMcpServer(async () => nooticr as NooticrClient, { watchStore: new MemoryWatchStore() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  return client;
}

describe("no purchase path", () => {
  it("no tool, resource or prompt a client lists names one", async () => {
    const client = await connect({ me: async () => ({ id: "u1" }) });
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).not.toContain("buy_nooticr_credits");
    for (const t of tools) {
      expect(JSON.stringify(t), t.name).not.toMatch(/buy_nooticr_credits/);
    }
    const { resources } = await client.listResources();
    for (const r of resources) expect(JSON.stringify(r)).not.toMatch(/buy_nooticr_credits/);
  });

  it("rewrites the out-of-credits error, keeping only the figures", () => {
    const msg = outOfCreditsMessage(OLD_BACKEND_ERROR);
    expect(msg).not.toMatch(PITCH);
    expect(msg).not.toMatch(/https?:/);
    expect(msg).not.toContain("\\n");
    expect(msg).toContain("costs 3 credit(s) and your balance is 1");
    expect(msg).toMatch(/nooticr website/);
    // A message it cannot read the numbers from still says the right thing.
    expect(outOfCreditsMessage("something else entirely")).toMatch(/does not cover this tool/);
  });

  it("the client applies it to a -32002 from the backend", async () => {
    const real = new NooticrClient("http://127.0.0.1:1", (async () => "t") as never);
    (real as unknown as { request: unknown }).request = async () => ({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32002, message: OLD_BACKEND_ERROR },
    });
    await expect(real.callTool("get_social_media", { url: "x" })).rejects.toThrow(/nooticr website/);
    await expect(real.callTool("get_social_media", { url: "x" })).rejects.not.toThrow(PITCH);
  });

  it("check_nooticr_credits hands back no pitch in its hint", async () => {
    const client = await connect({
      me: async () => ({ id: "u1" }),
      callTool: async () => ({
        contentBlocks: [],
        structured: {
          balance: 0,
          billingUrl: "https://nooticr.com/settings?tab=billing",
          hint: "You have no credits and no free first uses left. Call buy_nooticr_credits to get a Stripe Checkout URL.",
        },
      }),
    });
    const res = await client.callTool({ name: "check_nooticr_credits", arguments: {} });
    const text = JSON.stringify(res);
    expect(text).not.toMatch(PITCH);
    expect(text).not.toContain("settings?tab=billing");
    expect(safeCreditsHint("2 tool(s) still have a free first use: a, b.")).toBe(
      "2 tool(s) still have a free first use: a, b.",
    );
  });

  it("the consent and docs text for credits:spend promise no checkout", () => {
    for (const file of ["src/shared/oauth.ts", "cloudflare/src/site/documentation.ts"]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/open a checkout/);
      expect(src, file).not.toMatch(/buy_nooticr_credits/);
    }
  });
});
