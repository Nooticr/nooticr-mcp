/**
 * Hand-rolled OAuth 2.0 authorization server (RFC 6749 + RFC 7636 PKCE)
 * implementing the MCP 2025-03-26 OAuth spec subset needed by Claude
 * Desktop, Cursor, and OpenAI Agents SDK:
 *
 *   GET  /.well-known/oauth-authorization-server
 *   GET  /.well-known/oauth-protected-resource
 *   GET  /authorize            (Authorization Code + PKCE S256)
 *   POST /token                (public client, no client auth)
 *   GET  /oauth/callback       (our own loopback: orchyn Google sign-in result)
 *
 * The MCP access tokens issued at /token are opaque random strings bound to
 * the orchyn JWT obtained through the Google sign-in flow.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { OrchynClient, OrchynSession } from "./shared/orchyn.js";
import {
  LEGACY_SCOPE,
  SCOPE,
  SCOPES,
  parseScopes,
  unsupportedScopes,
  escapeHtml,
  isAllowedRedirectUri,
  randomToken,
  verifyPkce,
} from "./shared/oauth.js";

// Re-export the shared primitives so consumers and tests keep one import path.
export {
  LEGACY_SCOPE,
  SCOPE,
  SCOPES,
  verifyPkce,
  isAllowedRedirectUri,
  isLoopbackUrl,
  escapeHtml,
  generateState,
} from "./shared/oauth.js";

// MCP session lifetime. Sessions self-renew their orchyn access token, so a
// login lasts as long as the account's refresh token (30 days server-side)
// rather than forcing a re-login every hour.
export const TOKEN_TTL_SECONDS = 604800;

export interface McpSession {
  orchynAccessToken: string;
  orchynRefreshToken?: string;
  orchynUser?: { id: string; email?: string; displayName?: string };
  clientId: string;
  scopes: string[];
  expiresAt: number;
}

interface PendingAuthorization {
  orchynState: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  mcpAuthCode: string;
  clientState?: string;
  createdAt: number;
  completed?: boolean;
  orchynAccessToken?: string;
  orchynRefreshToken?: string;
  orchynUser?: McpSession["orchynUser"];
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}

function sendRedirect(res: ServerResponse, location: string): void {
  res.writeHead(302, {
    location,
    "cache-control": "no-store",
  });
  res.end();
}

function sendHtml(res: ServerResponse, status: number, title: string, body: string): void {
  const payload = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(payload);
}

export interface OAuthManagerOptions {
  publicUrl: string;
  client: OrchynClient;
  /**
   * Called with the completed orchyn session (Google sign-in) so callers can
   * persist it to the token file as a courtesy. Optional.
   */
  onSession?: (session: OrchynSession) => Promise<void>;
}

export class OAuthManager {
  private publicUrl: string;
  private client: OrchynClient;
  private onSession?: (session: OrchynSession) => Promise<void>;

  private pendingByOrchynState = new Map<string, PendingAuthorization>();
  private pendingByMcpCode = new Map<string, PendingAuthorization>();
  private sessions = new Map<string, McpSession>();

  constructor(opts: OAuthManagerOptions) {
    this.publicUrl = opts.publicUrl.replace(/\/+$/, "");
    this.client = opts.client;
    this.onSession = opts.onSession;
  }

  /** GET /.well-known/oauth-authorization-server */
  authorizationServerMetadata() {
    return {
      issuer: this.publicUrl,
      authorization_endpoint: `${this.publicUrl}/authorize`,
      token_endpoint: `${this.publicUrl}/token`,
      response_types_supported: ["code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: [...SCOPES],
      grant_types_supported: ["authorization_code"],
    };
  }

  /** GET /.well-known/oauth-protected-resource */
  protectedResourceMetadata() {
    return {
      resource: `${this.publicUrl}/mcp`,
      authorization_servers: [this.publicUrl],
    };
  }

  /** Verifies an MCP access token; returns the bound session or undefined. */
  verifyToken(token: string): McpSession | undefined {
    const session = this.sessions.get(token);
    if (!session) return undefined;
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(token);
      return undefined;
    }
    return session;
  }

  async handleAuthorize(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", this.publicUrl);
    const params = url.searchParams;

    if (params.get("response_type") !== "code") {
      return this.sendAuthorizeError(res, params, "unsupported_response_type",
        "The authorization server only supports response_type=code.");
    }
    const codeChallenge = params.get("code_challenge") ?? "";
    const method = params.get("code_challenge_method") ?? "";
    if (!codeChallenge || method !== "S256") {
      return this.sendAuthorizeError(res, params, "invalid_request",
        "PKCE is required: code_challenge and code_challenge_method=S256 must be provided.");
    }
    const clientId = params.get("client_id") ?? "";
    if (!clientId) {
      return this.sendAuthorizeError(res, params, "invalid_request",
        "Missing client_id.");
    }
    const redirectUri = params.get("redirect_uri") ?? "";
    if (!redirectUri || !isAllowedRedirectUri(redirectUri)) {
      return this.sendAuthorizeError(res, params, "invalid_request",
        "redirect_uri must be a loopback http://localhost, http://127.0.0.1, http://[::1] URL or an https URL.");
    }
    const scope = params.get("scope") ?? SCOPE;
    const scopes = parseScopes(scope);
    const unsupported = unsupportedScopes(scope);
    if (unsupported.length > 0) {
      return this.sendAuthorizeError(res, params, "invalid_scope",
        `Unsupported scope(s): ${unsupported.join(", ")}. Supported: ${SCOPES.join(", ")}.`);
    }

    const orchynState = randomToken();
    const mcpAuthCode = randomToken();
    const pending: PendingAuthorization = {
      orchynState,
      clientId,
      redirectUri,
      codeChallenge,
      scopes,
      mcpAuthCode,
      clientState: params.get("state") ?? undefined,
      createdAt: Date.now(),
    };
    this.pendingByOrchynState.set(orchynState, pending);
    this.pendingByMcpCode.set(mcpAuthCode, pending);

    // Ask the orchyn server to start a Google sign-in. We pre-seed ?state=
    // with our own pending-request id; orchyn appends
    // ?code=<completion>&redirect=... when it redirects back to us.
    const ourCallback = `${this.publicUrl}/oauth/callback?state=${encodeURIComponent(orchynState)}`;
    let redirectUrl: string;
    try {
      const res = await this.client.startGoogleSignIn(ourCallback);
      redirectUrl = res.redirectUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return sendHtml(res, 502, "orchyn-mcp: sign-in unavailable",
        `<p>Could not reach the orchyn server to start sign-in: ${escapeHtml(msg)}</p>`);
    }
    return sendRedirect(res, redirectUrl);
  }

