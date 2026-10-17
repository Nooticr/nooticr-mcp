import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMarketplaceTools } from "../src/shared/marketplace.js";

/**
 * get_price_history (nooticr-server#831) reads stored observations back and
 * fetches nothing, so the whole contract here is: the exact arguments reach
 * the backend tool of the same name, bad ones never leave, and a product with
 * no record is an answer the model can read rather than an error.
 */
async function connect(structured: Record<string, unknown>) {
  const calls: { name: string; args: unknown }[] = [];
  const stub = {
    callTool: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { contentBlocks: [{ type: "text", text: "ok" }], structured };
    },
  };
  const server = new McpServer({ name: "t", version: "0" });
  registerMarketplaceTools(server, (() => stub) as never);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "c", version: "0" });
  await Promise.all([client.connect(a), server.connect(b)]);
  return { client, calls };
}

describe("get_price_history", () => {
  it("is a free, closed-world read", async () => {
    const { client } = await connect({});
    const tool = (await client.listTools()).tools.find((t) => t.name === "get_price_history");
    expect(tool).toBeTruthy();
    expect(tool!.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
    expect(tool!.description).toMatch(/Free\.$/);
    expect(tool!._meta?.ui).toBeUndefined();
  });

  it("forwards its arguments unchanged to the backend tool of the same name", async () => {
    const { client, calls } = await connect({ recorded: true, metric: "rating", series: [], count: 0 });
    const args = { marketplace: "amazon", id: "B0CHX1W1XY", market: "us", from: "2026-09-01", to: "2026-10-15T12:00:00Z", metric: "rating" };
    const res = await client.callTool({ name: "get_price_history", arguments: args });
    expect(res.isError).toBeFalsy();
    expect(calls).toEqual([{ name: "get_price_history", args }]);
  });

  it("carries an unrecorded product in both channels, as an answer", async () => {
    const payload = { recorded: false, billable: false, note: "Nothing stored for this product yet." };
    const { client } = await connect(payload);
    const res = await client.callTool({ name: "get_price_history", arguments: { marketplace: "amazon", id: "B0NEVER" } });
    expect(res.isError).toBeFalsy();
    expect(res.structuredContent).toEqual(payload);
    expect(JSON.parse((res.content as { text: string }[])[0].text)).toEqual(payload);
  });

  it("rejects a missing id, an unknown metric, an unknown site and stray arguments before calling the server", async () => {
    const { client, calls } = await connect({});
    for (const args of [
      { marketplace: "amazon" },
      { marketplace: "amazon", id: "x", metric: "sales" },
      { marketplace: "ebay", id: "x" },
      { marketplace: "amazon", id: "x", reviews: true },
    ]) {
      const res = await client.callTool({ name: "get_price_history", arguments: args }).catch((e: Error) => ({ isError: true, err: e }));
      expect(res.isError, JSON.stringify(args)).toBe(true);
    }
    expect(calls).toEqual([]);
  });
});
