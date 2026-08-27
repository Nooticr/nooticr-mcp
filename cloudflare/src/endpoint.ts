import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";
import { OrchynClient, OrchynError, jwtExpiry, type OrchynSession } from "./orchyn.js";
import { validatePostUrl, runVideoAnalysis, formatPaywallError } from "./video.js";
import { TOOL_DEFINITIONS } from "../../src/shared/tools-def.js";
import { verifyToken, validMcpToken, updateSessionTokens, type McpSession } from "./oauth.js";

function toToolResult(proxy: { contentBlocks: Array<{ type: string; [key: string]: unknown }>; structured: unknown }): { content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> } {
  const images = proxy.contentBlocks
    .filter((c) => c.type === "image")
    .map((c) => ({ type: "image" as const, data: String((c as any).data ?? ""), mimeType: String((c as any).mimeType ?? "image/jpeg") }));
  const text = JSON.stringify(proxy.structured ?? {}, null, 2);
  return { content: [...images, { type: "text" as const, text }] };
}
function toolError(prefix: string, err: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  const msg = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text", text: `${prefix}: ${msg}` }], isError: true };
}

/** Refresh the orchyn JWT before it expires. The backend mints 15-minute
 * access tokens, so without renewal every login dies a quarter of an hour in
 * and the user must re-authorize. We renew proactively (decoding the JWT's
 * `exp`) and again whenever the API rejects with 401, persisting the rotated
 * tokens back into the MCP session in KV. */
const REFRESH_LEAD_MS = 60_000;

async function makeClientForSession(env: Env, mcpToken: string, session: McpSession | undefined): Promise<OrchynClient> {
  const staticToken = env.ORCHYN_ACCESS_TOKEN;
  if (!session) {
    // Pre-provisioned deployments authenticate with the static worker token.
    return new OrchynClient(env.ORCHYN_BASE_URL, staticToken ?? "");
  }

  let accessToken = session.orchynAccessToken;
  let refreshToken = session.orchynRefreshToken;

  const persist = async (renewed: OrchynSession): Promise<void> => {
    accessToken = renewed.accessToken;
    refreshToken = renewed.refreshToken ?? refreshToken;
    const user = renewed.user
      ? { id: renewed.user.id, email: renewed.user.email, displayName: renewed.user.displayName }
      : undefined;
    await updateSessionTokens(env, mcpToken, accessToken, refreshToken, user);
  };

  const tryRefresh = async (): Promise<string | undefined> => {
    if (!refreshToken) return undefined;
    try {
      const renewed = await OrchynClient.refreshSession(env.ORCHYN_BASE_URL, refreshToken);
      await persist(renewed);
      return accessToken;
    } catch {
      // Dead refresh token — the client will have to re-authorize.
      return undefined;
    }
  };

  // Proactively refresh an expired/near-expiry access token before calling.
  const exp = jwtExpiry(accessToken);
  if (refreshToken && exp !== undefined && exp * 1000 < Date.now() + REFRESH_LEAD_MS) {
    await tryRefresh();
  }

  return new OrchynClient(env.ORCHYN_BASE_URL, accessToken, tryRefresh);
}

async function clientFor(env: Env, token: string, resolveSession: (t: string) => Promise<McpSession | undefined>): Promise<OrchynClient> {
  const session = await resolveSession(token);
  return makeClientForSession(env, token, session);
}

