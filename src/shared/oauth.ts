/**
 * Runtime-agnostic OAuth 2.0 / PKCE primitives shared by the Node package
 * (`@orchyn/mcp`) and the Cloudflare Worker (mcp.orchyn.com). Web-standard
 * APIs only (crypto, atob), so the worker's KV-backed OAuth flow and the
 * node `OAuthManager` validate the same way by construction.
 */

export const SCOPE = "analyze:video";

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

/** RFC 7636 S256 PKCE check (SHA-256 + base64url compare). */
export async function verifyPkce(codeVerifier: string, codeChallenge: string): Promise<boolean> {
  if (!codeVerifier || !codeChallenge) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const bytes = new Uint8Array(digest);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  const b64 = btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return b64 === codeChallenge;
}

export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function authorizationServerMetadata(
  publicUrl: string,
  opts: { registration?: boolean } = {}
) {
  return {
    issuer: publicUrl,
    authorization_endpoint: `${publicUrl}/authorize`,
    token_endpoint: `${publicUrl}/token`,
    ...(opts.registration
      ? { registration_endpoint: `${publicUrl}/register` }
      : {}),
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

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function generateState(): string {
  return crypto.randomUUID();
}
