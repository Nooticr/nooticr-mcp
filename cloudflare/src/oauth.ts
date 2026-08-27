/**
 * OAuth 2.0 authorization server (RFC 6749 + RFC 7636 PKCE) for the
 * Cloudflare Worker deployment of orchyn-mcp.
 *
 * The MCP client (Claude, OpenAI, Cursor) redirects to /authorize; the user
 * signs in with their orchyn email/password (the orchyn Google loopback flow
 * only works for localhost deployments). On success the browser is redirected
 * back to the client with a one-time code, exchanged at /token for an MCP
 * access token bound to the user's orchyn session.
 *
 * State lives in KV (codes and sessions are short-lived).
 */

export const SCOPE = "analyze:video";
// MCP session lifetime. Sessions now self-renew their orchyn access token, so
// a login should last as long as the account's refresh token (30 days server-
// side) rather than forcing a re-login every hour.
export const TOKEN_TTL_SECONDS = 604800;
export const PENDING_TTL_SECONDS = 600;
export const LOGIN_RATE_LIMIT = { max: 10, windowSeconds: 300 };

export interface McpSession {
  orchynAccessToken: string;
  orchynRefreshToken?: string;
  orchynUser?: { id: string; email?: string; displayName?: string };
  clientId: string;
  scopes: string[];
  expiresAt: number;
}

export function isLoopbackUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:") return false;
  const host = parsed.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

/** redirect_uri must be loopback (http://localhost|127.0.0.1|[::1]) or any https URL. */
export function isAllowedRedirectUri(uri: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (parsed.protocol === "https:") return true;
  if (parsed.protocol === "http:" && isLoopbackUrl(uri)) return true;
  return false;
}

export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function verifyPkce(codeVerifier: string, codeChallenge: string): Promise<boolean> {
  if (!codeVerifier || !codeChallenge) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const bytes = new Uint8Array(digest);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  const b64 = btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return b64 === codeChallenge;
}

export function authorizationServerMetadata(publicUrl: string) {
  return {
    issuer: publicUrl,
    authorization_endpoint: `${publicUrl}/authorize`,
    token_endpoint: `${publicUrl}/token`,
    registration_endpoint: `${publicUrl}/register`,
    response_types_supported: ["code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [SCOPE],
    grant_types_supported: ["authorization_code"],
  };
}

export function protectedResourceMetadata(publicUrl: string) {
  return {
    resource: `${publicUrl}/mcp`,
    authorization_servers: [publicUrl],
  };
}

export interface PendingAuthorization {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  mcpAuthCode: string;
  clientState?: string;
  createdAt: number;
  orchynAccessToken: string;
  orchynRefreshToken?: string;
  orchynUser?: McpSession["orchynUser"];
}

const pendKey = (code: string) => `pend:${code}`;
const sessKey = (token: string) => `sess:${token}`;
const rateKey = (ip: string) => `rate:${ip}`;

export async function storePending(env: Env, pending: PendingAuthorization): Promise<void> {
  await env.STORE.put(pendKey(pending.mcpAuthCode), JSON.stringify(pending), {
    expirationTtl: PENDING_TTL_SECONDS,
  });
}

export async function loadPending(env: Env, code: string): Promise<PendingAuthorization | undefined> {
  const raw = await env.STORE.get(pendKey(code));
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as PendingAuthorization;
  } catch {
    return undefined;
  }
}

export async function deletePending(env: Env, code: string): Promise<void> {
  await env.STORE.delete(pendKey(code));
}

export async function storeSession(env: Env, token: string, session: McpSession): Promise<void> {
  await env.STORE.put(sessKey(token), JSON.stringify(session), {
    expirationTtl: TOKEN_TTL_SECONDS,
  });
}

/**
 * Rotates the orchyn tokens inside a stored MCP session and extends its
 * lifetime. Called after a refresh so the next tool call picks up the fresh
 * access token instead of a 15-minute-expired one. No-op when the session is
 * gone (already expired or evicted).
 */
export async function updateSessionTokens(
  env: Env,
  token: string,
  accessToken: string,
  refreshToken?: string,
  orchynUser?: McpSession["orchynUser"]
): Promise<void> {
  const raw = await env.STORE.get(sessKey(token));
  if (!raw) return;
  try {
    const session = JSON.parse(raw) as McpSession;
    session.orchynAccessToken = accessToken;
    if (refreshToken) session.orchynRefreshToken = refreshToken;
    if (orchynUser) session.orchynUser = orchynUser;
    session.expiresAt = Date.now() + TOKEN_TTL_SECONDS * 1000;
    await storeSession(env, token, session);
  } catch {
    // Leave the session as-is; the 401 path will force the client to re-login.
  }
}

export async function verifyToken(env: Env, token: string): Promise<McpSession | undefined> {
  const raw = await env.STORE.get(sessKey(token));
  if (!raw) return undefined;
  try {
    const session = JSON.parse(raw) as McpSession;
    if (Date.now() > session.expiresAt) {
      await env.STORE.delete(sessKey(token));
      return undefined;
    }
    return session;
  } catch {
    return undefined;
  }
}

/** True when a bearer token is valid: OAuth-issued or the env static token. */
export async function validMcpToken(env: Env, token: string): Promise<boolean> {
  if (await verifyToken(env, token)) return true;
  const envToken = env.ORCHYN_ACCESS_TOKEN;
  return typeof envToken === "string" && envToken.length > 0 && token === envToken;
}

export async function isRateLimited(env: Env, ip: string): Promise<boolean> {
  const key = rateKey(ip);
  const count = Number((await env.STORE.get(key)) ?? "0");
  if (count >= LOGIN_RATE_LIMIT.max) return true;
  await env.STORE.put(key, String(count + 1), { expirationTtl: LOGIN_RATE_LIMIT.windowSeconds });
  return false;
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
