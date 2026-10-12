/** connect_social_account forwards the optional `capabilities` grant, and only when given. */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
async function connect() {
  calls.length = 0;
  const nooticr = {
    me: async () => ({ id: "u1" }),
    callTool: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return { contentBlocks: [{ type: "text", text: "{}" }], structured: { url: "https://x" } };
    },
  } as unknown as NooticrClient;
  const client = new Client({ name: "test", version: "1.0.0" });
  const server = createMcpServer(async () => nooticr);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  await client.listTools();
  return client;
}

describe("connect_social_account capabilities", () => {
  it("forwards capabilities when supplied", async () => {
    const client = await connect();
    await client.callTool({
      name: "connect_social_account",
      arguments: { platform: "youtube", capabilities: ["manage_comments"] },
    });
    expect(calls).toEqual([
      { name: "connect_social_account", args: { platform: "youtube", capabilities: ["manage_comments"] } },
    ]);
  });

  it("leaves a plain call unchanged", async () => {
    const client = await connect();
    await client.callTool({ name: "connect_social_account", arguments: { platform: "tiktok" } });
    expect(calls[0].args).toEqual({ platform: "tiktok" });
    expect("capabilities" in calls[0].args).toBe(false);
  });

  it("rejects an unknown capability", async () => {
    const client = await connect();
    const r = await client.callTool({
      name: "connect_social_account",
      arguments: { platform: "youtube", capabilities: ["post"] },
    });
    expect(r.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });
});
