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
export const MCP_SERVER_VERSION = "1.16.0";

/** MCP Apps extension identifier */
const UI_EXTENSION = "io.modelcontextprotocol/ui";
/** MIME type for MCP Apps HTML resources */
const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";
/** Default UI resource URI (only used when a tool has no explicit view). */
const UI_RESOURCE_URI = "ui://orchyn/view";

/**
 * Distinct UI resource URI per tool/view. Claude/ChatGPT create one app
 * instance per resourceUri and key app state by it (ext-apps#558), so giving
 * each tool its own uri avoids a shared app instance / session colliding
 * between different tools and lets each view complete its own handshake.
 */
function uiResource(tool: string): string {
 const slug = tool.replace(/[^a-z0-9_]/gi, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
 return `ui://orchyn/${slug || "view"}`;
}

/**
 * claude.ai requires `ui.domain` on the resource == sha256("<MCP endpoint
 * URL>")[:32] + ".claudemcpcontent.com" — the iframe is only revealed on
 * that dedicated sandbox origin. The endpoint is the worker's public origin
 * + "/mcp". stdio runs have no public URL, so the field is omitted and the
 * host falls back to its default per-conversation origin.
 */
async function computeAppDomain(): Promise<string | undefined> {
 const publicUrl = (process.env.PUBLIC_URL || "").trim().replace(/\/+$/, "");
 if (!publicUrl) return undefined;
 try {
  const endpoint = `${publicUrl}/mcp`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  const hex = Array.from(new Uint8Array(digest))
   .map((b) => b.toString(16).padStart(2, "0"))
   .join("");
  return `${hex.slice(0, 32)}.claudemcpcontent.com`;
 } catch {
  return undefined;
 }
}

type ToolContent = { type: "text"; text: string };

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
   if (["thumbnailUrl", "preview_url", "coverUrl", "avatarUrl", "avatar_thumb", "image_url", "videoUrl", "video_url", "url"].includes(k) && typeof v === "string") {
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
 // MCP Apps views (ChatGPT & Claude) render the interactive HTML card, which
 // already embeds all thumbnails/videos. Claude's Apps bridge rejects a tool
 // result that mixes raw `image` blocks with an app view ("could not be
 // processed: Error processing image" + blank iframe), so we intentionally
 // drop the standalone base64 image blocks here and keep only the text block
 // carrying the HTML card + structured JSON.
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
  content: [{ type: "text", text }],
  structuredContent: proxied ?? {},
 };
}

