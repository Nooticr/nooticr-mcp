/**
 * A failed tool call tells the host what the server said (#257).
 *
 * The founder saw "AI service not configured or request failed" for a
 * truncated output budget: one sentence for a missing key, a timeout and a
 * model that stopped early, so the cause could not be seen from the host. The
 * server now writes the real reason (and strips supplier names and keys from
 * it, nooticr-server#923), so the worker's job is only to carry it through,
 * whatever shape it arrives in, and to keep a generic sentence for the one case
 * with nothing to carry: no response at all.
 */
import { readdirSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { MemoryWatchStore } from "../src/shared/watchlist.js";
import { NooticrClient, UNREACHABLE } from "../src/shared/nooticr.js";

const BASE = "http://localhost:8080";
const REASON = "analysis stopped early: the model ran out of output budget before the answer was complete";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Route `/mcp` to the given answer; everything else answers an empty 200. */
function stubMcp(answer: () => Promise<Response>) {
  vi.stubGlobal("fetch", (input: string | URL) =>
    new URL(String(input)).pathname === "/mcp" ? answer() : Promise.resolve(json(200, {})),
  );
}

async function callTool(name: string, args: Record<string, unknown>) {
  const nooticr = new NooticrClient(BASE, { getAccessToken: async () => "jwt" });
  const client = new Client({ name: "test", version: "1.0.0" }, { capabilities: {} });
  const server = createMcpServer(async () => nooticr, { watchStore: new MemoryWatchStore() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  const res = await client.callTool({ name, arguments: args });
  return { isError: res.isError, text: (res.content as Array<{ text?: string }>).map((c) => c.text ?? "").join("\n") };
}

const call = () => callTool("get_social_post", { url: "https://example.com/p/1" });

afterEach(() => vi.unstubAllGlobals());

describe("a server error reaches the tool result unchanged", () => {
  it.each([
    ["a JSON-RPC error", () => json(200, { jsonrpc: "2.0", id: 1, error: { code: -32603, message: REASON } })],
    ["an isError tool result", () => json(200, { jsonrpc: "2.0", id: 1, result: { isError: true, content: [{ type: "text", text: REASON }] } })],
    ["a JSON-RPC error behind a 500", () => json(500, { jsonrpc: "2.0", id: 1, error: { code: -32603, message: REASON } })],
    ["{message} behind a 503", () => json(503, { message: REASON })],
    ["{error} behind a 504", () => json(504, { error: REASON })],
  ])("%s", async (_label, answer) => {
    stubMcp(async () => answer());
    const res = await call();
    expect(res.isError).toBe(true);
    expect(res.text).toContain(REASON);
    expect(res.text).not.toMatch(/not configured/i);
  });
});

describe("a network failure", () => {
  it("still gets the fallback, and the fallback never claims a configuration problem", async () => {
    stubMcp(() => Promise.reject(new TypeError("fetch failed")));
    const res = await call();
    expect(res.isError).toBe(true);
    expect(res.text).toContain(UNREACHABLE);
    expect(UNREACHABLE).not.toMatch(/configur/i);
  });
});

describe("no error path hard-codes a configuration failure", () => {
  // "not configured" is only true of a setting someone has to make; written
  // into a catch-all it turns every other failure into a deployment problem.
  // A literal is allowed only where the branch has just checked that the
  // setting is absent.
  const ALLOWED: Record<string, string> = {
    // Answers the ChatGPT verification probe when OPENAI_APPS_VERIFICATION_TOKEN
    // is empty: the one branch here where it is literally true.
    "cloudflare/src/index.ts": 'token ? textResponse(200, token) : textResponse(404, "not configured")',
  };

  it("names no failure 'not configured' outside a branch that checked the setting", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (entry.name !== "node_modules") walk(path);
          continue;
        }
        if (!/\.(ts|mjs|js)$/.test(entry.name) || path.endsWith("ui-template.ts")) continue;
        readFileSync(path, "utf8").split("\n").forEach((line, i) => {
          if (!/["'`][^"'`]*not configured/i.test(line)) return;
          const guard = ALLOWED[path];
          if (guard && line.includes(guard)) return;
          offenders.push(`${path}:${i + 1}: ${line.trim()}`);
        });
      }
    };
    walk("src");
    walk("cloudflare/src");
    expect(offenders).toEqual([]);
  });
});
