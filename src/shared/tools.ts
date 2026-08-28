/**
 * The orchyn MCP tool surface, registered once and shared by the Node
 * package (stdio/HTTP) and the Cloudflare Worker. Both runtimes supply a
 * `makeClient` factory that resolves the caller's orchyn identity (credential
 * file for the CLI, KV session for the worker) — the tool bodies, schemas and
 * result formatting live here and nowhere else.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";
import { OrchynClient, OrchynError, type McpProxyResult } from "./orchyn.js";
import { formatPaywallError, runVideoAnalysis, validatePostUrl } from "./video.js";
import { ORCHYN_UI_TEMPLATE } from "./ui-template.js";

/** Current MCP server version — bumped on every deploy for traceability. */
export const MCP_SERVER_VERSION = "1.12.3";

/** MCP Apps extension identifier */
const UI_EXTENSION = "io.modelcontextprotocol/ui";
/** MIME type for MCP Apps HTML resources */
const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";
/** Single UI resource URI shared by all tools */
const UI_RESOURCE_URI = "ui://orchyn/view";

type ToolContent =
 | { type: "text"; text: string }
 | { type: "image"; data: string; mimeType: string };

/** Convert an arbitrary http(s) URL to a base64 MCP `image` data block. */
async function fetchAsBase64Image(url: string, mimeType: string): Promise<ToolContent> {
 try {
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) return { type: "image" as const, data: "", mimeType };
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
   bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return { type: "image" as const, data: btoa(bin), mimeType };
 } catch {
  return { type: "image" as const, data: "", mimeType };
 }
}

export interface MakeClientContext {
 authInfo?: AuthInfo;
}

/**
 * Rewrite external image URLs to go through the orchyn proxy so they
 * work inside ChatGPT's sandboxed iframe (CORS + CSP restrictions).
 */
function proxyImageUrl(url: string): string {
 if (!url || url.startsWith("data:")) return url;
 try {
  const u = new URL(url);
  // Only proxy external HTTP(S) URLs — skip our own proxy and data URIs
  if (u.protocol === "http:" || u.protocol === "https:") {
   const serverUrl = process.env.ORCHYN_API_URL || process.env.ORCHYN_BASE_URL || "";
   if (serverUrl && !url.startsWith(serverUrl)) {
    return `${serverUrl.replace(/\/+$/, "")}/media/proxy?url=${encodeURIComponent(url)}`;
   }
  }
 } catch {}
 return url;
}

/** Recursively rewrite URL fields in a structured object for the proxy. */
function proxyUrls(obj: unknown): unknown {
 if (typeof obj === "string") {
  // Check if it looks like a URL
  if (/^https?:\/\//.test(obj) && !obj.includes("/media/proxy")) {
   return proxyImageUrl(obj);
  }
  return obj;
 }
 if (Array.isArray(obj)) return obj.map(proxyUrls);
 if (obj && typeof obj === "object") {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
   if (["thumbnailUrl", "preview_url", "coverUrl", "avatarUrl", "avatar_thumb", "image_url", "url"].includes(k) && typeof v === "string") {
    out[k] = proxyImageUrl(v);
   } else {
    out[k] = proxyUrls(v);
   }
  }
  return out;
 }
 return obj;
}

