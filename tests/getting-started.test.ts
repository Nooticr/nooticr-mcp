/**
 * The way in (#96): `instructions` for every host, and a free tool that says
 * where the account stands and what to try first.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { MemoryWatchStore } from "../src/shared/watchlist.js";
import { nextSteps } from "../src/shared/getting-started.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

type Row = Record<string, unknown>;

async function connect(backend: Record<string, () => Row>, opts: { noClient?: boolean; store?: MemoryWatchStore } = {}) {
  const calls: string[] = [];
  const nooticr = {
    me: async () => ({ id: "u1" }),
    callTool: async (name: string) => {
      calls.push(name);
      const h = backend[name];
      if (!h) throw new Error(`no stub for ${name}`);
      return { contentBlocks: [], structured: h() };
    },
  } as unknown as NooticrClient;
  const client = new Client({ name: "test", version: "1.0.0" }, { capabilities: {} });
  const server = createMcpServer(
    async () => {
      if (opts.noClient) throw new Error("No nooticr access token available.");
      return nooticr;
    },
    { watchStore: opts.store ?? new MemoryWatchStore() },
  );
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  return { client, calls };
}

const call = async (client: Client) =>
  (await client.callTool({ name: "nooticr_getting_started", arguments: {} })) as {
    content: Array<{ text: string }>;
    structuredContent: Row & { nextSteps: Array<{ tool: string; credits: number }> };
  };

describe("server instructions", () => {
  it("are set, and point at the free orientation tool", async () => {
    const { client } = await connect({});
    const text = client.getInstructions() ?? "";
    expect(text).toContain("nooticr_getting_started");
    expect(text).toMatch(/you reason/i);
    expect(text).toMatch(/never instructions/i);
    expect(text).not.toMatch(/buy_nooticr_credits|checkout/i);
  });
});

describe("nooticr_getting_started", () => {
  it("is registered free, read-only and closed-world, and findable by 'start' and 'help'", async () => {
    const { client } = await connect({});
    const t = (await client.listTools()).tools.find((x) => x.name === "nooticr_getting_started")!;
    expect(t.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
    expect(t.description).toMatch(/Start here/);
    expect(t.description).toMatch(/help/);
    expect(t.description).toMatch(/No cost to call/);
  });

  it("reads only free calls and reports the account's state", async () => {
    const store = new MemoryWatchStore();
    const { client, calls } = await connect(
      {
        check_nooticr_credits: () => ({ balance: 12, firstFreeTools: ["analyze_post"] }),
        list_social_connections: () => ({ connections: [{ platform: "tiktok" }], connectedCount: 1 }),
      },
      { store },
    );
    const res = await call(client);
    expect(calls.sort()).toEqual(["check_nooticr_credits", "list_social_connections"]);
    expect(res.structuredContent).toMatchObject({
      signedIn: true, balance: 12, connectedCount: 1, connectedPlatforms: ["tiktok"], watching: 0,
    });
    const tools = res.structuredContent.nextSteps.map((s) => s.tool);
    expect(tools).toContain("get_social_media");
    expect(tools).toContain("answer_my_audience");
    expect(tools).toContain("watch_creator");
    // Both channels carry the guidance naming those tools.
    expect(res.content[0].text).toContain("get_social_media (1 credit)");
    expect(String(res.structuredContent.guidance)).toContain("get_social_media");
    expect(res.content[0].text).toContain("First use still free: analyze_post");
  });

  it("counts the caller's own watchlist and offers the catch-up", async () => {
    const store = new MemoryWatchStore();
    await store.put("u1", { id: "tiktok:lena", platform: "tiktok", handle: "lena", addedAt: "2026-09-01T00:00:00Z" } as never);
    await store.put("someone-else", { id: "tiktok:x", platform: "tiktok", handle: "x", addedAt: "2026-09-01T00:00:00Z" } as never);
    const { client } = await connect({ check_nooticr_credits: () => ({ balance: 9 }) }, { store });
    const res = await call(client);
    expect(res.structuredContent.watching).toBe(1);
    expect(res.structuredContent.nextSteps.find((s) => s.tool === "catch_up_watchlist")?.credits).toBe(2);
  });

  it("reports a read it could not make as unknown, not as zero", async () => {
    const { client } = await connect({
      check_nooticr_credits: () => ({ balance: 5 }),
    });
    const res = await call(client);
    expect(res.structuredContent.balance).toBe(5);
    expect(res.structuredContent.connectedCount).toBeNull();
    expect(res.content[0].text).toContain("Connected accounts could not be read.");
  });

  it("sends a session with no account to nooticr_login, and nothing else", async () => {
    const { client } = await connect({}, { noClient: true });
    const res = await call(client);
    expect(res.structuredContent.signedIn).toBe(false);
    expect(res.structuredContent.nextSteps.map((s) => s.tool)).toEqual(["nooticr_login"]);
  });
});

describe("nextSteps", () => {
  it("puts a zero balance first and never names a purchase", () => {
    const steps = nextSteps({ signedIn: true, balance: 0, connectedCount: 0, watching: 0 });
    expect(steps[0].tool).toBe("check_nooticr_credits");
    expect(JSON.stringify(steps)).not.toMatch(/buy|checkout|http/i);
  });

  it("offers a catch-up priced per creator once the watchlist has any", () => {
    const steps = nextSteps({ signedIn: true, balance: 50, connectedCount: 0, watching: 3 });
    expect(steps.find((s) => s.tool === "catch_up_watchlist")?.credits).toBe(6);
    expect(steps.find((s) => s.tool === "watch_creator")).toBeUndefined();
  });

  it("names only tools that exist, with the argument names they take", async () => {
    const { client } = await connect({});
    const tools = new Map((await client.listTools()).tools.map((t) => [t.name, t]));
    const all = [
      ...nextSteps({ signedIn: true, balance: 0, connectedCount: 0, watching: 0 }),
      ...nextSteps({ signedIn: true, balance: 9, connectedCount: 2, watching: 2 }),
      ...nextSteps({ signedIn: false, balance: null, connectedCount: null, watching: null }),
    ];
    for (const s of all) {
      const t = tools.get(s.tool);
      expect(t, s.tool).toBeDefined();
      const props = Object.keys((t!.inputSchema as { properties?: Row }).properties ?? {});
      for (const k of Object.keys(s.example ?? {})) expect(props, `${s.tool}.${k}`).toContain(k);
    }
  });
});
