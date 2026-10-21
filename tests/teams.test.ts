/**
 * AI employee teams (nooticr-server TM7) on the public surface: the reads and
 * writes pass through, and the one thing the edge changes is the payment page,
 * which a host must never be handed (#100).
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { MemoryWatchStore } from "../src/shared/watchlist.js";
import { BACKEND_ONLY_TOOLS } from "../src/shared/backend-only.js";
import { FINISH_TEAM_ON_DASHBOARD } from "../src/shared/teams.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

async function connect(structured: unknown) {
  const calls: { name: string; args: unknown }[] = [];
  const nooticr = {
    callTool: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return {
        contentBlocks: [{ type: "text", text: "Pay here: https://checkout.stripe.com/c/pay/cs_live_x" }],
        structured,
      };
    },
  } as unknown as NooticrClient;
  const client = new Client({ name: "test", version: "1.0.0" });
  const server = createMcpServer(async () => nooticr, { watchStore: new MemoryWatchStore() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  return { client, calls };
}

const text = (res: { content: unknown }) => (res.content as Array<{ text: string }>).map((c) => c.text).join("\n");

describe("team tools", () => {
  it("registers the reads and writes, and keeps the two that charge a card on the backend", async () => {
    const { client } = await connect({});
    const names = (await client.listTools()).tools.map((t) => t.name);
    for (const n of ["list_teams", "get_team_status", "list_team_templates", "get_team_draft", "update_team_draft", "hire_team", "update_team_brief", "pause_team", "fire_team"]) {
      expect(names, n).toContain(n);
    }
    for (const n of ["add_team_member", "change_member_level"]) {
      expect(names, n).not.toContain(n);
      expect(BACKEND_ONLY_TOOLS[n], n).toMatch(/charges the workspace's card/);
    }
  });

  it("forwards a team read with its arguments and puts the payload in the text", async () => {
    const team = { id: "t-1", name: "Growth", status: "active", templateSlug: "grow-store", members: [] };
    const { client, calls } = await connect(team);
    const res = await client.callTool({ name: "get_team_status", arguments: { teamId: "t-1" } });
    expect(calls).toEqual([{ name: "get_team_status", args: { teamId: "t-1" } }]);
    expect(res.structuredContent).toEqual(team);
    expect(text(res)).toContain('"name":"Growth"');
  });

  it("drops the payment page from a confirmed launch and says where the hire is finished", async () => {
    const { client } = await connect({
      team: { id: "t-1", name: "Growth", status: "awaiting_payment" },
      replayed: false,
      checkout: { url: "https://checkout.stripe.com/c/pay/cs_live_x", expiresAt: "2026-10-22T00:00:00Z" },
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_live_x",
      instructions: "Give the user this payment link.",
      launchId: "l-1",
    });
    const res = await client.callTool({
      name: "hire_team",
      arguments: { fromDraft: true, confirm: true, confirmationToken: "tok" },
    });
    const sc = res.structuredContent as Record<string, unknown>;
    expect(sc).not.toHaveProperty("checkout");
    expect(sc).not.toHaveProperty("checkoutUrl");
    expect(sc.instructions).toBe(FINISH_TEAM_ON_DASHBOARD);
    expect(JSON.stringify(res)).not.toMatch(/checkout\.stripe\.com|payment link/);
    expect((sc.team as { id: string }).id).toBe("t-1");
  });

  it("keeps a quote whole but stops it promising a payment page the edge drops", async () => {
    const { client } = await connect({
      created: false,
      requiresConfirmation: true,
      confirmationToken: "tok",
      quote: { totalLabel: "$1,098 a month", members: [{ roleKey: "lead", priceLabel: "$549 a month" }] },
      instructions: "... The next step is a secure payment page; the team starts only after payment is confirmed.",
    });
    const res = await client.callTool({ name: "hire_team", arguments: { template: "grow-store" } });
    const sc = res.structuredContent as Record<string, unknown>;
    expect(sc.confirmationToken).toBe("tok");
    expect((sc.quote as { totalLabel: string }).totalLabel).toBe("$1,098 a month");
    expect(String(sc.instructions)).not.toMatch(/payment page;/);
    expect(String(sc.instructions)).toMatch(/Teams page of their Nooticr dashboard/);
    expect(text(res)).toContain("$1,098 a month");
  });
});

describe("a team refusal", () => {
  it("never carries the payment page the server names for its own chat", async () => {
    const { NooticrError } = await import("../src/shared/nooticr.js");
    const nooticr = {
      callTool: async () => {
        throw new NooticrError(400, "finish payment first, or cancel this launch. The payment page: https://checkout.stripe.com/c/pay/cs_x", {
          code: "-32602",
          body: { code: "team_unpaid" },
        });
      },
    } as unknown as NooticrClient;
    const client = new Client({ name: "test", version: "1.0.0" });
    const server = createMcpServer(async () => nooticr, { watchStore: new MemoryWatchStore() });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(a), server.connect(b)]);
    const res = await client.callTool({ name: "pause_team", arguments: { teamId: "t-1", resume: true } });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res)).not.toMatch(/stripe|https:/);
    expect(text(res)).toMatch(/finish payment first.*Teams page of their Nooticr dashboard/);
    expect(text(res)).toContain("Refusal code: team_unpaid.");
  });
});
