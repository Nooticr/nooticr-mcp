import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSheetsTools } from "../src/shared/sheets.js";

const READS = ["sheets_list", "sheets_read"];
const WRITES = ["sheets_create", "sheets_append_rows", "sheets_update_range", "sheets_add_sheet"];

async function connect() {
  const calls: { name: string; args: unknown }[] = [];
  const stub = {
    callTool: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { contentBlocks: [{ type: "text", text: "ok" }], structured: { id: "abc" } };
    },
  };
  const server = new McpServer({ name: "t", version: "0" });
  registerSheetsTools(server, (() => stub) as never);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "c", version: "0" });
  await Promise.all([client.connect(a), server.connect(b)]);
  return { client, calls };
}

describe("sheets tools", () => {
  it("registers exactly the six server tools, reads read-only and writes not", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...READS, ...WRITES].sort());
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint, t.name).toBe(READS.includes(t.name));
      expect(t.annotations?.openWorldHint, t.name).toBe(true);
    }
  });

  it("forwards each tool's arguments to the server unchanged", async () => {
    const { client, calls } = await connect();
    const args: Record<string, Record<string, unknown>> = {
      sheets_create: { appId: 2, title: "Ledger", sheets: [{ name: "Ledger", headers: ["Date", "Amount"] }] },
      sheets_list: { limit: 10 },
      sheets_read: { id: "1AbC", range: "Ledger!A1:F200" },
      sheets_append_rows: { id: "1AbC", sheet: "Ledger", rows: [["2026-01-31", 12.5, null, { formula: "=SUM(A1:A3)" }, true]] },
      sheets_update_range: { id: "1AbC", range: "Ledger!B2:C3", values: [[1, 2], ["x", null]] },
      sheets_add_sheet: { appId: 2, id: "1AbC", name: "March" },
    };
    for (const [name, a] of Object.entries(args)) {
      const r = await client.callTool({ name, arguments: a });
      expect(r.isError, name).toBeFalsy();
    }
    expect(calls).toEqual(Object.entries(args).map(([name, a]) => ({ name, args: a })));
  });

  it("rejects missing required and unknown arguments before calling the server", async () => {
    const { client, calls } = await connect();
    for (const [name, a] of [
      ["sheets_create", {}],
      ["sheets_read", { id: "x" }],
      ["sheets_append_rows", { id: "x", sheet: "S" }],
      ["sheets_list", { nope: 1 }],
    ] as const) {
      const r = await client.callTool({ name, arguments: a });
      expect(r.isError, name).toBe(true);
    }
    expect(calls).toEqual([]);
  });
});
