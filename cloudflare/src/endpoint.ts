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
  /** Track whether the transport has completed its initialize handshake.
   *  The SDK's `_initialized` is private — we maintain our own flag via
   *  the `onsessioninitialized` callback. */
  private initialized = false;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  private async ensureServer() {
    if (this.transport && this.server) return;
    this.transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => this.ctx.id.name ?? this.ctx.id.toString(),
      // enableJsonResponse: true buffers the entire response before sending.
      // For long-running tools (20-70s), ChatGPT's client times out waiting.
      // Default (false) streams via SSE, which ChatGPT handles correctly.
      onsessioninitialized: () => {
        this.initialized = true;
        console.log(`[mcp] session initialized for DO ${this.ctx.id.name}`);
      },
    });
    this.server = createMcpServer(async (ctx) => {
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

    await this.ensureServer();
    const transport = this.transport!;

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

    // Sniff the JSON-RPC method to handle initialize vs. other requests.
    const method =
      request.headers.get("mcp-method") ??
      (await sniffMethod(request.clone() as unknown as McpRequest));
    const methodLabel = method || "unknown";
    const contentLength = request.headers.get("content-length") ?? "?";
    console.log(`[mcp] ${request.method} method=${methodLabel} len=${contentLength} initialized=${this.initialized}`);

    if (method === "initialize") {
      const res = await this.wrapHandle(transport, request as unknown as McpRequest, authInfo);
      console.log(`[mcp] initialize → ${res.status}`);
      return res;
    }

    // Non-initialize on a cold transport: re-run the initialize handshake
    // so the SDK accepts subsequent requests. Only do this ONCE — our own
    // `initialized` flag tracks it (the SDK's `_initialized` is private).
    if (!this.initialized) {
      console.log("[mcp] re-initializing transport (cold DO)");
      await this.reInitialize(transport, authInfo);
    }

    const res = await this.wrapHandle(transport, request as unknown as McpRequest, authInfo);
    const resCT = res.headers.get("content-type") ?? "?";
    const resCL = res.headers.get("content-length") ?? "?";
    console.log(`[mcp] ${methodLabel} → ${res.status} ct=${resCT} cl=${resCL}`);
    // For tool calls, log a snippet of the response body for debugging
    if (methodLabel === "tools/call") {
      try {
        const body = await res.clone().text();
        console.log(`[mcp] tools/call response (${body.length} bytes): ${body.substring(0, 500)}`);
      } catch {}
    }
    return res;
  }

  /**
   * Re-run the MCP initialize + initialized handshake so a cold
   * (post-eviction) transport accepts non-initialize requests.
   */
  private async reInitialize(
    transport: WebStandardStreamableHTTPServerTransport,
    authInfo: AuthInfo | undefined
  ) {
    const sessionId = this.ctx.id.name ?? this.ctx.id.toString();
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-session-id": sessionId,
      "mcp-protocol-version": PROTOCOL_VERSION,
    };
    // 1. Send initialize
    const initReq = new Request("https://mcp.orchyn.com/mcp", {
      method: "POST",
      headers,
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
    // Consume the response body so the stream is released
    await initRes.text().catch(() => "");

    // 2. Send initialized notification (required by the protocol)
    const notifReq = new Request("https://mcp.orchyn.com/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    }) as unknown as McpRequest;
    const notifRes = await transport.handleRequest(notifReq, { authInfo });
    await notifRes.text().catch(() => "");
    console.log("[mcp] re-initialization complete");
  }

  private async wrapHandle(
    transport: WebStandardStreamableHTTPServerTransport,
    request: McpRequest,
    authInfo: AuthInfo | undefined
  ): Promise<Response> {
    const start = Date.now();
    try {
      const res = await transport.handleRequest(request, { authInfo });
      const elapsed = Date.now() - start;
      console.log(`[mcp] wrapHandle took ${elapsed}ms → status=${res.status} ct=${res.headers.get("content-type") ?? "?"}`);
      return res;
    } catch (err) {
      const elapsed = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack?.substring(0, 300) : "";
      console.error(`[mcp] wrapHandle ERROR after ${elapsed}ms: ${msg} ${stack}`);
      return jsonResponse(500, {
        jsonrpc: "2.0",
        error: { code: -32603, message: `Internal error: ${msg}` },
        id: null,
      });
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