async function toToolResult(proxy: McpProxyResult): Promise<{ content: ToolContent[]; structuredContent?: Record<string, unknown> }> {
 // The MCP SDK's ImageContent only accepts `data` (base64). The orchyn
 // backend now emits `url` image blocks pointing at permanent, re-hosted
 // JPEG thumbnails (HEIC already transcoded), so convert those URLs to
 // base64 data here — guaranteeing clients render a valid image.
 const imgBlocks = proxy.contentBlocks.filter((c) => c.type === "image");
 const images = await Promise.all(
  imgBlocks.map((c) =>
   c.url
    ? fetchAsBase64Image(String(c.url), String(c.mimeType ?? "image/jpeg"))
    : Promise.resolve({ type: "image" as const, data: String(c.data ?? ""), mimeType: String(c.mimeType ?? "image/jpeg") })
  )
 );
 // The Rust backend embeds HTML cards directly in the text block
 // (type:"text", text:"<div>...</div>\n\n{json}"). We extract the HTML
 // prefix from the first text contentBlock and prepend it.
 const textBlock = proxy.contentBlocks.find((c) => c.type === "text");
 const rawText = textBlock ? String(textBlock.text ?? "") : "";
 const htmlPrefix = rawText.startsWith("<")
  ? rawText.substring(0, rawText.indexOf("\n\n{")).trimEnd()
  : "";
 const structured = proxy.structured as Record<string, unknown> | undefined;
 // Proxy thumbnail URLs in structured content for ChatGPT iframe
 const proxied = structured ? proxyUrls(structured) as Record<string, unknown> : {};
 const textJson = JSON.stringify(proxied ?? {}, null, 2);
 // Replace image URLs in HTML with proxied versions
 const proxiedHtml = htmlPrefix ? proxyImageUrlsInHtml(htmlPrefix) : "";
 const text = proxiedHtml ? `${proxiedHtml}\n\n${textJson}` : textJson;
 return {
  content: [...images, { type: "text", text }],
  structuredContent: proxied ?? {},
 };
}

/** Replace external image src/href URLs in HTML with proxied versions. */
function proxyImageUrlsInHtml(html: string): string {
 return html.replace(/(src|href)="(https?:\/\/[^"']+?)"/g, (_match, attr, url) => {
  return `${attr}="${proxyImageUrl(url)}"`;
 });
}

function toolError(prefix: string, err: unknown): {
 content: Array<{ type: "text"; text: string }>;
 isError: true;
} {
 const msg = err instanceof Error ? err.message : String(err);
 return { content: [{ type: "text", text: `${prefix}: ${msg}` }], isError: true };
}

