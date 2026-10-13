import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCrmTools } from "../src/shared/crm.js";

const NAMES = ["crm_upsert_creator", "crm_list_creators", "crm_update_status", "crm_log_interaction"];

async function connect() {
  const calls: { name: string; args: unknown }[] = [];
  const stub = {
    callTool: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { contentBlocks: [{ type: "text", text: "ok" }], structured: { ok: true } };
    },
  };
  const server = new McpServer({ name: "t", version: "0" });
  registerCrmTools(server, (() => stub) as never);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "c", version: "0" });
  await Promise.all([client.connect(a), server.connect(b)]);
  return { client, calls };
}

describe("creator CRM tools", () => {
  it("registers exactly the four server tools, each free", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...NAMES].sort());
    for (const t of tools) expect(t.description, t.name).toContain("No cost to call.");
  });

  it("forwards each call to the backend tool of the same name with its arguments", async () => {
    const { client, calls } = await connect();
    const args: Record<string, Record<string, unknown>> = {
      crm_upsert_creator: { platform: "tiktok", handle: "maya.fit", followers: 12000, engagementRate: 0.052, fitScore: 80 },
      crm_list_creators: { status: "shortlisted", limit: 10, dueBefore: "2026-02-01" },
      crm_update_status: { creatorId: "c1", status: "paused", note: "later" },
      crm_log_interaction: { creatorId: "c1", kind: "outreach_draft", summary: "draft", body: "Hi" },
    };
    for (const name of NAMES) {
      const res = await client.callTool({ name, arguments: args[name] });
      expect(res.isError, name).toBeFalsy();
    }
    expect(calls).toEqual(NAMES.map((name) => ({ name, args: args[name] })));
  });

  it("refuses what the server refuses: status_change, unknown statuses, out-of-range values, extra keys", async () => {
    const { client, calls } = await connect();
    const bad: [string, Record<string, unknown>][] = [
      ["crm_log_interaction", { creatorId: "c1", kind: "status_change", summary: "x" }],
      ["crm_update_status", { creatorId: "c1", status: "nope", note: "x" }],
      ["crm_update_status", { creatorId: "c1", status: "paused" }],
      ["crm_upsert_creator", { platform: "tiktok", handle: "x", fitScore: 101 }],
      ["crm_upsert_creator", { platform: "tiktok", handle: "x", engagementRate: 5.2 }],
      ["crm_list_creators", { limit: 101 }],
      ["crm_list_creators", { bogus: 1 }],
    ];
    for (const [name, arguments_] of bad) {
      const res = await client.callTool({ name, arguments: arguments_ });
      expect(res.isError, `${name} ${JSON.stringify(arguments_)}`).toBe(true);
    }
    expect(calls).toEqual([]);
  });
});
