import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";
import { OrchynClient, OrchynError } from "./orchyn.js";
import { validateVideoUrl, runVideoAnalysis, formatPaywallError, JobTimeoutError } from "./video.js";
import { verifyToken, validMcpToken } from "./oauth.js";

const TOOL_NAME = "analyze_video";
const TOOL_INPUT = z.object({
  url: z.string().describe("Public video URL (tiktok.com, instagram.com, youtube.com, youtu.be)."),
});

function createServer(env: Env, resolveSession: (token: string) => Promise<{ clientId?: string; scopes?: string[] } | undefined>) {
  const server = new McpServer({ name: "orchyn-mcp", version: "1.0.0" });

  server.registerTool(
    TOOL_NAME,
    {
      title: "Analyze Video",
      description:
        "Start an AI analysis of a TikTok, Instagram, or YouTube video from its link. " +
        "Requires a connected orchyn account; consumes orchyn credits (first analysis free). " +
        "Returns the analysis result once finished.",
      inputSchema: TOOL_INPUT,
    },
    async (args: { url: string }, extra: { authInfo?: AuthInfo }) => {
      const token = extra.authInfo?.token ?? "";
      const session = await resolveSession(token);
      const accessToken = session ? (session as { orchynAccessToken: string }).orchynAccessToken : env.ORCHYN_ACCESS_TOKEN ?? "";
      const client = new OrchynClient(env.ORCHYN_BASE_URL, accessToken);
      const validation = validateVideoUrl(args.url);
      if (!validation.ok) {
        return { content: [{ type: "text", text: `Invalid url: ${validation.error}` }], isError: true };
      }
      const timeoutMs = env.POLL_TIMEOUT_MS ? Number.parseInt(env.POLL_TIMEOUT_MS, 10) : 120_000;
      try {
        const result = await runVideoAnalysis(client, validation.url, { timeoutMs });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        if (err instanceof OrchynError && err.paywall) {
          return {
            content: [{ type: "text", text: `Analysis blocked: ${formatPaywallError(err)}\n\nHTTP ${err.status}: ${err.message}` }],
            isError: true,
          };
        }
        if (err instanceof JobTimeoutError) {
          return { content: [{ type: "text", text: String(err) + " The job is still running server-side; re-invoke the tool to check it." }], isError: true };
        }
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Video analysis failed: ${msg}` }], isError: true };
      }
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
        const s = t === token ? session : await verifyToken(this.env, t);
        return s ? { clientId: s.clientId, scopes: s.scopes, orchynAccessToken: s.orchynAccessToken } : undefined;
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