  /** GET /oauth/callback?state=<ours>&code=<orchyn completion code>&redirect=<path> */
  async handleCallback(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", this.publicUrl);
    const orchynState = url.searchParams.get("state") ?? "";
    const completionCode = url.searchParams.get("code") ?? "";
    const pending = this.pendingByOrchynState.get(orchynState);
    if (!pending) {
      return sendHtml(res, 400, "orchyn-mcp: sign-in failed",
        "<p>Unknown or expired sign-in request. Please close this tab and try again.</p>");
    }
    if (!completionCode) {
      return sendHtml(res, 400, "orchyn-mcp: sign-in failed",
        "<p>The orchyn sign-in did not return a completion code. Please close this tab and try again.</p>");
    }

    let session: OrchynSession;
    try {
      session = await this.client.exchangeCompletionCode(completionCode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return sendHtml(res, 502, "orchyn-mcp: sign-in failed",
        `<p>Could not complete sign-in with the orchyn server: ${escapeHtml(msg)}</p>`);
    }

    pending.completed = true;
    pending.orchynAccessToken = session.accessToken;
    pending.orchynRefreshToken = session.refreshToken;
    pending.orchynUser = session.user
      ? { id: session.user.id, email: session.user.email, displayName: session.user.displayName }
      : undefined;

    // Courtesy persistence so stdio/CLI runs can reuse this session.
    try {
      await this.onSession?.(session);
    } catch {
      // Non-fatal: the in-memory session still works.
    }

    // Redirect the browser back to the MCP client with our one-time code.
    const clientRedirect = new URL(pending.redirectUri);
    clientRedirect.searchParams.set("code", pending.mcpAuthCode);
    if (pending.clientState) {
      clientRedirect.searchParams.set("state", pending.clientState);
    }
    return sendRedirect(res, clientRedirect.toString());
  }

  /** POST /token (form-encoded, public client, PKCE verified) */
  async handleToken(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let bodyText: string;
    try {
      bodyText = await readBody(req);
    } catch {
      return sendJson(res, 400, { error: "invalid_request" });
    }
    const params = new URLSearchParams(bodyText);
    const grantType = params.get("grant_type");
    if (grantType !== "authorization_code") {
      return sendJson(res, 400, {
        error: "unsupported_grant_type",
        error_description: "Only grant_type=authorization_code is supported.",
      });
    }
    const code = params.get("code") ?? "";
    const pending = this.pendingByMcpCode.get(code);
    if (!pending || !pending.completed) {
      return sendJson(res, 400, { error: "invalid_grant", error_description: "Unknown or incomplete authorization code." });
    }
    const clientId = params.get("client_id") ?? "";
    if (pending.clientId !== clientId) {
      return sendJson(res, 400, { error: "invalid_grant", error_description: "client_id does not match the authorization request." });
    }
    const redirectUri = params.get("redirect_uri");
    if (redirectUri !== null && redirectUri !== pending.redirectUri) {
      return sendJson(res, 400, { error: "invalid_grant", error_description: "redirect_uri does not match the authorization request." });
    }
    const codeVerifier = params.get("code_verifier") ?? "";
    if (!(await verifyPkce(codeVerifier, pending.codeChallenge))) {
      return sendJson(res, 400, { error: "invalid_grant", error_description: "PKCE verification failed." });
    }

    this.pendingByMcpCode.delete(code);
    this.pendingByOrchynState.delete(pending.orchynState);

    const accessToken = randomToken();
    this.sessions.set(accessToken, {
      orchynAccessToken: pending.orchynAccessToken ?? "",
      orchynRefreshToken: pending.orchynRefreshToken,
      orchynUser: pending.orchynUser,
      clientId: pending.clientId,
      scopes: pending.scopes,
      expiresAt: Date.now() + TOKEN_TTL_SECONDS * 1000,
    });

    return sendJson(res, 200, {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: TOKEN_TTL_SECONDS,
      scope: pending.scopes.join(" "),
    });
  }

  private sendAuthorizeError(
    res: ServerResponse,
    params: URLSearchParams,
    error: string,
    description: string
  ): void {
    const redirectUri = params.get("redirect_uri") ?? "";
    if (redirectUri && isAllowedRedirectUri(redirectUri)) {
    const target = new URL(redirectUri);
    target.searchParams.set("error", error);
    target.searchParams.set("error_description", description);
    const state = params.get("state");
    if (state) target.searchParams.set("state", state);
    return sendRedirect(res, target.toString());
    }
    return sendHtml(res, 400, "orchyn-mcp: bad request", `<p>${escapeHtml(description)}</p>`);
  }
}