function createServer(env: Env, resolveSession: (token: string) => Promise<McpSession | undefined>) {
  const server = new McpServer({ name: "orchyn-mcp", version: "1.3.4" });

  server.registerTool(
    "analyze_post",
    {
      title: "Analyze Post",
      description: "Analyze a social post (video, image, carousel/slideshow) from its link — imports the media and runs AI analysis over the actual content (video frames, carousel images, caption). Supports TikTok, Instagram, YouTube and X/Twitter. Returns the full analysis once finished.",
      inputSchema: z.object({ url: z.string().describe("Public post URL (TikTok/Instagram/YouTube/X or shortlinks).") }).strict(),
    },
    async (args: { url: string }, extra: { authInfo?: AuthInfo }) => {
      const token = extra.authInfo?.token ?? "";
      const client = await clientFor(env, token, resolveSession);
      const validation = validatePostUrl(args.url);
      if (!validation.ok) return { content: [{ type: "text", text: `Invalid url: ${validation.error}` }], isError: true };
      try {
        const result = (await runVideoAnalysis(client, validation.url) as unknown) as Record<string, unknown> & { _inlineImages?: Array<{ data: string; mimeType: string }> };
        const images = (result._inlineImages ?? []).map((img) => ({ type: "image" as const, data: String(img.data), mimeType: String(img.mimeType ?? "image/jpeg") }));
        const { _inlineImages: _omit, ...rest } = result;
        return { content: [...images, { type: "text" as const, text: JSON.stringify(rest, null, 2) }] };
      } catch (err) {
        if (err instanceof OrchynError && (err as any).paywall) return { content: [{ type: "text", text: `Analysis blocked: ${formatPaywallError(err as any)}\n\nHTTP ${(err as any).status}: ${(err as any).message}` }], isError: true };
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Analysis failed: ${msg}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "get_social_media",
    {
      title: "Get Social Media",
      description: "Fetch a social post's media from a TikTok, Instagram, YouTube or X/Twitter URL: contentType (video/image/carousel/slideshow), title, caption, author, stats and direct media URLs. Returns an inline thumbnail image. Consumes 1 orchyn credit.",
      inputSchema: z.object({ url: z.string().describe("Full public post URL.") }).strict(),
    },
    async (args: { url: string }, extra: { authInfo?: AuthInfo }) => {
      const token = extra.authInfo?.token ?? "";
      const client = await clientFor(env, token, resolveSession);
      try { return toToolResult(await client.callTool("get_social_media", { url: args.url })); } catch (err) { return toolError("get_social_media failed", err); }
    }
  );

  server.registerTool(
    "discover_social_posts",
    {
      title: "Discover Social Posts",
      description: "Discover recent posts (video, image, carousel, slideshow) for a niche. YouTube via search; TikTok & Instagram via Apify. Each post includes title/caption, thumbnailUrl, externalUrl, views/likes/comments and inline thumbnails (up to 4) so they show in chat. Say \"next\" to paginate (offset), or \"analyze the 2nd one\" / \"analyze all\" for batch analysis. Consumes 2 orchyn credits.",
      inputSchema: z.object({ niche: z.string().describe("Niche/topic, e.g. 'fitness'."), keywords: z.string().optional().describe("Optional extra keywords."), limit: z.number().int().optional().describe("Max results (default 6)."), offset: z.number().int().optional().describe("Skip first N results — for 'next' pagination."), platform: z.enum(["youtube", "tiktok", "instagram", "any"]).optional().describe("Platform to search (default youtube).") }).strict(),
    },
    async (args: { niche: string; keywords?: string; limit?: number; offset?: number; platform?: string }, extra: { authInfo?: AuthInfo }) => {
      const token = extra.authInfo?.token ?? "";
      const client = await clientFor(env, token, resolveSession);
      try { return toToolResult(await client.callTool("discover_social_posts", { ...args })); } catch (err) { return toolError("discover_social_posts failed", err); }
    }
  );

  server.registerTool(
    "understand_social_post",
    {
      title: "Understand Social Post",
      description: "Import a social post URL AND understand it with multimodal AI over the actual video/images: summary, hook strength, viral triggers, format breakdown and variation ideas. Includes the thumbnail. Consumes 10 orchyn credits.",
      inputSchema: z.object({ url: z.string().describe("Full public post URL (TikTok/Instagram/YouTube)."), focus: z.string().optional().describe("Extra instruction, e.g. 'focus on the CTA'.") }).strict(),
    },
    async (args: { url: string; focus?: string }, extra: { authInfo?: AuthInfo }) => {
      const token = extra.authInfo?.token ?? "";
      const client = await clientFor(env, token, resolveSession);
      try { return toToolResult(await client.callTool("understand_social_post", { ...args })); } catch (err) { return toolError("understand_social_post failed", err); }
    }
  );

  server.registerTool(
    "check_orchyn_credits",
    {
      title: "Check Orchyn Credits",
      description: "Check your MCP credit balance, billing URL and pack size. No cost — call anytime to see remaining credits before running other tools.",
      inputSchema: z.object({}).strict(),
    },
    async (_args: Record<string, never>, extra: { authInfo?: AuthInfo }) => {
      const token = extra.authInfo?.token ?? "";
      const client = await clientFor(env, token, resolveSession);
      try { return toToolResult(await client.callTool("check_orchyn_credits", {})); } catch (err) { return toolError("check_orchyn_credits failed", err); }
    }
  );

  server.registerTool(
    "buy_orchyn_credits",
    {
      title: "Buy Orchyn Credits",
      description: "Buy an MCP credit pack via Stripe Checkout. Returns a secure checkout URL — open it in your browser to pay. Credits are added automatically after payment. No cost to call.",
      inputSchema: z.object({}).strict(),
    },
    async (_args: Record<string, never>, extra: { authInfo?: AuthInfo }) => {
      const token = extra.authInfo?.token ?? "";
      const client = await clientFor(env, token, resolveSession);
      try { return toToolResult(await client.callTool("buy_orchyn_credits", {})); } catch (err) { return toolError("buy_orchyn_credits failed", err); }
    }
  );

  return server;
}

export class McpEndpoint {
  private ctx: DurableObjectState;
  private env: Env;
  private transport?: WebStandardStreamableHTTPServerTransport;
  private server?: McpServer;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const token = bearerToken(request);
    const session = token ? await verifyToken(this.env, token) : undefined;
    if (!token || !(await validMcpToken(this.env, token))) {
      return jsonResponse(401, {
        error: "Unauthorized",
        error_description:
          "This MCP server requires OAuth authentication. Fetch an access token from " +
          `${this.env.PUBLIC_URL}/authorize first.`,
      });
    }

    if (!this.transport) {
      this.transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: () => this.ctx.id.name ?? this.ctx.id.toString(),
        enableJsonResponse: true,
        onsessioninitialized: () => {},
      });
      this.server = createServer(this.env, async (t: string) => {
        // Always re-read from KV so tokens rotated by a refresh on a previous
        // tool call (makeClientForSession) are picked up.
        return verifyToken(this.env, t);
      });
      await this.server.connect(this.transport);
    }

    const authInfo: AuthInfo | undefined = token
      ? {
          token,
          clientId: session?.clientId ?? "orchyn-mcp",
          scopes: session?.scopes ?? ["analyze:video"],
          expiresAt: session ? Math.floor(session.expiresAt / 1000) : Math.floor(Date.now() / 1000) + 3600,
        }
      : undefined;

    try {
      return await this.transport.handleRequest(request, { authInfo });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return jsonResponse(500, { error: `Internal error: ${msg}` });
    }
  }
}

function bearerToken(request: Request): string | undefined {
  const header = request.headers.get("authorization");
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : undefined;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "Cache-Control": "no-store" },
  });
}
