/**
 * #262 renamed five tools. A host that cached the old list, or a saved prompt
 * that names one, must still reach the same tool for a release; a host listing
 * the tools must only ever be offered the new names. Both halves rest on how
 * SDK 1.30 builds its list and dispatches a call, so this is the test that
 * fails if an SDK upgrade changes either.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer, RETIRED_TOOL_NAMES } from "../src/shared/tools.js";
import { MemoryWatchStore } from "../src/shared/watchlist.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

const POST = { platform: "tiktok", externalUrl: "https://www.tiktok.com/@lena/video/123", caption: "Pour-over", views: 48200 };

async function connect() {
  const backend: string[] = [];
  const nooticr = {
    me: async () => ({ id: "u1" }),
    callTool: async (name: string) => {
      backend.push(name);
      return { contentBlocks: [], structured: name === "get_social_media" ? POST : {} };
    },
  } as unknown as NooticrClient;
  const client = new Client({ name: "t", version: "1" }, { capabilities: {} });
  const server = createMcpServer(async () => nooticr, { watchStore: new MemoryWatchStore() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  return { client, backend };
}

describe("retired tool names (#262)", () => {
  it("lists every replacement and none of the retired names", async () => {
    const { client } = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name);
    for (const [retired, current] of Object.entries(RETIRED_TOOL_NAMES)) {
      expect(names, `${current} is listed`).toContain(current);
      expect(names, `${retired} is not listed`).not.toContain(retired);
    }
  });

  it("still calls the replacement's handler under a retired name", async () => {
    const { client, backend } = await connect();
    const url = POST.externalUrl;
    const now = await client.callTool({ name: "get_social_post", arguments: { url } });
    const then = await client.callTool({ name: "get_social_media", arguments: { url } });
    expect(then.isError).toBeFalsy();
    expect(then.structuredContent).toEqual(now.structuredContent);
    // The backend's own tool keeps its name: only the public name moved.
    expect(backend).toEqual(["get_social_media", "get_social_media"]);
  });
});
