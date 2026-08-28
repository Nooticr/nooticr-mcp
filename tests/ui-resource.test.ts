import { describe, expect, it, vi, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import type { OrchynClient, McpProxyResult } from "../src/shared/orchyn.js";

// claude.ai gates the iframe on ui.domain == sha256("<endpoint>/mcp")[:32] +
// ".claudemcpcontent.com". Precomputed for https://mcp.orchyn.com/mcp.
const EXPECTED_DOMAIN = "4f32726b407d5d9929c7eff16b781080.claudemcpcontent.com";

afterEach(() => {
  vi.unstubAllEnvs();
});

function dummyClient(): OrchynClient {
  // resources/read and tools/list never touch makeClient, so this is unused.
  return { callTool: async () => ({ contentBlocks: [], structured: {} }) } as unknown as OrchynClient;
}

async function connect(client: Client, makeClient = dummyClient) {
  const server = createMcpServer(async () => makeClient());
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientSide), server.connect(serverSide)]);
  return server;
}

describe("MCP Apps resource metadata", () => {
  it("advertises the UI extension capability", async () => {
    const client = new Client({ name: "test", version: "1" });
    await connect(client);
    const init = await client.getServerCapabilities();
    const ext = (init as Record<string, unknown>).extensions as Record<string, unknown>;
    expect(Object.keys(ext ?? {})).toContain("io.modelcontextprotocol/ui");
    await client.close();
  });

  it("serves the UI resource with the Claude domain, CSP and prefersBorder", async () => {
    vi.stubEnv("PUBLIC_URL", "https://mcp.orchyn.com");
    vi.stubEnv("ORCHYN_BASE_URL", "https://api.orchyn.com");
    const client = new Client({ name: "test", version: "1" });
    await connect(client);
    const res = await client.readResource({ uri: "ui://orchyn/view" });
    const contents = res.contents as Array<{
      uri: string;
      mimeType?: string;
      _meta?: { ui?: { domain?: string; prefersBorder?: boolean; csp?: { resourceDomains?: string[] } } };
    }>;
    expect(contents).toHaveLength(1);
    const ui = contents[0]._meta?.ui;
    expect(ui?.domain).toBe(EXPECTED_DOMAIN);
    expect(ui?.prefersBorder).toBe(false);
    expect(ui?.csp?.resourceDomains).toContain("https://api.orchyn.com");
    await client.close();
  });

  it("omits domain when no public URL is set (stdio)", async () => {
    vi.stubEnv("PUBLIC_URL", "");
    const client = new Client({ name: "test", version: "1" });
    await connect(client);
    const res = await client.readResource({ uri: "ui://orchyn/view" });
    const contents = res.contents as Array<{ _meta?: { ui?: { domain?: string } } }>;
    expect(contents[0]._meta?.ui?.domain).toBeUndefined();
    await client.close();
  });

  it("declares the widget with both ui.resourceUri and flat ui/resourceUri", async () => {
    const client = new Client({ name: "test", version: "1" });
    await connect(client);
    const res = await client.listTools();
    const meta = (res.tools[0] as unknown as { _meta?: Record<string, unknown> })._meta ?? {};
    expect(meta.ui).toEqual({ resourceUri: "ui://orchyn/view" });
    expect(meta["ui/resourceUri"]).toBe("ui://orchyn/view");
    await client.close();
  });
});

describe("empty image filtering", () => {
  it("drops image content blocks whose base64 fetch failed", async () => {
    const fake = {
      async callTool(_name: string): Promise<McpProxyResult> {
        return {
          contentBlocks: [
            // Unreachable address → fetchAsBase64Image returns empty data.
            { type: "image", url: "http://127.0.0.1:1/nope.jpg", mimeType: "image/jpeg" },
            { type: "text", text: "{\"ok\":true}" },
          ],
          structured: { ok: true },
        };
      },
    } as unknown as OrchynClient;
    const client = new Client({ name: "test", version: "1" });
    await connect(client, () => fake);
    const res = await client.callTool({ name: "check_orchyn_credits", arguments: {} });
    const content = res.content ?? [];
    const images = content.filter((c) => c.type === "image");
    expect(images).toHaveLength(0);
    const texts = content.filter((c) => c.type === "text");
    expect(texts.length).toBeGreaterThan(0);
    await client.close();
  });
});
