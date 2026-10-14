import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerEmployeeTools } from "../src/shared/employees.js";

const NAMES = [
  "hire_employee",
  "list_employees",
  "pause_employee",
  "fire_employee",
  "list_pending_actions",
  "approve_action",
  "reject_action",
];
const TWO_STEP = ["hire_employee", "fire_employee", "approve_action"];

async function connect() {
  const calls: { name: string; args: unknown }[] = [];
  const stub = {
    callTool: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { contentBlocks: [{ type: "text", text: "ok" }], structured: { ok: true } };
    },
  };
  const server = new McpServer({ name: "t", version: "0" });
  registerEmployeeTools(server, (() => stub) as never);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "c", version: "0" });
  await Promise.all([client.connect(a), server.connect(b)]);
  return { client, calls };
}

describe("employee tools", () => {
  it("registers exactly the seven server tools", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...NAMES].sort());
  });

  it("forwards each call to the backend tool of the same name with its arguments", async () => {
    const { client, calls } = await connect();
    const args: Record<string, Record<string, unknown>> = {
      hire_employee: { template: "social-media-manager", products: [3, 4], monthlyBudgetCredits: 50 },
      list_employees: { includeFired: true },
      pause_employee: { employeeId: "e1", resume: true },
      fire_employee: { employeeId: "e1", confirm: true },
      list_pending_actions: { employeeId: "e1", limit: 5 },
      approve_action: { actionId: "a1", confirm: true, confirmationToken: "tok", note: "ok" },
      reject_action: { actionId: "a1", note: "off brand" },
    };
    for (const name of NAMES) {
      const res = await client.callTool({ name, arguments: args[name] });
      expect(res.isError, name).toBeFalsy();
    }
    expect(calls).toEqual(NAMES.map((name) => ({ name, args: args[name] })));
  });

  it("forwards products as \"all\" and rejects an empty list", async () => {
    const { client, calls } = await connect();
    const ok = await client.callTool({ name: "hire_employee", arguments: { template: "t", products: "all" } });
    expect(ok.isError).toBeFalsy();
    expect(calls).toEqual([{ name: "hire_employee", args: { template: "t", products: "all" } }]);
    const bad = await client.callTool({ name: "hire_employee", arguments: { template: "t", products: [] } });
    expect(bad.isError).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("documents notify.recipients and forwards it unchanged", async () => {
    const { client, calls } = await connect();
    const { tools } = await client.listTools();
    const hire = tools.find((t) => t.name === "hire_employee")!;
    expect(hire.description).toContain("recipients");
    expect(JSON.stringify(hire.inputSchema)).toContain("recipients");
    const notify = { channels: ["email"], recipients: "admins" };
    const ok = await client.callTool({ name: "hire_employee", arguments: { template: "t", notify } });
    expect(ok.isError).toBeFalsy();
    expect(calls).toEqual([{ name: "hire_employee", args: { template: "t", notify } }]);
  });

  it("rejects arguments the server does not know", async () => {
    const { client, calls } = await connect();
    const res = await client.callTool({ name: "list_employees", arguments: { bogus: 1 } });
    expect(res.isError).toBe(true);
    expect(calls).toEqual([]);
  });

  it("tells the model never to confirm a two-step call on the user's behalf", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    for (const name of TWO_STEP) {
      const d = tools.find((t) => t.name === name)!.description ?? "";
      expect(d, name).toContain("only after the user explicitly agrees");
      expect(d, name).toContain("never confirm on the user's behalf");
    }
  });
});
