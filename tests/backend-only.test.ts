/**
 * Backend tools this surface keeps internal are written down with a reason
 * (#106), and none of them is registered by accident.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { MemoryWatchStore } from "../src/shared/watchlist.js";
import { BACKEND_ONLY_TOOLS } from "../src/shared/backend-only.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

describe("BACKEND_ONLY_TOOLS", () => {
  it("never overlaps the registered tools", async () => {
    const nooticr = { me: async () => ({ id: "u1" }) } as unknown as NooticrClient;
    const client = new Client({ name: "test", version: "1.0.0" }, { capabilities: {} });
    const server = createMcpServer(async () => nooticr, { watchStore: new MemoryWatchStore() });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(a), server.connect(b)]);
    const { tools } = await client.listTools();
    const registered = new Set(tools.map((t) => t.name));
    const both = Object.keys(BACKEND_ONLY_TOOLS).filter((n) => registered.has(n));
    expect(both).toEqual([]);
  });

  it("gives every exclusion a reason", () => {
    for (const [name, reason] of Object.entries(BACKEND_ONLY_TOOLS)) {
      expect(reason.trim().length, name).toBeGreaterThan(20);
    }
  });
});
