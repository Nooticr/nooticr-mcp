import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCreativeTools } from "../src/shared/creative.js";
import { BACKEND_ONLY_TOOLS } from "../src/shared/backend-only.js";

const FREE = ["creative_assets_list", "creative_job_status", "creative_voices_search"];
const PAID = ["creative_music", "creative_sfx", "creative_voiceover"];
const NAMES = [...FREE, ...PAID].sort();

async function connect() {
  const calls: { name: string; args: unknown }[] = [];
  const stub = {
    callTool: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { contentBlocks: [{ type: "text", text: "ok" }], structured: { assets: [], nextCursor: null } };
    },
  };
  const server = new McpServer({ name: "t", version: "0" });
  registerCreativeTools(server, (() => stub) as never);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "c", version: "0" });
  await Promise.all([client.connect(a), server.connect(b)]);
  return { client, calls };
}

describe("creative tools", () => {
  it("registers the free and paid server tools and never the test-only one", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(NAMES);
    expect(tools.map((t) => t.name)).not.toContain("creative_test_render");
    for (const t of tools) expect(t.annotations?.readOnlyHint, t.name).toBe(FREE.includes(t.name));
    for (const t of tools.filter((t) => PAID.includes(t.name))) {
      expect(t.annotations?.destructiveHint, t.name).toBe(false);
      expect(t.description, t.name).toMatch(/confirm: true/);
      expect(t.description, `${t.name} promises no fixed price`).not.toMatch(/\d+ (nooticr )?credits?\b/i);
    }
  });

  it("forwards each call to the backend tool of the same name with its arguments", async () => {
    const { client, calls } = await connect();
    const args: Record<string, Record<string, unknown>> = {
      creative_assets_list: { appId: 3, kind: "image", briefId: "11111111-1111-4111-8111-111111111111", since: "2026-01-01T00:00:00Z", limit: 10, cursor: "c" },
      creative_job_status: { jobId: "22222222-2222-4222-8222-222222222222" },
      creative_voices_search: { query: "warm", language: "en", gender: "female", useCase: "advertisement", limit: 5 },
      creative_voiceover: { appId: 3, text: "Hello", voiceRef: { publicOwnerId: "o", voiceId: "v" }, quality: "draft", speed: 1, confirm: true, confirmationToken: "tok" },
      creative_sfx: { appId: 3, description: "whoosh", durationSeconds: 2 },
      creative_music: { appId: 3, prompt: "calm piano", durationSeconds: 30, confirm: true, confirmationToken: "tok" },
    };
    for (const name of NAMES) {
      const res = await client.callTool({ name, arguments: args[name] });
      expect(res.isError, name).toBeFalsy();
    }
    expect(calls).toEqual(NAMES.map((name) => ({ name, args: args[name] })));
  });

  it("rejects an unknown kind, a missing jobId and unknown arguments before calling the server", async () => {
    const { client, calls } = await connect();
    for (const [name, arguments_] of [
      ["creative_assets_list", { kind: "gif" }],
      ["creative_assets_list", { bogus: 1 }],
      ["creative_job_status", {}],
      ["creative_voiceover", { appId: 3, text: "x".repeat(2501) }],
      ["creative_voiceover", { text: "no app" }],
      ["creative_sfx", { appId: 3, description: "x", durationSeconds: 11 }],
      ["creative_music", { appId: 3, prompt: "p", durationSeconds: 4 }],
      ["creative_voices_search", { gender: "robot" }],
    ] as const) {
      const res = await client.callTool({ name, arguments: arguments_ });
      expect(res.isError, name).toBe(true);
    }
    expect(calls).toEqual([]);
  });

  it("reports a server refusal as a tool error naming the tool, without retrying", async () => {
    const calls: string[] = [];
    const stub = {
      callTool: async (name: string) => {
        calls.push(name);
        throw new Error("creative cap reached");
      },
    };
    const server = new McpServer({ name: "t", version: "0" });
    registerCreativeTools(server, (() => stub) as never);
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "c", version: "0" });
    await Promise.all([client.connect(a), server.connect(b)]);
    const res = await client.callTool({ name: "creative_sfx", arguments: { appId: 1, description: "pop" } });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toContain("creative_sfx failed: creative cap reached");
    expect(calls).toEqual(["creative_sfx"]);
  });

  it("is not also listed as backend-only", () => {
    for (const name of NAMES) expect(BACKEND_ONLY_TOOLS).not.toHaveProperty(name);
  });
});
