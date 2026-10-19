/**
 * Creator identities (nooticr-server #36, identities.ts): the four store tools
 * and the two watch tools are passthroughs; the watchlist marks which person
 * each account belongs to; and suggest_creator_identity's guidance names where
 * a confirmed answer goes, since a host that never learns save_creator_identity
 * exists has nothing to save a confirmation with.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerIdentityTools } from "../src/shared/identities.js";
import { createMcpServer } from "../src/shared/tools.js";
import { BackendWatchStore, MemoryWatchStore } from "../src/shared/watchlist.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

const NAMES = [
  "save_creator_identity",
  "list_creator_identities",
  "update_creator_identity",
  "delete_creator_identity",
  "watch_creator_identity",
  "unwatch_creator_identity",
];

async function connectTools() {
  const calls: { name: string; args: unknown }[] = [];
  const stub = {
    callTool: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { contentBlocks: [{ type: "text", text: "ok" }], structured: { ok: true, cost: 0 } };
    },
  };
  const server = new McpServer({ name: "t", version: "0" });
  registerIdentityTools(server, (() => stub) as never);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "c", version: "0" });
  await Promise.all([client.connect(a), server.connect(b)]);
  return { client, calls };
}

const LENA = [
  { platform: "tiktok", handle: "lena.mornings" },
  { platform: "instagram", handle: "lena.mornings", evidence: [{ signal: "shared_bio_link", strength: "strong" }] },
];

describe("creator identity tools", () => {
  it("registers the six server tools, free, and only the list as read-only", async () => {
    const { client } = await connectTools();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...NAMES].sort());
    for (const t of tools) {
      expect(t.description, t.name).toContain("No cost to call.");
      expect(t.annotations?.openWorldHint, t.name).toBe(false);
    }
    const hint = (name: string) => tools.find((t) => t.name === name)!.annotations!;
    expect(NAMES.filter((n) => hint(n).readOnlyHint)).toEqual(["list_creator_identities"]);
    expect(NAMES.filter((n) => hint(n).destructiveHint).sort()).toEqual(
      ["delete_creator_identity", "unwatch_creator_identity", "update_creator_identity"],
    );
  });

  it("forwards each call to the backend tool of the same name with its arguments", async () => {
    const { client, calls } = await connectTools();
    const args: Record<string, Record<string, unknown>> = {
      save_creator_identity: { name: "Lena Park", accounts: LENA, note: "confirmed by the user" },
      list_creator_identities: {},
      update_creator_identity: {
        identityId: "i1",
        name: "Lena P.",
        note: "",
        addAccounts: [{ platform: "youtube", handle: "lenapark" }],
        removeAccounts: [{ platform: "tiktok", handle: "lena.mornings" }],
      },
      delete_creator_identity: { identityId: "i1" },
      watch_creator_identity: { identityId: "i1", note: "rival" },
      unwatch_creator_identity: { identityId: "i1" },
    };
    for (const name of NAMES) {
      const res = await client.callTool({ name, arguments: args[name] });
      expect(res.isError, name).toBeFalsy();
    }
    expect(calls).toEqual(NAMES.map((name) => ({ name, args: args[name] })));
  });

  it("refuses what the server would, before calling it", async () => {
    const { client, calls } = await connectTools();
    const many = Array.from({ length: 21 }, (_, i) => ({ platform: "tiktok", handle: `a${i}` }));
    const bad: [string, Record<string, unknown>][] = [
      ["save_creator_identity", { name: "Lena", accounts: [] }],
      ["save_creator_identity", { name: "Lena", accounts: many }],
      ["save_creator_identity", { accounts: LENA }],
      ["save_creator_identity", { name: "Lena", accounts: [{ platform: "tiktok" }] }],
      ["update_creator_identity", { name: "no id" }],
      ["update_creator_identity", { identityId: "i1", note: null }],
      ["delete_creator_identity", {}],
      ["watch_creator_identity", { identityId: "i1", bogus: 1 }],
      ["list_creator_identities", { bogus: 1 }],
    ];
    for (const [name, arguments_] of bad) {
      const res = await client.callTool({ name, arguments: arguments_ });
      expect(res.isError, `${name} ${JSON.stringify(arguments_)}`).toBe(true);
    }
    expect(calls).toEqual([]);
  });
});

/** A backend whose watchlist marks each entry's identity, as nooticr-server's does. */
function backendWithIdentities() {
  const entries = [
    { id: "tiktok:lena.mornings", platform: "tiktok", handle: "lena.mornings", addedAt: "2026-10-01T00:00:00Z", identity: { identityId: "i1", name: "Lena Park" } },
    { id: "instagram:lena.mornings", platform: "instagram", handle: "lena.mornings", addedAt: "2026-10-01T00:00:00Z", identity: { identityId: "i1", name: "Lena Park" } },
    { id: "tiktok:coffeelab", platform: "tiktok", handle: "coffeelab", addedAt: "2026-10-02T00:00:00Z", identity: null },
  ];
  return {
    me: async () => ({ id: "u1" }),
    callTool: async (name: string) => {
      if (name === "list_watchlist") return { contentBlocks: [], structured: { watching: entries.length, entries } };
      throw new Error(`unexpected ${name}`);
    },
  } as unknown as NooticrClient;
}

