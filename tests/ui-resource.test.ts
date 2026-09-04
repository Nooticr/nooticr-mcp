import { describe, expect, it, vi, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import type { NooticrClient, McpProxyResult } from "../src/shared/nooticr.js";

// claude.ai gates the iframe on ui.domain == sha256("<endpoint>/mcp")[:32] +
// ".claudemcpcontent.com". Precomputed for https://mcp.nooticr.com/mcp.
const EXPECTED_DOMAIN = "ad85271428025d212d42271bf75531e2.claudemcpcontent.com";

// Each tool gets its own distinct app resource URI (ext-apps#558) so Claude
// renders a separated app/session per view instead of sharing one for all tools.
const RESOURCE_URI = "ui://nooticr/analyze_post";

afterEach(() => {
  vi.unstubAllEnvs();
});

function dummyClient(): NooticrClient {
  // resources/read and tools/list never touch makeClient, so this is unused.
  return { callTool: async () => ({ contentBlocks: [], structured: {} }) } as unknown as NooticrClient;
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
    vi.stubEnv("PUBLIC_URL", "https://mcp.nooticr.com");
    vi.stubEnv("NOOTICR_BASE_URL", "https://api.nooticr.com");
    const client = new Client({ name: "test", version: "1" });
    await connect(client);
    const res = await client.readResource({ uri: RESOURCE_URI });
    const contents = res.contents as Array<{
      uri: string;
      mimeType?: string;
      _meta?: { ui?: { domain?: string; prefersBorder?: boolean; csp?: { resourceDomains?: string[] } } };
    }>;
    // Exactly one. Claude rejects anything else outright — "Unsupported UI
    // resource content length: 2" — so this is a hard constraint of the host,
    // not a stylistic preference. A second entry for another host is not
    // additive; it breaks the view. Serve each host its own URI instead.
    expect(contents).toHaveLength(1);
    expect(contents[0].mimeType).toBe("text/html;profile=mcp-app");
    const ui = contents[0]._meta?.ui;
    expect(ui?.domain).toBe(EXPECTED_DOMAIN);
    expect(ui?.prefersBorder).toBe(false);
    expect(ui?.csp?.resourceDomains).toContain("https://api.nooticr.com");
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
    // "Nooticr Interactive View") so tools are distinguishable in a controller.
    const listed = await client.listResources();
    const names = (listed.resources ?? []).map((r) => r.name).filter(Boolean);
    expect(names.length).toBeGreaterThan(1);
    expect(new Set(names).size).toBe(names.length);
    expect(names[0]).not.toBe("Nooticr Interactive View");
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
    } as unknown as NooticrClient;
    const client = new Client({ name: "test", version: "1" });
    await connect(client, () => fake);
    const res = await client.callTool({ name: "check_nooticr_credits", arguments: {} });
    const content = res.content ?? [];
    const images = content.filter((c) => c.type === "image");
    expect(images).toHaveLength(0);
    const texts = content.filter((c) => c.type === "text");
    expect(texts).toHaveLength(1);
    expect(String(texts[0].text)).toContain("<div>card</div>");
    await client.close();
  });
});

