import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerStoreReadTools } from "../src/shared/store-read.js";

const NAMES = ["connect_store", "list_store_products"];

async function connect() {
  const calls: { name: string; args: unknown }[] = [];
  const stub = {
    callTool: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { contentBlocks: [{ type: "text", text: "ok" }], structured: { ok: true } };
    },
  };
  const server = new McpServer({ name: "t", version: "0" });
  registerStoreReadTools(server, (() => stub) as never);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "c", version: "0" });
  await Promise.all([client.connect(a), server.connect(b)]);
  return { client, calls };
}

describe("store read tools", () => {
  it("registers exactly the two server tools, and no store write", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(NAMES);
  });

  it("forwards each call to the backend tool of the same name with its arguments", async () => {
    const { client, calls } = await connect();
    const args: Record<string, Record<string, unknown>> = {
      connect_store: { platform: "shopify", shop: "x.myshopify.com", appId: "3" },
      list_store_products: { platform: "amazon", source: "report", limit: 20, includePricing: true },
    };
    for (const name of NAMES) {
      const res = await client.callTool({ name, arguments: args[name] });
      expect(res.isError, name).toBeFalsy();
    }
    expect(calls).toEqual(NAMES.map((name) => ({ name, args: args[name] })));
  });

  it("rejects an unknown platform and unknown arguments before calling the backend", async () => {
    const { client, calls } = await connect();
    const a = await client.callTool({ name: "connect_store", arguments: { platform: "etsy" } });
    const b = await client.callTool({ name: "list_store_products", arguments: { bogus: 1 } });
    expect(a.isError).toBe(true);
    expect(b.isError).toBe(true);
    expect(calls).toEqual([]);
  });

  it("marks the catalogue read as read-only", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.find((t) => t.name === "list_store_products")!.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === "connect_store")!.annotations?.readOnlyHint).toBe(false);
  });
});