/** Replace external image/video src, poster and href URLs in HTML with proxied versions. */
function proxyImageUrlsInHtml(html: string): string {
 return html.replace(/(src|href|poster)="(https?:\/\/[^"']+?)"/g, (_match, attr, url) => {
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

/** Official brand color per platform (matches ui-template.ts pColor). */
function platformBrandColor(p: string): string {
 const map: Record<string, string> = {
  tiktok: "#000000", douyin: "#000000", instagram: "#E4405F",
  youtube: "#FF0000", xiaohongshu: "#FF2442", x: "#000000",
  twitter: "#1DA1F2", bilibili: "#00A1D6", linkedin: "#0A66C2",
 };
 return map[p] || "#6b7280";
}

/** Official brand mark (simple-icons path) as an inline SVG inheriting currentColor. */
function platformSvgMark(p: string, size = 14): string {
 const paths: Record<string, string> = {
  tiktok: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
  douyin: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
  instagram: "M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077",
  youtube: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  x: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
  twitter: "M21.543 7.104c.015.211.015.423.015.636 0 6.507-4.954 14.01-14.01 14.01v-.003A13.94 13.94 0 0 1 0 19.539a9.88 9.88 0 0 0 7.287-2.041 4.93 4.93 0 0 1-4.6-3.42 4.916 4.916 0 0 0 2.223-.084A4.926 4.926 0 0 1 .96 9.167v-.062a4.887 4.887 0 0 0 2.235.616A4.928 4.928 0 0 1 1.67 3.148 13.98 13.98 0 0 0 11.82 8.292a4.929 4.929 0 0 1 8.39-4.49 9.868 9.868 0 0 0 3.128-1.196 4.941 4.941 0 0 1-2.165 2.724A9.828 9.828 0 0 0 24 4.555a10.019 10.019 0 0 1-2.457 2.549z",
  xiaohongshu: "M22.405 9.879c.002.016.01.02.07.019h.725a.797.797 0 0 0 .78-.972.794.794 0 0 0-.884-.618.795.795 0 0 0-.692.794c0 .101-.002.666.001.777zm-11.509 4.808c-.203.001-1.353.004-1.685.003a2.528 2.528 0 0 1-.766-.126.025.025 0 0 0-.03.014L7.7 16.127a.025.025 0 0 0 .01.032c.111.06.336.124.495.124.66.01 1.32.002 1.981 0 .01 0 .02-.006.023-.015l.712-1.545a.025.025 0 0 0-.024-.036zM.477 9.91c-.071 0-.076.002-.076.01a.834.834 0 0 0-.01.08c-.027.397-.038.495-.234 3.06-.012.24-.034.389-.135.607-.026.057-.033.042.003.112.046.092.681 1.523.787 1.74.008.015.011.02.017.02.008 0 .033-.026.047-.044.147-.187.268-.391.371-.606.306-.635.44-1.325.486-1.706.014-.11.021-.22.03-.33l.204-2.616.022-.293c.003-.029 0-.033-.03-.034zm7.203 3.757a1.427 1.427 0 0 1-.135-.607c-.004-.084-.031-.39-.235-3.06a.443.443 0 0 0-.01-.082c-.004-.011-.052-.008-.076-.008h-1.48c-.03.001-.034.005-.03.034l.021.293c.076.982.153 1.964.233 2.946.05.4.186 1.085.487 1.706.103.215.223.419.37.606.015.018.037.051.048.049.02-.003.742-1.642.804-1.765.036-.07.03-.055.003-.112zm3.861-.913h-.872a.126.126 0 0 1-.116-.178l1.178-2.625a.025.025 0 0 0-.023-.035l-1.318-.003a.148.148 0 0 1-.135-.21l.876-1.954a.025.025 0 0 0-.023-.035h-1.56c-.01 0-.02.006-.024.015l-.926 2.068c-.085.169-.314.634-.399.938a.534.534 0 0 0-.02.191.46.46 0 0 0 .23.378.981.981 0 0 0 .46.119h.59c.041 0-.688 1.482-.834 1.972a.53.53 0 0 0-.023.172.465.465 0 0 0 .23.398c.15.092.342.12.475.12l1.66-.001c.01 0 .02-.006.023-.015l.575-1.28a.025.025 0 0 0-.024-.035zm-6.93-4.937H3.1a.032.032 0 0 0-.034.033c0 1.048-.01 2.795-.01 6.829 0 .288-.269.262-.28.262h-.74c-.04.001-.044.004-.04.047.001.037.465 1.064.555 1.263.01.02.03.033.051.033.157.003.767.009.938-.014.153-.02.3-.06.438-.132.3-.156.49-.419.595-.765.052-.172.075-.353.075-.533.002-2.33 0-4.66-.007-6.991a.032.032 0 0 0-.032-.032zm11.784 6.896c0-.014-.01-.021-.024-.022h-1.465c-.048-.001-.049-.002-.05-.049v-4.66c0-.072-.005-.07.07-.07h.863c.08 0 .075.004.075-.074V8.393c0-.082.006-.076-.08-.076h-3.5c-.064 0-.075-.006-.075.073v1.445c0 .083-.006.077.08.077h.854c.075 0 .07-.004.07.07v4.624c0 .095.008.084-.085.084-.37 0-1.11-.002-1.304 0-.048.001-.06.03-.06.03l-.697 1.519s-.014.025-.008.036c.006.01.013.008.058.008 1.748.003 3.495.002 5.243.002.03-.001.034-.006.035-.033v-1.539zm4.177-3.43c0 .013-.007.023-.02.024-.346.006-.692.004-1.037.004-.014-.002-.022-.01-.022-.024-.005-.434-.007-.869-.01-1.303 0-.072-.006-.071.07-.07l.733-.003c.041 0 .081.002.12.015.093.025.16.107.165.204.006.431.002 1.153.001 1.153zm2.67.244a1.953 1.953 0 0 0-.883-.222h-.18c-.04-.001-.04-.003-.042-.04V10.21c0-.132-.007-.263-.025-.394a1.823 1.823 0 0 0-.153-.53 1.533 1.533 0 0 0-.677-.71 2.167 2.167 0 0 0-1-.258c-.153-.003-.567 0-.72 0-.07 0-.068.004-.068-.065V7.76c0-.031-.01-.041-.046-.039H17.93s-.016 0-.023.007c-.006.006-.008.012-.008.023v.546c-.008.036-.057.015-.082.022h-.95c-.022.002-.028.008-.03.032v1.481c0 .09-.004.082.082.082h.913c.082 0 .072.128.072.128V11.19s.003.117-.06.117h-1.482c-.068 0-.06.082-.06.082v1.445s-.01.068.064.068h1.457c.082 0 .076-.006.076.079v3.225c0 .088-.007.081.082.081h1.43c.09 0 .082.007.082-.08v-3.27c0-.029.006-.035.033-.035l2.323-.003c.098 0 .191.02.28.061a.46.46 0 0 1 .274.407c.008.395.003.79.003 1.185 0 .259-.107.367-.33.367h-1.218c-.023.002-.029.008-.028.033.184.437.374.871.57 1.303a.045.045 0 0 0 .04.026c.17.005.34.002.51.003.15-.002.517.004.666-.01a2.03 2.03 0 0 0 .408-.075c.59-.18.975-.698.976-1.313v-1.981c0-.128-.01-.254-.034-.38 0 .078-.029-.641-.724-.998z",
  bilibili: "M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373Z",
  linkedin: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  unknown: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",
 };
 const d = paths[p] || paths.unknown;
 return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" style="vertical-align:-2px;flex-shrink:0;display:inline-block" aria-hidden="true"><path d="${d}"/></svg>`;
}

/** Build an HTML card for analyze_post results. */
function buildAnalysisHtmlCard(
 result: Record<string, unknown>,
 thumbnailUrl: string,
 platform: string,
 creatorHandle: string,
 title: string
): string {
 const brandSvg = platformSvgMark(platform, 14);
 const color = platformBrandColor(platform);
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

 const videoUrl =
  typeof post.videoUrl === "string"
   ? post.videoUrl
   : Array.isArray(post.mediaItems)
     ? (post.mediaItems as Array<Record<string, unknown>>).find(
       (m) => m.kind === "video" && typeof m.preview_url === "string"
      )?.preview_url as string | undefined
     : undefined;

 let html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;background:#0d1117;color:#e6edf3;border-radius:12px;overflow:hidden;margin:0 auto">`;
 // Thumbnail / video
 const badgeHtml = `<span style="background:${color};color:#fff;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:4px">${brandSvg} ${platform}</span>`;
 if (videoUrl) {
  html += `<div style="position:relative"><video src="${videoUrl}" controls preload="metadata" playsinline poster="${thumbnailUrl}" style="width:100%;max-height:400px;object-fit:contain;display:block;background:#000" onerror="this.outerHTML='<img src=&quot;${thumbnailUrl}&quot; style=&quot;width:100%;max-height:400px;object-fit:cover;display:block&quot;/>'">Your browser doesn't support video playback.</video><div style="position:absolute;bottom:12px;left:12px;display:flex;gap:8px;flex-wrap:wrap">${badgeHtml}</div></div>`;
 } else if (thumbnailUrl) {
  html += `<div style="position:relative"><img src="${thumbnailUrl}" style="width:100%;max-height:400px;object-fit:cover;display:block" onerror="this.style.display='none'" /><div style="position:absolute;bottom:12px;left:12px;display:flex;gap:8px;flex-wrap:wrap">${badgeHtml}</div></div>`;
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

 // Register one UI app resource per tool/view. Claude/ChatGPT render a
 // separate sandboxed app per resourceUri and key app state by it, so a
 // distinct URI per tool avoids a shared app instance/session colliding
 // between different tools (ext-apps#558). Each URI serves the same generic
 // template, which renders whichever structuredResult the tool delivers.
 const TOOL_URIS = [
  "analyze_post",
  "get_social_media",
  "discover_social_posts",
  "get_user_posts",
  "analyze_creator_profile",
  "get_post_comments",
  "search_creators",
  "get_similar_creators",
  "discover_sounds",
  "check_orchyn_credits",
  "buy_orchyn_credits",
  "understand_social_post",
 ].map(uiResource);

 // Build CSP resourceDomains from env so proxied thumbnails work
 const domains = [
  "https://*.tiktokcdn.com",
  "https://*.cdninstagram.com",
  "https://*.ytimg.com",
  "https://*.googlevideo.com",
  "https://*.licdn.com",
  "https://*.linkedin.com",
 ];
 const apiUrl = process.env.ORCHYN_API_URL || process.env.ORCHYN_BASE_URL;
 if (apiUrl && apiUrl.trim()) {
  domains.push(apiUrl.trim().replace(/\/+$/, ""));
 }

 for (const uri of TOOL_URIS) {
  server.registerResource(
   "Orchyn Interactive View",
   uri,
   { mimeType: RESOURCE_MIME_TYPE },
   async () => {
    // Computed per-request so the claude.ai sandbox origin is correct.
    const domain = await computeAppDomain();
    return {
     contents: [
      {
       uri,
       mimeType: RESOURCE_MIME_TYPE,
       text: ORCHYN_UI_TEMPLATE,
       _meta: {
        ui: {
         ...(domain ? { domain } : {}),
         csp: {
          resourceDomains: domains,
         },
         prefersBorder: false,
        },
       },
      },
     ],
    };
   }
  );
 }

 server.registerTool(
  "analyze_post",
  {
   title: "Analyze Post",
   description:
    "Analyze a social post (video, image, carousel/slideshow) from its link — " +
    "imports the media and runs AI analysis over the actual content (video frames, carousel images, caption). " +
    "Supports TikTok, Instagram, YouTube, X/Twitter, Douyin, Xiaohongshu and Bilibili. Returns the full analysis once finished. First use free per user.",
   _meta: { ui: { resourceUri: uiResource("analyze_post") }, "ui/resourceUri": uiResource("analyze_post") },
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
    // The interactive HTML card above already embeds the thumbnail + full
    // video, so no standalone base64 `image` blocks are emitted. Claude's Apps
    // bridge rejects raw image blocks mixed with an app view ("could not be
    // processed: Error processing image" + blank iframe), so we keep only the
    // text block carrying the card + structured JSON.
    const textJson = JSON.stringify(proxied, null, 2);
    return {
     content: [{ type: "text" as const, text: `${htmlCard}\n\n${textJson}` }],
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
   _meta: { ui: { resourceUri: uiResource("get_social_media") }, "ui/resourceUri": uiResource("get_social_media") },
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
   _meta: { ui: { resourceUri: uiResource("discover_social_posts") }, "ui/resourceUri": uiResource("discover_social_posts") },
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
    "List recent posts by a creator handle (e.g. @zoundsapp) on TikTok, Instagram, YouTube, Douyin, Xiaohongshu, X/Twitter, Bilibili or LinkedIn (LinkedIn uses the profile public_id, e.g. 'billgates'). " +
    "Each post includes title/caption, thumbnailUrl, externalUrl, views/likes/comments and inline thumbnails (up to 4) so they show in chat. " +
    "Use this when Claude needs to pull more posts from the same account to spot a pattern, or to scan a whole profile. Consumes 2 orchyn credits. First use free per user.",
   _meta: { ui: { resourceUri: uiResource("get_user_posts") }, "ui/resourceUri": uiResource("get_user_posts") },
   inputSchema: z
    .object({
     username: z.string().describe("Creator handle, e.g. 'zoundsapp' or '@zoundsapp'."),
     platform: z
      .enum(["tiktok", "instagram", "youtube", "douyin", "xiaohongshu", "twitter", "bilibili", "linkedin"])
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
    "Deep-dive a whole creator profile on TikTok, Instagram, YouTube, Douyin, Xiaohongshu, X/Twitter, Bilibili or LinkedIn: fetch recent posts, run multimodal AI on up to 3, " +
    "then synthesize a profile report — creator summary, niche, content themes, hook styles, strengths/weaknesses, " +
    "engagement patterns, audience insights, variation ideas, collaboration fit. Consumes 15 orchyn credits. First use free per user.",
   _meta: { ui: { resourceUri: uiResource("analyze_creator_profile") }, "ui/resourceUri": uiResource("analyze_creator_profile") },
   inputSchema: z
    .object({
     username: z.string().describe("Creator handle, e.g. 'zoundsapp'."),
     platform: z
      .enum(["tiktok", "instagram", "youtube", "douyin", "xiaohongshu", "twitter", "bilibili", "linkedin"])
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
    "Fetch top comments for a post URL on TikTok, Instagram, YouTube, Douyin, X/Twitter, Bilibili or LinkedIn, plus keyword clusters from TikTok Analytics " +
    "when available — audience sentiment/audience-signal analysis. Consumes 2 orchyn credits. First use free per user.",
   _meta: { ui: { resourceUri: uiResource("get_post_comments") }, "ui/resourceUri": uiResource("get_post_comments") },
   inputSchema: z
    .object({
     url: z.string().describe("Full public post URL (TikTok/Instagram/YouTube/Douyin/X/Bilibili/LinkedIn)."),
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
   _meta: { ui: { resourceUri: uiResource("search_creators") }, "ui/resourceUri": uiResource("search_creators") },
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
   _meta: { ui: { resourceUri: uiResource("get_similar_creators") }, "ui/resourceUri": uiResource("get_similar_creators") },
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
   _meta: { ui: { resourceUri: uiResource("discover_sounds") }, "ui/resourceUri": uiResource("discover_sounds") },
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
   _meta: { ui: { resourceUri: uiResource("check_orchyn_credits") }, "ui/resourceUri": uiResource("check_orchyn_credits") },
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
   _meta: { ui: { resourceUri: uiResource("buy_orchyn_credits") }, "ui/resourceUri": uiResource("buy_orchyn_credits") },
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
   _meta: { ui: { resourceUri: uiResource("understand_social_post") }, "ui/resourceUri": uiResource("understand_social_post") },
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
