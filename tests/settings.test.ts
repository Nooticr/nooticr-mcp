import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { MemorySettingsStore } from "../src/shared/settings.js";
import { MemoryWatchStore } from "../src/shared/watchlist.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

async function connect() {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const backend = {
    me: async () => ({ id: "account-1" }),
    callTool: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return { contentBlocks: [], structured: { platform: args.platform, posts: [], mcpCredits: { cost: 2 } } };
    },
  } as unknown as NooticrClient;
  const settingsStore = new MemorySettingsStore();
  const client = new Client({ name: "settings-test", version: "1.0.0" }, { capabilities: {} });
  const server = createMcpServer(async () => backend, {
    settingsStore,
    watchStore: new MemoryWatchStore(),
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client, calls };
}

describe("ChatGPT structured plugin settings", () => {
  it("advertises read/update tools and returns controls with effective defaults", async () => {
    const { client } = await connect();
    expect(client.getServerCapabilities()?.extensions).toMatchObject({
      "openai/settings": {
        readTool: "nooticr_settings_read",
        updateTool: "nooticr_settings_update",
      },
    });
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toContain("nooticr_settings_read");
    expect(tools.map((tool) => tool.name)).toContain("nooticr_settings_update");

    const result = await client.callTool({ name: "nooticr_settings_read", arguments: {} });
    expect(result.structuredContent).toMatchObject({
      values: { defaultSocialPlatform: "tiktok", defaultResultCount: 6 },
      schema: { properties: { defaultSocialPlatform: { type: "string" }, defaultResultCount: { type: "integer" } } },
    });
  });

  it("persists preference changes and applies them only to omitted search arguments", async () => {
    const { client, calls } = await connect();
    await client.callTool({
      name: "nooticr_settings_update",
      arguments: { set: { defaultSocialPlatform: "reddit", defaultResultCount: 9 } },
    });

    await client.callTool({ name: "discover_social_posts", arguments: { niche: "home fitness" } });
    await client.callTool({
      name: "discover_social_posts",
      arguments: { niche: "home fitness", platform: "youtube", limit: 4 },
    });

    expect(calls.map(({ args }) => args)).toEqual([
      { niche: "home fitness", platform: "reddit", limit: 9 },
      { niche: "home fitness", platform: "youtube", limit: 4 },
    ]);
  });
});
