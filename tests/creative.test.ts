import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCreativeTools } from "../src/shared/creative.js";
import { OUTPUT_SCHEMAS } from "../src/shared/output-schemas.js";
import { BACKEND_ONLY_TOOLS } from "../src/shared/backend-only.js";

const READ_ONLY = ["creative_assets_list", "creative_brief_list", "creative_job_status", "creative_settings_get", "creative_voices_search"];
const FREE_WRITES = ["creative_brief_create", "creative_brief_update"];
const FREE = [...READ_ONLY, ...FREE_WRITES];
const PAID = ["creative_compose", "creative_image", "creative_image_edit", "creative_music", "creative_sfx", "creative_video", "creative_voiceover"];
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
    for (const t of tools) expect(t.annotations?.readOnlyHint, t.name).toBe(READ_ONLY.includes(t.name));
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
      creative_image: { appId: 3, prompt: "a red bicycle", size: "1088x1920", n: 2, transparent: true, confirm: true, confirmationToken: "tok" },
      creative_image_edit: { appId: 3, prompt: "add snow", imageAssetIds: ["33333333-3333-4333-8333-333333333333"], maskAssetId: "44444444-4444-4444-8444-444444444444", size: "1024x1024" },
      creative_video: { appId: 3, prompt: "waves at dusk", durationSeconds: 8, aspect: "16:9", referenceAssetIds: ["55555555-5555-4555-8555-555555555555"], audio: "none", briefId: "b", confirm: true, confirmationToken: "tok" },
      creative_compose: {
        appId: 3, aspect: "4:5", draft: true,
        segments: [{ assetId: "s1", start: 0, end: 4, motion: "zoom_in", overlayText: "Day 1" }, { assetId: "s2" }],
        voiceoverAssetId: "vo", captions: [{ text: "Hi", start: 0, end: 1 }], music: { source: "stock", query: "lofi" },
        sfx: [{ assetId: "fx", at: 4 }], safeZone: "reels", brandKit: true, endCard: { text: "Try it", seconds: 2 }, output: "video",
        briefId: "b", confirm: true, confirmationToken: "tok",
      },
      creative_settings_get: { appId: 3 },
      creative_brief_create: { appId: 3, brief: "Three 15 s clips", platforms: ["tiktok"], hook: "before/after", variants: 3, pick: "producer", budgetCredits: 200, slotAt: "2026-11-01T09:00:00Z", influencerId: 7 },
      creative_brief_list: { status: "awaiting_pick", appId: 3, limit: 20 },
      creative_brief_update: { briefId: "b1", status: "awaiting_pick", notes: "3 drafts", draftAssetIds: ["d1", "d2"], creditsSpent: 42 },
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
      ["creative_image", { appId: 3, prompt: "p", n: 5 }],
      ["creative_image", { appId: 3, prompt: "p", size: "512x512" }],
      ["creative_image", { prompt: "no app" }],
      ["creative_image_edit", { appId: 3, prompt: "p", imageAssetIds: [] }],
      ["creative_image_edit", { appId: 3, prompt: "p", imageAssetIds: ["a", "b", "c", "d", "e"] }],
      ["creative_image_edit", { appId: 3, prompt: "p" }],
      ["creative_video", { appId: 3, prompt: "p", durationSeconds: 31 }],
      ["creative_video", { appId: 3, prompt: "p", durationSeconds: 2 }],
      ["creative_video", { appId: 3, prompt: "p", aspect: "1:1" }],
      ["creative_video", { appId: 3, prompt: "x".repeat(2001) }],
      ["creative_video", { appId: 3, prompt: "p", referenceAssetIds: ["a", "b", "c", "d"] }],
      ["creative_video", { appId: 3, prompt: "p", audio: "music" }],
      ["creative_video", { prompt: "no app" }],
      ["creative_compose", { appId: 3, segments: [] }],
      ["creative_compose", { appId: 3, segments: Array.from({ length: 13 }, (_, i) => ({ assetId: `a${i}` })) }],
      ["creative_compose", { appId: 3, segments: [{ assetId: "a" }], aspect: "16:9" }],
      ["creative_compose", { appId: 3, segments: [{ assetId: "a" }], music: { source: "spotify", query: "x" } }],
      ["creative_compose", { appId: 3, segments: [{ assetId: "a" }], endCard: { text: "x".repeat(61) } }],
      ["creative_compose", { segments: [{ assetId: "a" }] }],
      ["creative_brief_create", { appId: 3, brief: "b" }],
      ["creative_brief_create", { appId: 3, brief: "b", platforms: ["tiktok"], variants: 5 }],
      ["creative_brief_create", { appId: 3, brief: "b", platforms: [] }],
      ["creative_brief_create", { appId: 3, brief: "b", platforms: Array.from({ length: 9 }, (_, i) => `p${i}`) }],
      ["creative_brief_update", { briefId: "b1", draftAssetIds: Array.from({ length: 13 }, (_, i) => `a${i}`) }],
      ["creative_brief_update", { briefId: "b1", actionIds: Array.from({ length: 13 }, (_, i) => `a${i}`) }],
      ["creative_brief_list", { status: "archived" }],
      ["creative_brief_list", { limit: 51 }],
      ["creative_brief_update", { status: "delivered" }],
      ["creative_brief_update", { briefId: "b1", status: "picked" }],
      ["creative_settings_get", { workspaceId: "w" }],
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

  it("accounts for every creative tool nooticr-server main serves: registered or backend-only with a reason", () => {
    // crates/server/src/creative/mod.rs CREATIVE_TOOLS on main, minus the cfg(test) creative_test_render.
    const served = [...NAMES, "creative_allowance_status"];
    for (const name of served) expect(NAMES.includes(name) || name in BACKEND_ONLY_TOOLS, name).toBe(true);
  });

  it("declares the keys the image producer sends, so a host can read them", () => {
    const quote = { quote: { credits: 5 }, confirmationToken: "t", expiresAt: "2026-01-01T00:00:00Z" };
    const result = { assets: [{ assetId: "a", url: "u", key: "k", width: 1024, height: 1536 }] };
    for (const name of ["creative_image", "creative_image_edit"] as const) {
      const shape = OUTPUT_SCHEMAS[name].shape;
      expect(Object.keys(shape), name).toEqual(expect.arrayContaining(Object.keys({ ...quote, ...result })));
      expect(OUTPUT_SCHEMAS[name].safeParse(quote).success, name).toBe(true);
      expect(OUTPUT_SCHEMAS[name].safeParse(result).success, name).toBe(true);
      expect(OUTPUT_SCHEMAS[name].safeParse({ assets: [{ id: 1 }] }).data, name).toEqual({ assets: [{ id: 1 }] });
    }
  });
});
