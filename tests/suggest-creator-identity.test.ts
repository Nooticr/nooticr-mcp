/**
 * suggest_creator_identity (#102): built, billed and evidence-mode in
 * nooticr-server, and until this reached no Claude or ChatGPT user.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { MemoryWatchStore } from "../src/shared/watchlist.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

type Row = Record<string, unknown>;

const BACKEND = {
  mode: "evidence",
  tool: "suggest_creator_identity",
  guidance: "1 account on instagram may be the same person as @lena on tiktok. Do not combine their follower counts into a total.",
  seed: { platform: "tiktok", handle: "lena", bioRead: true },
  searched: ["instagram"],
  candidatesConsidered: 4,
  suggestions: [
    {
      platform: "instagram", username: "lena", nickname: "Lena", profileUrl: "https://instagram.com/lena",
      followers: 1200, score: 75, confidence: "high",
      evidence: [{ signal: "shared_bio_link", strength: "strong", detail: "both bios link lena.example" }],
    },
  ],
  unavailable: [],
  merged: false,
  note: "Suggestions only.",
};

async function connect() {
  const calls: Array<{ name: string; args: Row }> = [];
  const nooticr = {
    me: async () => ({ id: "u1" }),
    callTool: async (name: string, args: Row) => {
      calls.push({ name, args });
      return { contentBlocks: [], structured: BACKEND };
    },
  } as unknown as NooticrClient;
  const client = new Client({ name: "test", version: "1.0.0" }, { capabilities: {} });
  const server = createMcpServer(async () => nooticr, { watchStore: new MemoryWatchStore() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  return { client, calls };
}

describe("suggest_creator_identity", () => {
  it("is registered, read-only, and says it never merges", async () => {
    const { client } = await connect();
    const tool = (await client.listTools()).tools.find((t) => t.name === "suggest_creator_identity");
    expect(tool).toBeDefined();
    expect(tool!.annotations?.readOnlyHint).toBe(true);
    expect(tool!.description).toMatch(/never merges/);
    expect(tool!.description).toMatch(/follower counts/);
    expect(tool!.description).toMatch(/2 nooticr credits per network/);
  });

  it("passes its arguments through untouched", async () => {
    const { client, calls } = await connect();
    await client.callTool({
      name: "suggest_creator_identity",
      arguments: { handle: "@lena", platform: "tiktok", platforms: ["instagram"] },
    });
    expect(calls).toEqual([
      { name: "suggest_creator_identity", args: { handle: "@lena", platform: "tiktok", platforms: ["instagram"] } },
    ]);
  });

  it("carries the backend's do-not-merge guidance in both channels", async () => {
    const { client } = await connect();
    const res = (await client.callTool({ name: "suggest_creator_identity", arguments: { handle: "lena" } })) as {
      content: Array<{ type: string; text: string }>;
      structuredContent: Row;
    };
    expect(res.content[0].text).toContain("Do not combine their follower counts");
    expect(res.content[0].text).toContain("shared_bio_link");
    expect(res.structuredContent.merged).toBe(false);
    expect(res.structuredContent.guidance).toContain("Do not combine");
  });

  it("gets its own view, not the creator card's /100 vetting score", async () => {
    const { NOOTICR_UI_TEMPLATE } = await import("../src/shared/ui-template.js");
    const dispatch = NOOTICR_UI_TEMPLATE.indexOf("if(Array.isArray(d.suggestions)&&d.seed)");
    const creators = NOOTICR_UI_TEMPLATE.indexOf("if(d.creators&&Array.isArray(d.creators))");
    expect(dispatch).toBeGreaterThan(-1);
    expect(dispatch).toBeLessThan(creators);
  });
});