describe("UI template validity", () => {
  it("template HTML contains valid JavaScript (no syntax errors)", async () => {
    const { NOOTICR_UI_TEMPLATE } = await import("../src/shared/ui-template.js");
    const scriptMatch = NOOTICR_UI_TEMPLATE.match(/<script>([\s\S]*?)<\/script>/);
    expect(scriptMatch).not.toBeNull();
    const script = scriptMatch![1];

    // Compile the script to catch any syntax errors — this is the exact
    // check that would have caught the template-literal escaping bugs
    // (// comment from broken regex, unescaped apostrophe, etc.)
    const vm = await import("node:vm");
    expect(() => vm.compileFunction(script, [], {})).not.toThrow();
  });

  it("template is valid HTML5 with required structure", async () => {
    const { NOOTICR_UI_TEMPLATE } = await import("../src/shared/ui-template.js");
    expect(NOOTICR_UI_TEMPLATE).toContain("<!DOCTYPE html>");
    expect(NOOTICR_UI_TEMPLATE).toContain("<html");
    expect(NOOTICR_UI_TEMPLATE).toContain("</html>");
    expect(NOOTICR_UI_TEMPLATE).toContain("<script>");
    expect(NOOTICR_UI_TEMPLATE).toContain("</script>");
    expect(NOOTICR_UI_TEMPLATE).toContain("<style>");
    expect(NOOTICR_UI_TEMPLATE).toContain("</style>");
    expect(NOOTICR_UI_TEMPLATE).toContain('id="app"');
    expect(NOOTICR_UI_TEMPLATE).toContain("ui/initialize");
    expect(NOOTICR_UI_TEMPLATE).toContain("ui/notifications/initialized");
  });

  it("template does not contain broken regex patterns (// at start of expression)", async () => {
    const { NOOTICR_UI_TEMPLATE } = await import("../src/shared/ui-template.js");
    const scriptMatch = NOOTICR_UI_TEMPLATE.match(/<script>([\s\S]*?)<\/script>/);
    const script = scriptMatch![1];
    // A broken regex like /ui:\/\/... becomes //ui:\/\/... which is a comment.
    // Check that no line starts with a bare // followed by a known keyword.
    const lines = script.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip actual comments (// followed by space or end)
      if (/^\/\/\s/.test(trimmed) || trimmed === "//") continue;
      // Flag lines that look like broken regex-turned-comment
      expect(trimmed).not.toMatch(/^\/\/[a-zA-Z]/);
    }
  });

  it("template has no unescaped apostrophes that break JS strings", async () => {
    const { NOOTICR_UI_TEMPLATE } = await import("../src/shared/ui-template.js");
    const scriptMatch = NOOTICR_UI_TEMPLATE.match(/<script>([\s\S]*?)<\/script>/);
    const script = scriptMatch![1];
    // Find single-quoted strings and check for unescaped apostrophes
    const singleQuoteStrings = script.match(/'[^'\\]*(?:\\.[^'\\]*)*'/g) ?? [];
    for (const s of singleQuoteStrings) {
      // Every ' in the string (except the delimiters) should be \'
      const inner = s.slice(1, -1);
      // Count unescaped single quotes inside
      const unescaped = inner.match(/(?<!\\)'/g);
      expect(unescaped).toBeNull();
    }
  });
});

// The template is embedded twice: in a Rust raw string (crates/mcp/src/ui.rs)
// where a backslash survives verbatim, and in this TS template literal where
// the same backslash is consumed. Any backslash therefore means the two hosts
// serve different JavaScript. A regex here carried \\s escapes for months and
// matched nothing in the Worker-served copy while working fine in Rust.
describe("dual-host template safety", () => {
  it("contains no backslashes at all", async () => {
    const { NOOTICR_UI_TEMPLATE } = await import("../src/shared/ui-template.js");
    const at: number[] = [];
    for (let i = 0; i < NOOTICR_UI_TEMPLATE.length; i++) {
      if (NOOTICR_UI_TEMPLATE[i] === "\\") at.push(i);
    }
    const context = at.slice(0, 3).map((i) => NOOTICR_UI_TEMPLATE.slice(i - 60, i + 30));
    expect(context).toEqual([]);
  });
});

// MCP Apps invokes tools with the core "tools/call" method. The template
// shipped a ui-prefixed name for months; no host answers it, so every in-view
// action button (Compare, and each AI action) silently fell through to its
// clipboard fallback and looked broken.
describe("host bridge methods", () => {
  it("invokes tools with tools/call and no ui-prefixed variant", async () => {
    const { NOOTICR_UI_TEMPLATE } = await import("../src/shared/ui-template.js");
    expect(NOOTICR_UI_TEMPLATE).toContain('send("tools/call"');
    expect(NOOTICR_UI_TEMPLATE).not.toContain("ui/tool-call");
  });
});

// ChatGPT would not render any of this: its Apps SDK finds the template only
// through _meta["openai/outputTemplate"], and expects text/html+skybridge on
// the resource. With neither, it reports "Failed to fetch template". The two
// hosts get two resources over the same HTML so that supporting one cannot
// change what the other is served.
describe("Apps SDK (ChatGPT) support", () => {
  it("gives every UI tool an outputTemplate as well as a Claude resourceUri", async () => {
    const client = new Client({ name: "test", version: "1" });
    await connect(client);
    const { tools } = await client.listTools();
    const withUi = tools.filter((t) => (t._meta as Record<string, unknown>)?.["ui/resourceUri"]);
    expect(withUi.length).toBeGreaterThan(15);
    for (const t of withUi) {
      const meta = t._meta as Record<string, unknown>;
      expect(meta["openai/outputTemplate"], `${t.name} has no outputTemplate`).toBeTruthy();
      // It must point at the skybridge twin, never at Claude's resource.
      expect(String(meta["openai/outputTemplate"]))
        .toBe(`${String(meta["ui/resourceUri"])}.html`);
    }
  });

  it("serves the ChatGPT twin as text/html+skybridge with a CSP", async () => {
    const client = new Client({ name: "test", version: "1" });
    await connect(client);
    const res = await client.readResource({ uri: `${RESOURCE_URI}.html` });
    const c = res.contents[0] as Record<string, unknown>;
    expect(c.mimeType).toBe("text/html+skybridge");
    expect(String(c.text)).toContain("<!DOCTYPE html>");
    const meta = c._meta as Record<string, Record<string, string[]>>;
    // Without the CSP the widget loads and then paints nothing.
    expect(meta["openai/widgetCSP"].resource_domains.join(" ")).toContain("tiktokcdn");
    expect(meta["openai/widgetCSP"].redirect_domains.join(" ")).toContain("tiktok.com");
  });

  // The whole point of two resources: Claude's is untouched.
  it("leaves Claude's resource on its own mime and metadata", async () => {
    const client = new Client({ name: "test", version: "1" });
    await connect(client);
    const res = await client.readResource({ uri: RESOURCE_URI });
    const c = res.contents[0] as Record<string, unknown>;
    expect(c.mimeType).toBe("text/html;profile=mcp-app");
    expect((c._meta as Record<string, unknown>).ui).toBeTruthy();
    expect((c._meta as Record<string, unknown>)["openai/widgetCSP"]).toBeUndefined();
  });

  it("lists both resources for each view", async () => {
    const client = new Client({ name: "test", version: "1" });
    await connect(client);
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);
    expect(uris).toContain(RESOURCE_URI);
    expect(uris).toContain(`${RESOURCE_URI}.html`);
  });
});

// A ChatGPT connector caches its template pointer when it is created and never
// refreshes it. Connectors made before per-tool URIs (0159155) still ask for
// ui://nooticr/view, which stopped existing — so ChatGPT's widget backend
// answered 404 and the app showed "Failed to fetch template". Claude re-reads
// ui/resourceUri from tools/list every time, which is why it never noticed.
describe("legacy ui://nooticr/view pointer", () => {
  // Resolving the pointer was not enough. A host handed the wrong mime does not
  // error — it renders the HTML and never attaches its bridge, so the view sits
  // on its idle placeholder with no window.openai and no postMessage, which
  // reads as a broken server with a clean console. Only a stale ChatGPT
  // connector asks for this URI (Claude re-reads ui/resourceUri every call and
  // always uses the per-tool one), so skybridge has to lead.
  // Only ChatGPT ever asks for this URI: Claude re-reads ui/resourceUri from
  // tools/list every call and so always uses the per-tool one. A host given the
  // wrong mime does not error, it just never attaches its bridge — so this has
  // to be skybridge. One entry, because Claude rejects more than one anywhere.
  it("serves the skybridge mime, since only ChatGPT asks for it", async () => {
    const client = new Client({ name: "test", version: "1" });
    await connect(client);
    const res = await client.readResource({ uri: "ui://nooticr/view" });
    expect(res.contents).toHaveLength(1);
    const only = res.contents[0] as Record<string, unknown>;
    expect(only.mimeType).toBe("text/html+skybridge");
    expect(String(only.text)).toContain("<!DOCTYPE html>");
    expect((only._meta as Record<string, unknown>)["openai/widgetCSP"]).toBeTruthy();
  });

  // The constraint that broke Claude, asserted for every view rather than one:
  // a read must return exactly one content entry.
  it("returns exactly one content entry for every registered view", async () => {
    const client = new Client({ name: "test", version: "1" });
    await connect(client);
    const { resources } = await client.listResources();
    for (const r of resources) {
      const res = await client.readResource({ uri: r.uri });
      expect(res.contents, `${r.uri} returned ${res.contents.length} entries`).toHaveLength(1);
    }
  });

  it("is listed, since ChatGPT resolves the pointer against the listing", async () => {
    const client = new Client({ name: "test", version: "1" });
    await connect(client);
    const uris = (await client.listResources()).resources.map((r) => r.uri);
    expect(uris).toContain("ui://nooticr/view");
    expect(uris).toContain("ui://nooticr/view.html");
  });

  it("serves the skybridge variant of the legacy pointer too", async () => {
    const client = new Client({ name: "test", version: "1" });
    await connect(client);
    const res = await client.readResource({ uri: "ui://nooticr/view.html" });
    const c = res.contents[0] as Record<string, unknown>;
    expect(c.mimeType).toBe("text/html+skybridge");
    expect((c._meta as Record<string, unknown>)["openai/widgetCSP"]).toBeTruthy();
  });
});

// The card prefers the raw platform URL over the proxied one, so this list is
// load-bearing: a host that enforces it blocks anything missing, and ChatGPT
// logged exactly that ("Loading media from <URL> violates ... media-src").
// Two entries were wrong rather than absent — *.tiktokcdn.com does not match
// tiktokcdn-us.com, and Instagram also serves from fbcdn.net. Claude reads the
// same list, so the gap was never ChatGPT-only.
describe("media CSP covers every platform we serve", () => {
  const MUST_COVER = [
    "p16-common-sign.tiktokcdn-us.com",   // TikTok photo mode
    "v16-webapp-prime.us.tiktok.com",     // TikTok video
    "instagram.frix7-1.fna.fbcdn.net",    // Instagram
    "scontent-lhr.cdninstagram.com",
    "rr3---sn-uqx2-2p0z.googlevideo.com", // YouTube stream
    "i.ytimg.com",
    "sns-video-v28.xhscdn.com",           // Xiaohongshu
    "v3-web.douyinvod.com",               // Douyin
    "i1.hdslb.com",                       // Bilibili image
    "upos-sz-mirrorcosov.bilivideo.com",  // Bilibili stream
    "upos-hz-mirrorakam.akamaized.net",   // Bilibili via Akamai
  ];

  const matches = (host: string, pattern: string) => {
    const p = pattern.replace(/^https:\/\//, "");
    return p.startsWith("*.")
      ? host === p.slice(2) || host.endsWith(`.${p.slice(2)}`)
      : host === p;
  };

  it("lists a pattern for every host a card can load media from", async () => {
    const client = new Client({ name: "test", version: "1" });
    await connect(client);
    const res = await client.readResource({ uri: RESOURCE_URI });
    const meta = res.contents[0]._meta as { ui: { csp: { resourceDomains: string[] } } };
    const patterns = meta.ui.csp.resourceDomains;
    const uncovered = MUST_COVER.filter((h) => !patterns.some((p) => matches(h, p)));
    expect(uncovered, `not covered by ${patterns.length} patterns`).toEqual([]);
  });

  it("gives ChatGPT the same coverage", async () => {
    const client = new Client({ name: "test", version: "1" });
    await connect(client);
    const res = await client.readResource({ uri: `${RESOURCE_URI}.html` });
    const meta = res.contents[0]._meta as Record<string, { resource_domains: string[] }>;
    const patterns = meta["openai/widgetCSP"].resource_domains;
    const uncovered = MUST_COVER.filter((h) => !patterns.some((p) => matches(h, p)));
    expect(uncovered).toEqual([]);
  });
});

// `_htmlCards` is the rendered card HTML. The text block already carries it as
// a prefix, so leaving it in the structured payload sent the same HTML twice to
// the model and a third time into the widget — measured at 40% of every
// payload, up to 65KB of a 160KB result — for a field neither template reads.
describe("structured content is not padded with rendered HTML", () => {
  const CARDS = "<div>".repeat(4000);
  const payload = {
    platform: "tiktok",
    posts: [{ id: "1", title: "t", externalUrl: "https://www.tiktok.com/@u/video/1" }],
    _htmlCards: CARDS,
  };

  async function callWith(structured: Record<string, unknown>) {
    const client = new Client({ name: "test", version: "1" });
    const server = createMcpServer(async () => ({
      callTool: async () => ({
        contentBlocks: [{ type: "text", text: `${CARDS}\n\n${JSON.stringify(structured)}` }],
        structured,
      }),
    }) as never);
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(a), server.connect(b)]);
    return client.callTool({ name: "discover_social_posts", arguments: { niche: "x" } });
  }

  it("drops _htmlCards from what the widget and model receive", async () => {
    const res = await callWith(payload) as {
      structuredContent: Record<string, unknown>;
      content: { type: string; text: string }[];
    };
    expect(res.structuredContent._htmlCards).toBeUndefined();
    // Still carries the data a view actually renders from.
    expect(res.structuredContent.posts).toBeTruthy();
    // The JSON appended after the HTML prefix must not repeat the HTML.
    const json = res.content[0].text.slice(res.content[0].text.indexOf("\n\n{"));
    expect(json).not.toContain("_htmlCards");
  });
});
