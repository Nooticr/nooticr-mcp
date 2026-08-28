import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

// The SDK's WebStandard transport consumes the platform `fetch` Request type.
// CF workers' `Request` is a generic instantiation of the same interface, but
// they disagree on the Cf second type arg, so we need a stable alias for the
// SDK flavor when passing through `handleRequest`.
type McpRequest = Parameters<
  WebStandardStreamableHTTPServerTransport["handleRequest"]
>[0];
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { OrchynClient, jwtExpiry, type TokenProvider } from "../../src/shared/orchyn.js";
import { createMcpServer, MCP_SERVER_VERSION } from "../../src/shared/tools.js";
import {
  verifyToken,
  validMcpToken,
  updateSessionTokens,
  deleteSession,
  type McpSession,
} from "./oauth.js";

/**
 * Protocol version advertised during re-init. Must be >= 2025-11-25 so the
 * SDK sends proper priming events and supports resumability. ChatGPT sends
 * the latest protocol version and may reject responses that don't match.
 */
const PROTOCOL_VERSION = "2025-11-25";

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
      // Dead refresh token — there is no way to renew. Drop the MCP session so
      // the *next* request fails with a clean 401 from the session layer (the
      // client re-authorizes) instead of silently sending an expired access
      // token to the orchyn backend forever.
      await deleteSession(env, mcpToken).catch(() => {});
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

/**
 * MCP endpoint for the orchyn-mcp Cloudflare Worker.
 *
 * Session handling lives on a Durable Object (one per `mcp-session-id`) so the
 * MCP `initialize` ↔ handleRequest state is kept per client. Cloudflare may
 * evict a DO's in-memory JS state while idle; when that happens a brand-new
 * transport is built per fetch. That is fine — this DO keeps the MCP server
 * "always initialized" by re-running the initialize handshake internally on a
 * cold start before dispatching the client's request, so a client's next call
 * (tools/list, tools/call) works instead of returning
 * `400 "Server not initialized"`.
 */
export class McpEndpoint {
  private ctx: DurableObjectState;
  private env: Env;
  private transport?: WebStandardStreamableHTTPServerTransport;
  private server?: ReturnType<typeof createMcpServer>;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  private async ensureServer() {
    if (this.transport && this.server) return;
    this.transport = new WebStandardStreamableHTTPServerTransport({
      // The DO instance *is* the session, so the transport reuses the DO name
      // (the mcp-session-id). This makes the transport's own session id stable
      // and lets the SDK validate the Mcp-Session-Id header across evictions
      // once we re-initialize on cold start.
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

    // Lazy-build the server/transport on first fetch to this DO instance.
    // `ensureServer` is idempotent within the lifetime of one DO instance; a
    // fresh instance (post-eviction) builds an un-initialized transport, which
    // the SDK would reject with 400 for any non-initialize request. We fix
    // that by re-running the initialize handshake internally below.
    await this.ensureServer();
    const transport = this.transport!;
    const server = this.server!;

    const authInfo: AuthInfo | undefined = token
      ? {
          token,
          clientId: session?.clientId ?? "orchyn-mcp",
          scopes: session?.scopes ?? ["analyze:video"],
          expiresAt: session
            ? Math.floor(session.expiresAt / 1000)
            : Math.floor(Date.now() / 1000) + 3600,
        }
      : undefined;

    // Is this the initialize request itself? Then let the transport handle it
    // normally — the SDK marks the session initialized and returns the id.
    const method =
      request.headers.get("mcp-method") ??
      (await sniffMethod(request.clone() as unknown as McpRequest));

    if (method === "initialize") {
      return this.wrapHandle(transport, request as unknown as McpRequest, authInfo);
    }

    // Non-initialize request on a fresh (post-eviction) transport: the SDK
    // requires the session to be initialized first. Re-run initialize so the
    // transport accepts the client's request, mirroring what the client's
    // original initialize did. We construct an internal initialize message and
    // let the SDK's statefulness apply, then dispatch the real request.
    if (!(transport as unknown as { _initialized?: boolean })._initialized) {
      // Re-run the initialize handshake internally so a cold (post-eviction)
      // transport accepts a client's non-initialize request. The transport's
      // `sessionIdGenerator` returns this DO's name, which matches the
      // Mcp-Session-Id header Claude sends, so validation passes after init.
      const initReq = new Request(request.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: request.headers.get("authorization") ?? "",
          "mcp-session-id": this.ctx.id.name ?? this.ctx.toString(),
          "mcp-protocol-version": PROTOCOL_VERSION,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: "orchyn-mcp", version: MCP_SERVER_VERSION },
          },
        }),
      }) as unknown as McpRequest;
      const initRes = await transport.handleRequest(initReq, { authInfo });
      const initText = await initRes.text().catch(() => "");
      // Whether or not re-init succeeded, hand the real request to the SDK.
      // If re-init worked the transport is initialized and the request is
      // accepted; if it didn't, the client still gets a JSON-RPC reply rather
      // than a hard 400 shell.
      return this.wrapHandle(transport, request as unknown as McpRequest, authInfo);
    }

    return this.wrapHandle(transport, request as unknown as McpRequest, authInfo);
  }

  private async wrapHandle(
    transport: WebStandardStreamableHTTPServerTransport,
    request: McpRequest,
    authInfo: AuthInfo | undefined
  ): Promise<Response> {
    try {
      return await transport.handleRequest(request, { authInfo });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return jsonResponse(500, { error: `Internal error: ${msg}` });
    }
  }
}

/** Sniffs the JSON-RPC `method` from a request body without consuming it. */
async function sniffMethod(request: McpRequest): Promise<string> {
  const cloned = request.clone();
  const contentType = cloned.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return "";
  try {
    const body = await cloned.text();
    const parsed = JSON.parse(body);
    const messages = Array.isArray(parsed) ? parsed : [parsed];
    for (const m of messages) {
      if (m && typeof m.method === "string") return m.method;
    }
  } catch {
    return "";
  }
  return "";
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
