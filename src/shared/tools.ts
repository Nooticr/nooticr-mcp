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

type ToolContent =
 | { type: "text"; text: string }
 | { type: "image"; data: string; mimeType: string };

export interface MakeClientContext {
 authInfo?: AuthInfo;
}

function toToolResult(proxy: McpProxyResult): { content: ToolContent[] } {
 const images = proxy.contentBlocks
  .filter((c) => c.type === "image")
  .map((c) => ({
   type: "image" as const,
   data: String(c.data ?? ""),
   mimeType: String(c.mimeType ?? "image/jpeg"),
  }));
 const text = JSON.stringify(proxy.structured ?? {}, null, 2);
 return { content: [...images, { type: "text", text }] };
}

function toolError(prefix: string, err: unknown): {
 content: Array<{ type: "text"; text: string }>;
 isError: true;
} {
 const msg = err instanceof Error ? err.message : String(err);
 return { content: [{ type: "text", text: `${prefix}: ${msg}` }], isError: true };
}

export function createMcpServer(
 makeClient: (ctx: MakeClientContext) => Promise<OrchynClient> | OrchynClient
): McpServer {
 const server = new McpServer({
  name: "orchyn-mcp",
  version: "1.5.0",
 });

 server.registerTool(
  "analyze_post",
  {
   title: "Analyze Post",
   description:
    "Analyze a social post (video, image, carousel/slideshow) from its link — " +
    "imports the media and runs AI analysis over the actual content (video frames, carousel images, caption). " +
    "Supports TikTok, Instagram, YouTube, X/Twitter, Douyin, Xiaohongshu and Bilibili. Returns the full analysis once finished. First use free per user.",
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
     inlineImages?: Array<{ data: string; mimeType?: string }>;
    };
    const images = (result.inlineImages ?? []).map((img) => ({
     type: "image" as const,
     data: String(img.data),
     mimeType: String(img.mimeType ?? "image/jpeg"),
    }));
    // Remove internal thumbnail field from the JSON shown to the model
    const { inlineImages: _omit, ...rest } = result;
    return {
     content: [...images, { type: "text" as const, text: JSON.stringify(rest, null, 2) }],
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
   inputSchema: z
    .object({
     url: z.string().describe("Full public post URL."),
    })
    .strict(),
  },
  async (args: { url: string }, extra) => {
   const client = await makeClient(extra);
   try {
    return toToolResult(await client.callTool("get_social_media", { url: args.url }));
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
    return toToolResult(await client.callTool("discover_social_posts", { ...args }));
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
    return toToolResult(await client.callTool("get_user_posts", { ...args }));
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
    return toToolResult(await client.callTool("analyze_creator_profile", { ...args }));
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
    return toToolResult(await client.callTool("get_post_comments", { ...args }));
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
    return toToolResult(await client.callTool("search_creators", { ...args }));
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
    return toToolResult(await client.callTool("get_similar_creators", { ...args }));
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
    return toToolResult(await client.callTool("discover_sounds", { ...args }));
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
   inputSchema: z.object({}).strict(),
  },
  async (_args: Record<string, never>, extra) => {
   const client = await makeClient(extra);
   try {
    return toToolResult(await client.callTool("check_orchyn_credits", {}));
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
   inputSchema: z.object({}).strict(),
  },
  async (_args: Record<string, never>, extra) => {
   const client = await makeClient(extra);
   try {
    return toToolResult(await client.callTool("buy_orchyn_credits", {}));
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
    return toToolResult(await client.callTool("understand_social_post", { ...args }));
   } catch (err) {
    return toolError("understand_social_post failed", err);
   }
  }
 );

 return server;
}