/** Build an HTML card for analyze_post results. */
function buildAnalysisHtmlCard(
 result: Record<string, unknown>,
 thumbnailUrl: string,
 platform: string,
 creatorHandle: string,
 title: string
): string {
 const platformEmoji: Record<string, string> = {
  tiktok: "🎵", instagram: "📸", youtube: "▶️", twitter: "🐦",
  x: "🐦", douyin: "🎵", xiaohongshu: "📕", bilibili: "📺",
 };
 const platformColor: Record<string, string> = {
  tiktok: "#000000", instagram: "#E4405F", youtube: "#FF0000",
  twitter: "#1DA1F2", x: "#000000", douyin: "#000000",
  xiaohongshu: "#FF2442", bilibili: "#00A1D6",
 };
 const emoji = platformEmoji[platform] || "📱";
 const color = platformColor[platform] || "#6b7280";
 const post = (result.post ?? {}) as Record<string, unknown>;
 const analysis = (result.analysis ?? {}) as Record<string, unknown>;
 const views = typeof post.views === "number" ? post.views.toLocaleString() : "—";
 const likes = typeof post.likes === "number" ? post.likes.toLocaleString() : "—";
 const comments = typeof post.comments === "number" ? post.comments.toLocaleString() : "—";
 const shares = typeof post.shares === "number" ? post.shares.toLocaleString() : "—";
 const hookStrength = typeof analysis.hookStrength === "number" ? analysis.hookStrength : null;
 const summary = typeof analysis.summary === "string" ? analysis.summary : "";
 const whyItWorks = typeof analysis.whyItWorks === "string" ? analysis.whyItWorks : "";
 const viralTriggers = Array.isArray(analysis.viralTriggers) ? analysis.viralTriggers : [];
 const variationIdeas = Array.isArray(analysis.variationIdeas) ? analysis.variationIdeas.slice(0, 3) : [];
 const suggestedHook = typeof analysis.suggestedHook === "string" ? analysis.suggestedHook : "";

 let html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;background:#0d1117;color:#e6edf3;border-radius:12px;overflow:hidden;margin:0 auto">`;
 // Thumbnail
 if (thumbnailUrl) {
  html += `<div style="position:relative"><img src="${thumbnailUrl}" style="width:100%;max-height:400px;object-fit:cover;display:block" onerror="this.style.display='none'" /><div style="position:absolute;bottom:12px;left:12px;display:flex;gap:8px;flex-wrap:wrap">`;
  html += `<span style="background:${color};color:#fff;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600">${emoji} ${platform}</span>`;
  html += `</div></div>`;
 }
 // Header
 html += `<div style="padding:16px 20px">`;
 html += `<div style="font-size:18px;font-weight:700;margin-bottom:4px">📊 AI Post Analysis</div>`;
 if (creatorHandle) html += `<div style="color:#8b949e;font-size:13px">@${creatorHandle}</div>`;
 if (title) html += `<div style="color:#c9d1d9;font-size:14px;margin-top:8px;line-height:1.4">${title.slice(0, 150)}</div>`;
 // Stats
 html += `<div style="display:flex;gap:12px;margin-top:12px;flex-wrap:wrap">`;
 html += `<span style="background:#21262d;padding:4px 10px;border-radius:8px;font-size:13px">👁️ ${views}</span>`;
 html += `<span style="background:#21262d;padding:4px 10px;border-radius:8px;font-size:13px">❤️ ${likes}</span>`;
 html += `<span style="background:#21262d;padding:4px 10px;border-radius:8px;font-size:13px">💬 ${comments}</span>`;
 html += `<span style="background:#21262d;padding:4px 10px;border-radius:8px;font-size:13px">🔄 ${shares}</span>`;
 html += `</div>`;
 // Hook strength bar
 if (hookStrength !== null) {
  const pct = Math.min(hookStrength * 10, 100);
  const barColor = hookStrength >= 7 ? "#3fb950" : hookStrength >= 4 ? "#d29922" : "#f85149";
  html += `<div style="margin-top:12px"><div style="font-size:12px;color:#8b949e;margin-bottom:4px">Hook Strength: ${hookStrength}/10</div><div style="background:#21262d;border-radius:999px;height:8px"><div style="background:${barColor};width:${pct}%;height:100%;border-radius:999px"></div></div></div>`;
 }
 // Summary
 if (summary) {
  html += `<div style="margin-top:14px;padding:12px;background:#161b22;border-radius:8px;border-left:3px solid ${color}"><div style="font-size:12px;font-weight:600;color:#8b949e;margin-bottom:4px">📝 Summary</div><div style="font-size:13px;line-height:1.5">${summary}</div></div>`;
 }
 // Why it works
 if (whyItWorks) {
  html += `<div style="margin-top:10px;padding:12px;background:#161b22;border-radius:8px;border-left:3px solid #3fb950"><div style="font-size:12px;font-weight:600;color:#8b949e;margin-bottom:4px">✅ Why It Works</div><div style="font-size:13px;line-height:1.5">${whyItWorks}</div></div>`;
 }
 // Viral triggers
 if (viralTriggers.length > 0) {
  html += `<div style="margin-top:10px"><div style="font-size:12px;font-weight:600;color:#8b949e;margin-bottom:6px">🔥 Viral Triggers</div><div style="display:flex;flex-wrap:wrap;gap:6px">`;
  viralTriggers.forEach((t) => {
   html += `<span style="background:#1f6feb33;color:#58a6ff;padding:4px 10px;border-radius:999px;font-size:12px">${t}</span>`;
  });
  html += `</div></div>`;
 }
 // Suggested hook
 if (suggestedHook) {
  html += `<div style="margin-top:10px;padding:12px;background:#161b22;border-radius:8px;border-left:3px solid #d29922"><div style="font-size:12px;font-weight:600;color:#8b949e;margin-bottom:4px">💡 Suggested Hook</div><div style="font-size:13px;font-style:italic;line-height:1.5">${suggestedHook}</div></div>`;
 }
 // Variation ideas
 if (variationIdeas.length > 0) {
  html += `<div style="margin-top:10px"><div style="font-size:12px;font-weight:600;color:#8b949e;margin-bottom:6px">🔄 Variation Ideas</div><ol style="margin:0;padding-left:18px;font-size:13px;line-height:1.6">`;
  variationIdeas.forEach((v) => { html += `<li>${v}</li>`; });
  html += `</ol></div>`;
 }
 html += `</div></div>`;
 return html;
}

