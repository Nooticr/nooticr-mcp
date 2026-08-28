import { describe, expect, it, vi, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import type { OrchynClient, McpProxyResult } from "../src/shared/orchyn.js";

// claude.ai gates the iframe on ui.domain == sha256("<endpoint>/mcp")[:32] +
// ".claudemcpcontent.com". Precomputed for https://mcp.orchyn.com/mcp.
const EXPECTED_DOMAIN = "4f32726b407d5d9929c7eff16b781080.claudemcpcontent.com";

// Each tool gets its own distinct app resource URI (ext-apps#558) so Claude
// renders a separated app/session per view instead of sharing one for all tools.
const RESOURCE_URI = "ui://orchyn/analyze_post";

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
    const res = await client.readResource({ uri: RESOURCE_URI });
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
    const res = await client.readResource({ uri: RESOURCE_URI });
    const contents = res.contents as Array<{ _meta?: { ui?: { domain?: string } } }>;
    expect(contents[0]._meta?.ui?.domain).toBeUndefined();
    await client.close();
  });

  it("declares the widget with both ui.resourceUri and flat ui/resourceUri", async () => {
    const client = new Client({ name: "test", version: "1" });
    await connect(client);
    const res = await client.listTools();
    const meta = (res.tools[0] as unknown as { _meta?: Record<string, unknown> })._meta ?? {};
    expect(meta.ui).toEqual({ resourceUri: RESOURCE_URI });
    expect(meta["ui/resourceUri"]).toBe(RESOURCE_URI);
    await client.close();
  });

  it("gives each tool a distinct app resource URI and serves them all", async () => {
    const client = new Client({ name: "test", version: "1" });
    await connect(client);
    const res = await client.listTools();
    const uris = (res.tools as Array<{ _meta?: Record<string, unknown> }>)
      .map((t) => (t._meta?.ui as { resourceUri?: string })?.resourceUri)
      .filter(Boolean);
    // Every tool declares a UI resource, and no two share the same URI — a
    // shared single app/session is what makes Claude keep the wrong view in
    // the loading state (ext-apps#558: hosts key app state by resourceUri).
    expect(uris.length).toBeGreaterThan(1);
    expect(new Set(uris).size).toBe(uris.length);
    // Each resource also exposes a distinct human-readable name (not all
    // "Orchyn Interactive View") so tools are distinguishable in a controller.
    const listed = await client.listResources();
    const names = (listed.resources ?? []).map((r) => r.name).filter(Boolean);
    expect(names.length).toBeGreaterThan(1);
    expect(new Set(names).size).toBe(names.length);
    expect(names[0]).not.toBe("Orchyn Interactive View");
    // Each distinct URI is actually readable as an MCP Apps HTML resource.
    for (const uri of uris.slice(0, 2)) {
      const r = await client.readResource({ uri: uri as string });
      const contents = r.contents as Array<{ mimeType?: string; text?: string }>;
      expect(contents[0].mimeType).toContain("text/html");
      expect(String(contents[0].text ?? "")).toContain("<html");
    }
    await client.close();
  });
});

describe("app-view tool results", () => {
  it("never emits raw image blocks (HTML card carries the media)", async () => {
    const fake = {
      async callTool(_name: string): Promise<McpProxyResult> {
        return {
          // A real backend emits image blocks + a text block with the HTML card.
          // Claude's Apps bridge rejects raw image blocks mixed with an app
          // view ("could not be processed: Error processing image" + blank
          // iframe), so we must strip them and keep only the text block.
          contentBlocks: [
            { type: "image", url: "https://img.example/thumb.jpg", mimeType: "image/jpeg" },
            { type: "image", data: "aGVsbG8=", mimeType: "image/jpeg" },
            { type: "text", text: "<div>card</div>\n\n{\"ok\":true}" },
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
    expect(texts).toHaveLength(1);
    expect(String(texts[0].text)).toContain("<div>card</div>");
    await client.close();
  });
});