async function connectServer(nooticr: NooticrClient, watchStore: BackendWatchStore | MemoryWatchStore) {
  const client = new Client({ name: "test", version: "1.0.0" }, { capabilities: {} });
  const server = createMcpServer(async () => nooticr, { watchStore });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  return client;
}

describe("list_watchlist by identity", () => {
  it("marks each account's identity and groups one person's accounts", async () => {
    const nooticr = backendWithIdentities();
    const client = await connectServer(nooticr, new BackendWatchStore(() => nooticr, new MemoryWatchStore()));
    const res = await client.callTool({ name: "list_watchlist", arguments: {} });
    const sc = res.structuredContent as {
      entries: Array<{ id: string; identity: unknown }>;
      byIdentity: unknown[];
    };
    const byId = Object.fromEntries(sc.entries.map((e) => [e.id, e.identity]));
    expect(byId["tiktok:lena.mornings"]).toEqual({ identityId: "i1", name: "Lena Park" });
    expect(byId["tiktok:coffeelab"]).toBeNull();
    expect(sc.byIdentity).toEqual([
      { identityId: "i1", name: "Lena Park", entryIds: ["instagram:lena.mornings", "tiktok:lena.mornings"] },
    ]);
  });

  it("says no identity on a local store, where identities do not exist", async () => {
    const nooticr = { me: async () => ({ id: "u1" }), callTool: async () => ({ contentBlocks: [], structured: {} }) } as unknown as NooticrClient;
    const client = await connectServer(nooticr, new MemoryWatchStore());
    await client.callTool({ name: "watch_creator", arguments: { username: "coffeelab" } });
    const res = await client.callTool({ name: "list_watchlist", arguments: {} });
    const sc = res.structuredContent as { entries: Array<{ identity: unknown }>; byIdentity: unknown[] };
    expect(sc.entries.map((e) => e.identity)).toEqual([null]);
    expect(sc.byIdentity).toEqual([]);
  });
});

describe("suggest_creator_identity guidance", () => {
  it("names save_creator_identity in the payload's own guidance, so both channels carry it", async () => {
    const nooticr = {
      me: async () => ({ id: "u1" }),
      callTool: async () => ({
        contentBlocks: [],
        structured: { guidance: "These are SUGGESTIONS. Nothing has been merged.", suggestions: [] },
      }),
    } as unknown as NooticrClient;
    const client = await connectServer(nooticr, new MemoryWatchStore());
    const res = await client.callTool({ name: "suggest_creator_identity", arguments: { handle: "lena.mornings" } });
    const guidance = String((res.structuredContent as { guidance: string }).guidance);
    expect(guidance).toMatch(/^These are SUGGESTIONS\. Nothing has been merged\./);
    expect(guidance).toContain("save_creator_identity");
    expect(guidance).toContain("never save one nobody confirmed");
    const text = (res.content as Array<{ type: string; text?: string }>).map((c) => c.text ?? "").join("\n");
    expect(text).toContain("save_creator_identity");
  });
});
