/**
 * OAuth 2.0 authorization server (RFC 6749 + RFC 7636 PKCE) for the
 * Cloudflare Worker deployment of nooticr-mcp.
 *
 * The MCP client (Claude, OpenAI, Cursor) redirects to /authorize; the user
 * signs in with their nooticr email/password (the nooticr Google loopback flow
 * only works for localhost deployments). On success the browser is redirected
 * back to the client with a one-time code, exchanged at /token for an MCP
 * access token bound to the user's nooticr session.
 *
 * State lives in KV (codes and sessions are short-lived). The pure OAuth
 * primitives (PKCE, redirect validation, metadata) come from
 * `src/shared/oauth.ts` — the same code the Node package uses.
 */

import { forwardedSession, looksLikeApiKey } from "../../src/shared/api-key.js";
import {
  SCOPE,
  escapeHtml,
  isAllowedRedirectUri,
  isLoopbackUrl,
  randomToken,
  verifyPkce,
  authorizationServerMetadata,
  protectedResourceMetadata,
} from "../../src/shared/oauth.js";

// Re-export the shared primitives so cloudflare/src/index.ts keeps importing
// them from one place.
export {
  SCOPE,
  SCOPES,
  parseScopes,
  unsupportedScopes,
  escapeHtml,
  isAllowedRedirectUri,
  isLoopbackUrl,
  randomToken,
  verifyPkce,
  authorizationServerMetadata,
  protectedResourceMetadata,
} from "../../src/shared/oauth.js";

// MCP session lifetime. Sessions now self-renew their nooticr access token, so
// a login should last as long as the account's refresh token (30 days server-
// side) rather than forcing a re-login every hour.
export const TOKEN_TTL_SECONDS = 604800;
export const PENDING_TTL_SECONDS = 600;
export const LOGIN_RATE_LIMIT = { max: 10, windowSeconds: 300 };

export interface McpSession {
  nooticrAccessToken: string;
  nooticrRefreshToken?: string;
  nooticrUser?: { id: string; email?: string; displayName?: string };
  clientId: string;
  scopes: string[];
  expiresAt: number;
}

export interface PendingAuthorization {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  mcpAuthCode: string;
  clientState?: string;
  createdAt: number;
  nooticrAccessToken: string;
  nooticrRefreshToken?: string;
  nooticrUser?: McpSession["nooticrUser"];
}

const pendKey = (code: string) => `pend:${code}`;
const sessKey = (token: string) => `sess:${token}`;
const rateKey = (ip: string) => `rate:${ip}`;
const apiKeyKey = (hash: string) => `apikey:${hash}`;

/**
 * How long a verified API key is remembered.
 *
 * Short on purpose, and it bounds less than it looks like: every call that
 * touches an account carries the key to nooticr-server, which checks it
 * against its own table every time. What this cache gates is the handful of
 * requests that never reach the backend — `initialize`, `tools/list` — so the
 * worst a stale positive buys is a few minutes of a revoked key being able to
 * read a tool list that is the same for everybody.
 */
const API_KEY_OK_TTL_SECONDS = 300;
/** Shorter, so a key fixed a minute after a typo is not locked out for five. */
const API_KEY_BAD_TTL_SECONDS = 60;

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
 * Rotates the nooticr tokens inside a stored MCP session and extends its
 * lifetime. Called after a refresh so the next tool call picks up the fresh
 * access token instead of a 15-minute-expired one. No-op when the session is
 * gone (already expired or evicted).
 */
export async function updateSessionTokens(
  env: Env,
  token: string,
  accessToken: string,
  refreshToken?: string,
  nooticrUser?: McpSession["nooticrUser"]
): Promise<void> {
  const raw = await env.STORE.get(sessKey(token));
  if (!raw) return;
  try {
    const session = JSON.parse(raw) as McpSession;
    session.nooticrAccessToken = accessToken;
    if (refreshToken) session.nooticrRefreshToken = refreshToken;
    if (nooticrUser) session.nooticrUser = nooticrUser;
    session.expiresAt = Date.now() + TOKEN_TTL_SECONDS * 1000;
    await storeSession(env, token, session);
  } catch {
    // Leave the session as-is; the 401 path will force the client to re-login.
  }
}

/** Removes a stored MCP session. Used when the nooticr refresh token dies so
 * the next request fails fast with a clear re-auth challenge instead of every
 * call going to the backend with an expired access token. */
export async function deleteSession(env: Env, token: string): Promise<void> {
  await env.STORE.delete(sessKey(token));
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

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Whether a nooticr API key is real, asked of the backend and remembered
 * briefly (see `API_KEY_OK_TTL_SECONDS`).
 *
 * The key is hashed before it is used as a cache key: KV key names are not a
 * place to keep a live credential in the clear.
 *
 * A backend that is down or unreachable answers "no" without being cached.
 * The alternative — remembering the outage as a bad key — would keep every
 * integration locked out for a minute after the backend came back.
 */
export async function apiKeyIsValid(env: Env, key: string): Promise<boolean> {
  const cacheKey = apiKeyKey(await sha256Hex(key));
  const cached = await env.STORE.get(cacheKey);
  if (cached === "1") return true;
  if (cached === "0") return false;

  let res: Response;
  try {
    res = await fetch(`${env.NOOTICR_BASE_URL}/auth/me`, {
      headers: { authorization: `Bearer ${key}` },
    });
  } catch {
    return false;
  }
  if (res.status >= 500) return false;

  const ok = res.ok;
  await env.STORE.put(cacheKey, ok ? "1" : "0", {
    expirationTtl: ok ? API_KEY_OK_TTL_SECONDS : API_KEY_BAD_TTL_SECONDS,
  });
  return ok;
}

/**
 * True when a bearer token is valid: OAuth-issued, a live nooticr API key, or
 * the env static token.
 *
 * The API key branch is what lets a server-side integration connect to this
 * endpoint with one header and no consent screen.
 */
export async function validMcpToken(env: Env, token: string): Promise<boolean> {
  if (await verifyToken(env, token)) return true;
  if (looksLikeApiKey(token)) return apiKeyIsValid(env, token);
  // A session nooticr-server's chat forwards: checked against the backend the
  // same way a key is, since this worker holds nothing to verify it with.
  const forwarded = forwardedSession(token);
  if (forwarded) return apiKeyIsValid(env, forwarded.token);
  const envToken = env.NOOTICR_ACCESS_TOKEN;
  return typeof envToken === "string" && envToken.length > 0 && token === envToken;
}

export async function isRateLimited(env: Env, ip: string): Promise<boolean> {
  const key = rateKey(ip);
  const count = Number((await env.STORE.get(key)) ?? "0");
  if (count >= LOGIN_RATE_LIMIT.max) return true;
  await env.STORE.put(key, String(count + 1), { expirationTtl: LOGIN_RATE_LIMIT.windowSeconds });
  return false;
}