export function createMcpServer(
 makeClient: (ctx: MakeClientContext) => Promise<OrchynClient> | OrchynClient
): McpServer {
 const server = new McpServer(
  { name: "orchyn-mcp", version: MCP_SERVER_VERSION },
  {
   capabilities: {
    resources: {},
    extensions: {
     [UI_EXTENSION]: { mimeTypes: [RESOURCE_MIME_TYPE] },
    },
   },
  }
 );

 // Register the single UI resource that all tools share.
 // The host reads this resource, renders it in a sandboxed iframe,
 // and pushes tool results via ui/notifications/tool-result.
 server.registerResource(
  "Orchyn Interactive View",
  UI_RESOURCE_URI,
  { mimeType: RESOURCE_MIME_TYPE },
  async () => {
   // Build CSP resourceDomains from env so proxied thumbnails work
   const domains = [
    "https://*.tiktokcdn.com",
    "https://*.cdninstagram.com",
    "https://*.ytimg.com",
    "https://*.googlevideo.com",
   ];
   const apiUrl = process.env.ORCHYN_API_URL || process.env.ORCHYN_BASE_URL;
   if (apiUrl && apiUrl.trim()) {
    domains.push(apiUrl.trim().replace(/\/+$/, ""));
   }
   return {
    contents: [
     {
      uri: UI_RESOURCE_URI,
      mimeType: RESOURCE_MIME_TYPE,
      text: ORCHYN_UI_TEMPLATE,
      _meta: {
       ui: {
        csp: {
         resourceDomains: domains,
        },
       },
      },
     },
    ],
   };
  }
 );

 server.registerTool(
  "analyze_post",
  {
   title: "Analyze Post",
   description:
    "Analyze a social post (video, image, carousel/slideshow) from its link — " +
    "imports the media and runs AI analysis over the actual content (video frames, carousel images, caption). " +
    "Supports TikTok, Instagram, YouTube, X/Twitter, Douyin, Xiaohongshu and Bilibili. Returns the full analysis once finished. First use free per user.",
   _meta: { ui: { resourceUri: UI_RESOURCE_URI } },
   inputSchema: z
    .object({
     url: z.string().describe("Public post URL (TikTok/Instagram/YouTube/X, Douyin, Xiaohongshu or Bilibili)."),
    })
    .strict(),
  },
  async (args: { url: string }, extra) => {
   const client = await makeClient(extra);
   const validation = validatePostUrl(args.url);
   if (!validation.ok) {
    return {
     content: [{ type: "text", text: `Invalid url: ${validation.error}` }],
     isError: true,
    };
   }
   try {
    const result = (await runVideoAnalysis(client, validation.url) as unknown) as Record<string, unknown> & {
     inlineImages?: Array<{ url?: string; data?: string; mimeType?: string }>;
    };
    // Remove internal field from the JSON shown to the model
    const { inlineImages: _omit, ...rest } = result;
    // Proxy thumbnail URLs in structured content for ChatGPT iframe
    const proxied = proxyUrls(rest) as Record<string, unknown>;
    // Build HTML card for interactive UI
    const post = (rest.post ?? {}) as Record<string, unknown>;
    const analysis = (rest.analysis ?? {}) as Record<string, unknown>;
    const thumbnailUrl = typeof post.thumbnailUrl === "string" ? proxyImageUrl(post.thumbnailUrl) : "";
    const platform = String(post.platform ?? rest.platform ?? "");
    const creatorHandle = String(post.creatorHandle ?? "");
    const title = String(post.title ?? post.caption ?? "");
    const htmlCard = buildAnalysisHtmlCard(proxied, thumbnailUrl, platform, creatorHandle, title);
    // The backend attaches `_inlineImages` as permanent orchyn public URLs
    // (re-hosted into storage, HEIC already transcoded to JPEG). The SDK's
    // ImageContent only accepts base64 `data`, so fetch each URL and encode it.
    const images: ToolContent[] = await Promise.all(
     (result.inlineImages ?? [])
      .filter((img) => typeof img === "object" && img !== null)
      .map((img) =>
       "url" in img && img.url
        ? fetchAsBase64Image(String(img.url), String(img.mimeType ?? "image/jpeg"))
        : Promise.resolve({ type: "image" as const, data: String((img as { data?: string }).data ?? ""), mimeType: String(img.mimeType ?? "image/jpeg") })
      )
    );
    const textJson = JSON.stringify(proxied, null, 2);
    return {
     content: [...images, { type: "text" as const, text: `${htmlCard}\n\n${textJson}` }],
     structuredContent: proxied,
    };
   } catch (err) {
    if (err instanceof OrchynError && err.paywall) {
     return {
      content: [{ type: "text", text: `Analysis blocked: ${formatPaywallError(err)}\n\nHTTP ${err.status}: ${err.message}` }],
      isError: true,
     };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Analysis failed: ${msg}` }], isError: true };
   }
  }
 );

 server.registerTool(
  "get_social_media",
  {
   title: "Get Social Media",
   description:
    "Fetch a social post's media from a TikTok, Instagram, YouTube, X/Twitter, Douyin, Xiaohongshu or Bilibili URL: " +
    "contentType (video/image/carousel/slideshow), title, caption, author, stats and direct media URLs. " +
    "Returns an inline thumbnail image. Consumes 1 orchyn credit. First use free per user.",
   _meta: { ui: { resourceUri: UI_RESOURCE_URI } },
   inputSchema: z
    .object({
     url: z.string().describe("Full public post URL."),
    })
    .strict(),
  },
  async (args: { url: string }, extra) => {
   const client = await makeClient(extra);
   try {
    return await toToolResult(await client.callTool("get_social_media", { url: args.url }));
   } catch (err) {
    return toolError("get_social_media failed", err);
   }
  }
 );

 server.registerTool(
  "discover_social_posts",
  {
   title: "Discover Social Posts",
   description:
    "Discover recent posts (video, image, carousel, slideshow) for a niche on YouTube, TikTok, Instagram, Douyin, Xiaohongshu, X/Twitter or Bilibili. " +
    "Each post includes title/caption, thumbnailUrl, externalUrl, views/likes/comments and inline thumbnails (up to 4) so they show in chat. " +
    'Say "next" to paginate (offset), or "analyze the 2nd one" / "analyze all" for batch analysis. Consumes 2 orchyn credits. First use free per user.',
   _meta: { ui: { resourceUri: UI_RESOURCE_URI } },
   inputSchema: z
    .object({
     niche: z.string().describe("Niche/topic, e.g. 'fitness'."),
     keywords: z.string().optional().describe("Optional extra keywords."),
     limit: z.number().int().optional().describe("Max results (default 6)."),
     offset: z.number().int().optional().describe("Skip first N results — for 'next' pagination."),
     platform: z
      .enum(["youtube", "tiktok", "instagram", "douyin", "xiaohongshu", "twitter", "bilibili", "any"])
      .optional()
      .describe("Platform to search (default youtube)."),
    })
    .strict(),
  },
  async (
   args: { niche: string; keywords?: string; limit?: number; offset?: number; platform?: string },
   extra
  ) => {
   const client = await makeClient(extra);
   try {
    return await toToolResult(await client.callTool("discover_social_posts", { ...args }));
   } catch (err) {
    return toolError("discover_social_posts failed", err);
   }
  }
 );

 server.registerTool(
  "get_user_posts",
  {
   title: "Get User Posts",
   description:
    "List recent posts by a creator handle (e.g. @zoundsapp) on TikTok, Instagram, YouTube, Douyin, Xiaohongshu, X/Twitter or Bilibili. " +
    "Each post includes title/caption, thumbnailUrl, externalUrl, views/likes/comments and inline thumbnails (up to 4) so they show in chat. " +
    "Use this when Claude needs to pull more posts from the same account to spot a pattern, or to scan a whole profile. Consumes 2 orchyn credits. First use free per user.",
   _meta: { ui: { resourceUri: UI_RESOURCE_URI } },
   inputSchema: z
    .object({
     username: z.string().describe("Creator handle, e.g. 'zoundsapp' or '@zoundsapp'."),
     platform: z
      .enum(["tiktok", "instagram", "youtube", "douyin", "xiaohongshu", "twitter", "bilibili"])
      .optional()
      .describe("Which platform (default tiktok)."),
     limit: z.number().int().optional().describe("Max posts (default 6)."),
    })
    .strict(),
  },
  async (
   args: { username: string; platform?: string; limit?: number },
   extra
  ) => {
   const client = await makeClient(extra);
   try {
    return await toToolResult(await client.callTool("get_user_posts", { ...args }));
   } catch (err) {
    return toolError("get_user_posts failed", err);
   }
  }
 );

 server.registerTool(
  "analyze_creator_profile",
  {
   title: "Analyze Creator Profile",
   description:
    "Deep-dive a whole creator profile on TikTok, Instagram, YouTube, Douyin, Xiaohongshu, X/Twitter or Bilibili: fetch recent posts, run multimodal AI on up to 3, " +
    "then synthesize a profile report — creator summary, niche, content themes, hook styles, strengths/weaknesses, " +
    "engagement patterns, audience insights, variation ideas, collaboration fit. Consumes 15 orchyn credits. First use free per user.",
   _meta: { ui: { resourceUri: UI_RESOURCE_URI } },
   inputSchema: z
    .object({
     username: z.string().describe("Creator handle, e.g. 'zoundsapp'."),
     platform: z
      .enum(["tiktok", "instagram", "youtube", "douyin", "xiaohongshu", "twitter", "bilibili"])
      .optional()
      .describe("Which platform (default tiktok)."),
     limit: z.number().int().optional().describe("Posts to fetch (default 6; first 3 analyzed)."),
     focus: z.string().optional().describe("Extra instruction for the profile synthesis."),
    })
    .strict(),
  },
  async (
   args: { username: string; platform?: string; limit?: number; focus?: string },
   extra
  ) => {
   const client = await makeClient(extra);
   try {
    return await toToolResult(await client.callTool("analyze_creator_profile", { ...args }));
   } catch (err) {
    return toolError("analyze_creator_profile failed", err);
   }
  }
 );

 server.registerTool(
  "get_post_comments",
  {
   title: "Get Post Comments",
   description:
    "Fetch top comments for a post URL on TikTok, Instagram, YouTube, Douyin, X/Twitter or Bilibili, plus keyword clusters from TikTok Analytics " +
    "when available — audience sentiment/audience-signal analysis. Consumes 2 orchyn credits. First use free per user.",
   _meta: { ui: { resourceUri: UI_RESOURCE_URI } },
   inputSchema: z
    .object({
     url: z.string().describe("Full public post URL (TikTok/Instagram/YouTube/Douyin/X/Bilibili)."),
     limit: z.number().int().optional().describe("Max comments (default 20)."),
    })
    .strict(),
  },
  async (
   args: { url: string; limit?: number },
   extra
  ) => {
   const client = await makeClient(extra);
   try {
    return await toToolResult(await client.callTool("get_post_comments", { ...args }));
   } catch (err) {
    return toolError("get_post_comments failed", err);
   }
  }
 );

 server.registerTool(
  "search_creators",
  {
   title: "Search Creators",
   description:
    "Search creators by niche/keyword on TikTok, Instagram, Xiaohongshu, YouTube or Douyin — username, nickname, follower count, " +
    "signature, verified status. Use to find influencers to vet or analyze. Consumes 2 orchyn credits. First use free per user.",
   _meta: { ui: { resourceUri: UI_RESOURCE_URI } },
   inputSchema: z
    .object({
     keyword: z.string().describe("Niche/keyword, e.g. 'fitness' or a creator name."),
     platform: z
      .enum(["tiktok", "instagram", "xiaohongshu", "youtube", "douyin"])
      .optional()
      .describe("Which platform (default tiktok)."),
     count: z.number().int().optional().describe("Max creators (default 8)."),
    })
    .strict(),
  },
  async (
   args: { keyword: string; platform?: string; count?: number },
   extra
  ) => {
   const client = await makeClient(extra);
   try {
    return await toToolResult(await client.callTool("search_creators", { ...args }));
   } catch (err) {
    return toolError("search_creators failed", err);
   }
  }
 );

 server.registerTool(
  "get_similar_creators",
  {
   title: "Get Similar Creators",
   description:
    "Find lookalike creators for a given handle — TikTok similar-user recommendations or Instagram " +
    "similar users. Useful for scaling: 'if this creator works, here are more like them'. Consumes 2 orchyn credits. First use free per user.",
   _meta: { ui: { resourceUri: UI_RESOURCE_URI } },
   inputSchema: z
    .object({
     username: z.string().describe("Seed creator handle, e.g. 'zoundsapp'."),
     platform: z.enum(["tiktok", "instagram"]).optional().describe("Which platform (default tiktok)."),
    })
    .strict(),
  },
  async (
   args: { username: string; platform?: string },
   extra
  ) => {
   const client = await makeClient(extra);
   try {
    return await toToolResult(await client.callTool("get_similar_creators", { ...args }));
   } catch (err) {
    return toolError("get_similar_creators failed", err);
   }
  }
 );

 server.registerTool(
  "discover_sounds",
  {
   title: "Discover Sounds",
   description:
    "Discover trending sounds/music for a keyword on TikTok or Instagram — the sound is a huge ranking " +
    "signal for TikTok virality. Returns title, artist, duration, play/cover URLs. Consumes 2 orchyn credits. First use free per user.",
   _meta: { ui: { resourceUri: UI_RESOURCE_URI } },
   inputSchema: z
    .object({
     keyword: z.string().describe("Niche/keyword, e.g. 'gym'."),
     platform: z.enum(["tiktok", "instagram"]).optional().describe("Which platform (default tiktok)."),
     count: z.number().int().optional().describe("Max sounds (default 6)."),
    })
    .strict(),
  },
  async (
   args: { keyword: string; platform?: string; count?: number },
   extra
  ) => {
   const client = await makeClient(extra);
   try {
    return await toToolResult(await client.callTool("discover_sounds", { ...args }));
   } catch (err) {
    return toolError("discover_sounds failed", err);
   }
  }
 );

 server.registerTool(
  "check_orchyn_credits",
  {
   title: "Check Orchyn Credits",
   description:
    "Check your orchyn credit balance, billing URL and pack size. No cost — call anytime to see remaining credits before running other tools.",
   _meta: { ui: { resourceUri: UI_RESOURCE_URI } },
   inputSchema: z.object({}).strict(),
  },
  async (_args: Record<string, never>, extra) => {
   const client = await makeClient(extra);
   try {
    return await toToolResult(await client.callTool("check_orchyn_credits", {}));
   } catch (err) {
    return toolError("check_orchyn_credits failed", err);
   }
  }
 );

 server.registerTool(
  "buy_orchyn_credits",
  {
   title: "Buy Orchyn Credits",
   description:
    "Buy an MCP credit pack via Stripe Checkout. Returns a secure checkout URL — open it in your browser to pay. Credits are added automatically after payment. No cost to call.",
   _meta: { ui: { resourceUri: UI_RESOURCE_URI } },
   inputSchema: z.object({}).strict(),
  },
  async (_args: Record<string, never>, extra) => {
   const client = await makeClient(extra);
   try {
    return await toToolResult(await client.callTool("buy_orchyn_credits", {}));
   } catch (err) {
    return toolError("buy_orchyn_credits failed", err);
   }
  }
 );

 server.registerTool(
  "understand_social_post",
  {
   title: "Understand Social Post",
   description:
    "Import a social post URL AND understand it with multimodal AI over the actual video/images: " +
    "summary, hook strength, viral triggers, format breakdown and variation ideas. Includes the thumbnail. " +
    "Supports TikTok, Instagram, YouTube, X/Twitter, Douyin, Xiaohongshu and Bilibili. Consumes 6 orchyn credits. First use free per user.",
   _meta: { ui: { resourceUri: UI_RESOURCE_URI } },
   inputSchema: z
    .object({
     url: z.string().describe("Full public post URL (TikTok/Instagram/YouTube/X/Douyin/Xiaohongshu/Bilibili)."),
     focus: z
      .string()
      .optional()
      .describe("Extra instruction, e.g. 'focus on the CTA'."),
    })
    .strict(),
  },
  async (args: { url: string; focus?: string }, extra) => {
   const client = await makeClient(extra);
   try {
    return await toToolResult(await client.callTool("understand_social_post", { ...args }));
   } catch (err) {
    return toolError("understand_social_post failed", err);
   }
  }
 );

 return server;
}
