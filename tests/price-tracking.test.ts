import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMarketplaceTools } from "../src/shared/marketplace.js";

/**
 * track_price / untrack_price (nooticr-server#1372) write one row in the
 * workspace's own price listings and fetch nothing. The server owns every rule
 * (the mirror lookup, the competitor check, tenant isolation), so the contract
 * here is: the exact arguments reach the backend tool of the same name, bad ones
 * never leave, and the hints say what a host may assume about a retry.
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

describe("track_price / untrack_price", () => {
  it("are free, closed-world writes, and only untracking can remove a row", async () => {
    const { client } = await connect({});
    const tools = (await client.listTools()).tools;
    const track = tools.find((t) => t.name === "track_price")!;
    const untrack = tools.find((t) => t.name === "untrack_price")!;
    expect(track.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    expect(untrack.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false });
    for (const t of [track, untrack]) {
      expect(t.description).toMatch(/Free\.$/);
      expect(t._meta?.ui).toBeUndefined();
    }
  });

  it("forward their arguments unchanged, a competitor included", async () => {
    const { client, calls } = await connect({ tracked: true, alreadyTracked: false, listing: { id: "1" } });
    const track = {
      marketplace: "cdiscount",
      id: "X123",
      productLine: "Kettles",
      competitorOf: { id: "OURS1" },
    };
    const untrack = { marketplace: "mercadolibre", id: "MLB123", market: "mlb" };
    expect((await client.callTool({ name: "track_price", arguments: track })).isError).toBeFalsy();
    expect((await client.callTool({ name: "untrack_price", arguments: untrack })).isError).toBeFalsy();
    expect(calls).toEqual([
      { name: "track_price", args: track },
      { name: "untrack_price", args: untrack },
    ]);
  });

  it("carries the answer in both channels", async () => {
    const payload = { tracked: false, changed: false, note: "This workspace was not tracking it; nothing changed." };
    const { client } = await connect(payload);
    const res = await client.callTool({ name: "untrack_price", arguments: { marketplace: "amazon", id: "B0X" } });
    expect(res.structuredContent).toEqual(payload);
    expect(JSON.parse((res.content as { text: string }[])[0].text)).toEqual(payload);
  });

  it("rejects a missing id, an unknown site, a long product line and stray arguments before calling the server", async () => {
    const { client, calls } = await connect({});
    for (const [name, args] of [
      ["track_price", { marketplace: "amazon" }],
      ["track_price", { marketplace: "ebay", id: "x" }],
      ["track_price", { marketplace: "amazon", id: "x", productLine: "p".repeat(121) }],
      ["track_price", { marketplace: "amazon", id: "x", competitorOf: { marketplace: "amazon" } }],
      ["track_price", { marketplace: "amazon", id: "x", competitorOf: { id: "y", seller: "z" } }],
      ["untrack_price", { marketplace: "amazon", id: "x", productLine: "p" }],
    ] as const) {
      const res = await client
        .callTool({ name, arguments: args as Record<string, unknown> })
        .catch((e: Error) => ({ isError: true, err: e }));
      expect(res.isError, `${name} ${JSON.stringify(args)}`).toBe(true);
    }
    expect(calls).toEqual([]);
  });
});
