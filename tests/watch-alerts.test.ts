/**
 * set_brand_watch_alerts (#103): a watch's email and Slack alert switches,
 * through the dashboard's own PATCH /ai/watches/{id}. It never carries an
 * address or a URL; the server holds the destinations.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { MemoryWatchStore } from "../src/shared/watchlist.js";
import { NooticrClient } from "../src/shared/nooticr.js";

const BASE = "http://localhost:8080";
const sent: Array<{ method: string; path: string; body: unknown; auth: string | null }> = [];

function stub(answer: (body: Record<string, unknown>) => Response) {
  sent.length = 0;
  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    sent.push({ method: String(init?.method), path: new URL(String(input)).pathname, body, auth: headers.authorization ?? null });
    return answer(body ?? {});
  });
}

async function call(args: Record<string, unknown>) {
  const nooticr = new NooticrClient(BASE, { getAccessToken: async () => "jwt" });
  const client = new Client({ name: "test", version: "1.0.0" }, { capabilities: {} });
  const server = createMcpServer(async () => nooticr, { watchStore: new MemoryWatchStore() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  const res = await client.callTool({ name: "set_brand_watch_alerts", arguments: args });
  const text = (res.content as Array<{ text?: string }>).map((c) => c.text ?? "").join("\n");
  return { res, text };
}

const watchAnswer = (alerts: Record<string, unknown>) =>
  new Response(JSON.stringify({ ok: true, watch: { id: "w-1", term: "acme", enabled: true, alerts } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

afterEach(() => vi.unstubAllGlobals());

describe("set_brand_watch_alerts", () => {
  it("PATCHes only the switches it was given, under the caller's token", async () => {
    stub(() => watchAnswer({ minNew: 3, email: false, slack: true }));
    const { res, text } = await call({ watchId: "w-1", slack: true, email: false, minNew: 3 });
    expect(res.isError).toBeFalsy();
    expect(sent).toEqual([
      { method: "PATCH", path: "/ai/watches/w-1", body: { alertMinNew: 3, alertEmail: false, alertSlack: true }, auth: "Bearer jwt" },
    ]);
    // The same sentence in both channels (#44, #51).
    expect(text).toContain('The watch on "acme" now alerts by Slack when a run finds at least 3 new items');
    const sc = res.structuredContent as Record<string, unknown>;
    expect(sc.guidance).toBe(text);
    expect(sc.alerts).toEqual({ minNew: 3, email: false, slack: true });
  });

  it("leaves out what it was not given", async () => {
    stub(() => watchAnswer({ minNew: 1, email: true, slack: false }));
    await call({ watchId: "w-1", slack: false });
    expect(sent[0].body).toEqual({ alertSlack: false });
  });

  it("says so when no alert is left, and that the thread still gets every run", async () => {
    stub(() => watchAnswer({ minNew: 1, email: false, slack: false }));
    const { text } = await call({ watchId: "w-1", email: false });
    expect(text).toMatch(/now alerts nobody by email or Slack/);
    expect(text).toMatch(/thread/);
  });

  it("carries the server's refusal when Slack is not connected", async () => {
    stub(() => new Response("Slack is not connected to this workspace — connect it in Settings first", { status: 400 }));
    const { res, text } = await call({ watchId: "w-1", slack: true });
    expect(res.isError).toBe(true);
    expect(text).toContain("Slack is not connected to this workspace");
  });

  it("refuses an empty change, a destination and a threshold out of range before calling the server", async () => {
    stub(() => watchAnswer({}));
    for (const args of [
      { watchId: "w-1" },
      { watchId: "w-1", slack: true, webhookUrl: "https://hooks.example/x" },
      { watchId: "w-1", deliverTo: "someone@example.com" },
      { watchId: "w-1", minNew: 0 },
      { watchId: "w-1", minNew: 1001 },
    ]) {
      const { res } = await call(args);
      expect(res.isError, JSON.stringify(args)).toBe(true);
    }
    expect(sent).toEqual([]);
  });
});
