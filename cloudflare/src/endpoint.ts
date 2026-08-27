import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { OrchynClient, jwtExpiry, type TokenProvider } from "../../src/shared/orchyn.js";
import { createMcpServer } from "../../src/shared/tools.js";
import { verifyToken, validMcpToken, updateSessionTokens, type McpSession } from "./oauth.js";

/** Refresh the orchyn JWT before it expires. The backend mints 15-minute
 * access tokens, so without renewal every login dies a quarter of an hour in
 * and the user must re-authorize. We renew proactively (decoding the JWT's
 * `exp`) and again whenever the API rejects with 401, persisting the rotated
 * tokens back into the MCP session in KV. */
const REFRESH_LEAD_MS = 60_000;

/**
 * Builds a client for one MCP session. The shared `OrchynClient` gets a
 * `TokenProvider` that resolves the session's orchyn token from this closure,
 * refreshes it (proactively before expiry and again on 401), and persists the
 * rotated tokens into the KV session so the next tool call uses a live token.
 * Pre-provisioned deployments (env.ORCHYN_ACCESS_TOKEN) get a static-token
 * provider and never refresh.
 */
async function makeClientForSession(
  env: Env,
  mcpToken: string,
  session: McpSession | undefined
): Promise<OrchynClient> {
  const staticToken = env.ORCHYN_ACCESS_TOKEN;
  if (!session) {
    return new OrchynClient(env.ORCHYN_BASE_URL, {
      getAccessToken: async () => staticToken ?? "",
    });
  }

  let accessToken = session.orchynAccessToken;
  let refreshToken = session.orchynRefreshToken;

  const doRefresh = async (): Promise<boolean> => {
    if (!refreshToken) return false;
    try {
      const renewed = await OrchynClient.refreshSession(env.ORCHYN_BASE_URL, refreshToken);
      accessToken = renewed.accessToken;
      refreshToken = renewed.refreshToken ?? refreshToken;
      const user = renewed.user
        ? { id: renewed.user.id, email: renewed.user.email, displayName: renewed.user.displayName }
        : undefined;
      await updateSessionTokens(env, mcpToken, accessToken, refreshToken, user);
      return true;
    } catch {
      // Dead refresh token — the client will have to re-authorize.
      return false;
    }
  };

  const provider: TokenProvider = {
    getAccessToken: async () => accessToken,
    onUnauthorized: doRefresh,
  };

  // Proactively refresh an expired/near-expiry access token before calling.
  const exp = jwtExpiry(accessToken);
  if (refreshToken && exp !== undefined && exp * 1000 < Date.now() + REFRESH_LEAD_MS) {
    await doRefresh();
  }

  return new OrchynClient(env.ORCHYN_BASE_URL, provider);
}

export class McpEndpoint {
  private ctx: DurableObjectState;
  private env: Env;
  private transport?: WebStandardStreamableHTTPServerTransport;
  private server?: ReturnType<typeof createMcpServer>;

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
      this.server = createMcpServer(async (ctx) => {
        // Re-read from KV each call so tokens rotated by a refresh on a
        // previous tool call (makeClientForSession) are picked up.
        const t = ctx.authInfo?.token ?? "";
        const s = await verifyToken(this.env, t);
        return makeClientForSession(this.env, t, s);
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
