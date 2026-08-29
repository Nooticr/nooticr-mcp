/**
 * orchyn-mcp Cloudflare Worker.
 *
 * Exposes the orchyn MCP server at https://mcp.orchyn.com:
 *   - OAuth 2.0 authorization server (email/password via orchyn)
 *   - MCP endpoint at /mcp (Streamable HTTP, stateful sessions on a DO)
 *
 * Run locally: wrangler dev
 * Deploy:        wrangler deploy
 */

import { landingPage as sitelanding } from "./site/landing.js";
import { termsPage, privacyPage } from "./site/legal.js";
import { dashboardPage, dashboardSignedOut } from "./site/dashboard.js";
import { OrchynClient } from "../../src/shared/orchyn.js";
import { MCP_SERVER_VERSION } from "../../src/shared/tools.js";
import {
  authorizationServerMetadata,
  protectedResourceMetadata,
  isAllowedRedirectUri,
  randomToken,
  loadPending,
  deletePending,
  storePending,
  storeSession,
  verifyToken,
  validMcpToken,
  isRateLimited,
  escapeHtml,
  verifyPkce,
  SCOPE,
  TOKEN_TTL_SECONDS,
  PENDING_TTL_SECONDS,
} from "./oauth.js";

export { McpEndpoint } from "./endpoint.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
     const path = url.pathname.replace(/\/+$/, "") || "/";
     const method = request.method;

    if ((path === "/.well-known/oauth-authorization-server" || path === "/.well-known/openid-configuration") && method === "GET") {
      return jsonResponse(200, authorizationServerMetadata(env.PUBLIC_URL, { registration: true }), {
        "access-control-allow-origin": "*",
      });
    }
    if (path === "/.well-known/oauth-protected-resource" && method === "GET") {
      return jsonResponse(200, protectedResourceMetadata(env.PUBLIC_URL), {
        "access-control-allow-origin": "*",
      });
    }
    if (path === "/register" && method === "POST") {
      return handleRegister(request, env);
    }
    if (path === "/dashboard" && method === "GET") {
      return handleDashboard(request, env);
    }
    if (path === "/dashboard/login" && method === "GET") {
      return handleDashboardLogin(request, env);
    }
    if (path === "/dashboard/callback" && method === "GET") {
      return handleDashboardCallback(request, env);
    }
    if (path === "/dashboard/logout") {
      return new Response(null, {
        status: 302,
        headers: { location: "/", "set-cookie": clearSessionCookie() },
      });
    }
    if (path === "/api/checkout" && method === "POST") {
      return handleCheckout(request, env);
    }
    if (path === "/terms" && method === "GET") {
      return htmlResponse(200, termsPage(env.PUBLIC_URL, env.ORCHYN_BASE_URL), CACHEABLE);
    }
    if (path === "/privacy" && method === "GET") {
      return htmlResponse(200, privacyPage(env.PUBLIC_URL, env.ORCHYN_BASE_URL), CACHEABLE);
    }
    if (path === "/robots.txt" && method === "GET") {
      return new Response(
        `User-agent: *\nAllow: /\nDisallow: /dashboard\nDisallow: /api/\nSitemap: ${env.PUBLIC_URL}/sitemap.xml\n`,
        { headers: { "content-type": "text/plain; charset=utf-8" } }
      );
    }
    if (path === "/sitemap.xml" && method === "GET") {
      const pages = ["/", "/terms", "/privacy"];
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>` +
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
          pages.map((u) => `<url><loc>${env.PUBLIC_URL}${u}</loc></url>`).join("") +
          `</urlset>`,
        { headers: { "content-type": "application/xml; charset=utf-8" } }
      );
    }
    if (path === "/register" && method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      });
    }
    if (path === "/token" && method === "POST") {
      return handleToken(request, env);
    }
    if (path === "/auth/callback" && method === "GET") {
      return handleAuthCallback(request, env);
    }
    if (path === "/authorize") {
      return method === "GET" ? handleAuthorizeGet(request, env) : handleAuthorizePost(request, env);
    }
    if (path === "/health" && method === "GET") {
      return jsonResponse(200, {
        ok: true,
        mcpVersion: MCP_SERVER_VERSION,
        protocolVersion: "2025-11-25",
      });
    }
    if (path === "/" && method === "GET") {
      return htmlResponse(200, sitelanding(env.PUBLIC_URL, env.ORCHYN_BASE_URL), CACHEABLE);
    }
    if (path === "/mcp" || path === "/mcp/" || path === "" || path === "/") {
      return routeToEndpoint(request, env);
    }
    return jsonResponse(404, { error: "Not found" });
  },
};

function jsonResponse(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  const headers: Record<string, string> = { "content-type": "application/json", "Cache-Control": "no-store", ...extra };
  return new Response(JSON.stringify(body), { status, headers });
}

function htmlResponse(status: number, html: string, extra: Record<string, string> = {}): Response {
  const headers: Record<string, string> = { "content-type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...extra };
  return new Response(html, { status, headers });
}

function htmlPage(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:38rem;margin:2rem auto;padding:0 1rem;color:#1a1a1a}` +
    `input,button{border:1px solid #ccc;border-radius:6px;padding:.5rem;font:inherit}` +
    `button{cursor:pointer;background:#000;color:#fff}` +
    `.row{margin:.5rem 0}label{display:block;font-weight:600}}</style></head><body>` +
    `<h1>${escapeHtml(title)}</h1>${body}</body></html>`;
}

const CACHEABLE = { "cache-control": "public, max-age=300, s-maxage=3600" };
const SESSION_COOKIE = "orchyn_mcp_dash";

function sessionCookie(token: string): string {
  // httpOnly so page scripts cannot read it, and so the token never appears
  // in a URL, a referrer header or browser history the way `?token=` did.
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
}
function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
function cookieToken(request: Request): string | undefined {
  const raw = request.headers.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return v.join("=") || undefined;
  }
  return undefined;
}

/** Start a browser sign-in for the dashboard (separate from the MCP OAuth dance). */
async function handleDashboardLogin(request: Request, env: Env): Promise<Response> {
  const state = randomToken(24);
  const buy = new URL(request.url).searchParams.get("buy") ?? "";
  await env.STORE.put(`dash_req:${state}`, JSON.stringify({ buy, createdAt: Date.now() }), {
    expirationTtl: 900,
  });
  const redirect = `${env.PUBLIC_URL}/dashboard/callback?state=${encodeURIComponent(state)}`;
  return Response.redirect(
    `${env.ORCHYN_BASE_URL}/auth/mcp-login?redirect=${encodeURIComponent(redirect)}`,
    302
  );
}

async function handleDashboardCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !code) {
    return htmlResponse(400, dashboardSignedOut(env.PUBLIC_URL, "Sign-in was cancelled or the link expired."));
  }
  const raw = await env.STORE.get(`dash_req:${state}`);
  if (!raw) {
    return htmlResponse(400, dashboardSignedOut(env.PUBLIC_URL, "That sign-in link has expired. Please try again."));
  }
  await env.STORE.delete(`dash_req:${state}`);
  let orchyn;
  try {
    orchyn = await OrchynClient.exchangeCode(env.ORCHYN_BASE_URL, code);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sign-in failed";
    return htmlResponse(400, dashboardSignedOut(env.PUBLIC_URL, msg));
  }
  const token = randomToken(32);
  await storeSession(env, token, {
    orchynAccessToken: orchyn.accessToken,
    orchynRefreshToken: orchyn.refreshToken,
    orchynUser: orchyn.user
      ? { id: orchyn.user.id, email: orchyn.user.email, displayName: orchyn.user.displayName }
      : undefined,
    clientId: "orchyn-dashboard",
    scopes: ["analyze:video"],
    expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
  });
  let target = "/dashboard";
  try {
    const buy = (JSON.parse(raw) as { buy?: string }).buy;
    if (buy) target += `?buy=${encodeURIComponent(buy)}`;
  } catch {}
  return new Response(null, {
    status: 302,
    headers: { location: target, "set-cookie": sessionCookie(token) },
  });
}

async function handleDashboard(request: Request, env: Env): Promise<Response> {
  // Accept the cookie first; a bearer header still works for API-style access.
  const token = cookieToken(request) || bearerToken(request) || "";
  if (!token) return htmlResponse(200, dashboardSignedOut(env.PUBLIC_URL));
  const session = await verifyToken(env, token);
  if (!session) {
    return new Response(dashboardSignedOut(env.PUBLIC_URL, "Your session expired. Please sign in again."), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "set-cookie": clearSessionCookie() },
    });
  }

  // The dashboard stores nothing itself — read it all from the orchyn API.
  let usage;
  try {
    const res = await fetch(`${env.ORCHYN_BASE_URL}/mcp/usage`, {
      headers: { authorization: `Bearer ${session.orchynAccessToken}` },
    });
    if (!res.ok) throw new Error(`usage lookup failed (${res.status})`);
    usage = await res.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not load your usage.";
    return htmlResponse(200, dashboardSignedOut(env.PUBLIC_URL, msg));
  }
  return htmlResponse(
    200,
    dashboardPage(env.PUBLIC_URL, session.orchynUser ?? {}, usage as never, token)
  );
}

/** Server-side checkout so the access token never reaches page scripts. */
async function handleCheckout(request: Request, env: Env): Promise<Response> {
  const token = cookieToken(request) || bearerToken(request) || "";
  const session = token ? await verifyToken(env, token) : undefined;
  if (!session) return jsonResponse(401, { error: "Please sign in first." });
  let pack = "pro";
  try {
    const body = (await request.json()) as { pack?: string };
    if (body.pack) pack = body.pack;
  } catch {}
  if (!["starter", "pro", "scale"].includes(pack)) {
    return jsonResponse(400, { error: "Unknown credit pack." });
  }
  try {
    const res = await fetch(`${env.ORCHYN_BASE_URL}/billing/mcp-credits/checkout`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.orchynAccessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ tier: pack }),
    });
    const data = (await res.json()) as { url?: string; checkoutUrl?: string; error?: string };
    const url = data.url ?? data.checkoutUrl;
    if (!url) return jsonResponse(502, { error: data.error ?? "Checkout could not be started." });
    return jsonResponse(200, { url });
  } catch (err) {
    return jsonResponse(502, {
      error: err instanceof Error ? err.message : "Checkout could not be started.",
    });
  }
}

function bearerToken(request: Request): string | undefined {
  const header = request.headers.get("authorization");
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : undefined;
}

// --- OAuth routing ----------------------------------------------------------

function getAuthorizeParams(url: URL): {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
  state?: string;
} | null {
  const response_type = url.searchParams.get("response_type") ?? "";
  const client_id = url.searchParams.get("client_id") ?? "";
  const redirect_uri = url.searchParams.get("redirect_uri") ?? "";
  const code_challenge = url.searchParams.get("code_challenge") ?? "";
  const code_challenge_method = url.searchParams.get("code_challenge_method") ?? "";
  const scope = url.searchParams.get("scope") ?? SCOPE;
  if (!response_type || !client_id || !redirect_uri || !code_challenge || !code_challenge_method) return null;
  return { response_type, client_id, redirect_uri, code_challenge, code_challenge_method, scope, state: url.searchParams.get("state") ?? undefined };
}

function authorizeError(url: URL, redirectUri: string, error: string, description: string): Response {
  if (redirectUri && isAllowedRedirectUri(redirectUri)) {
    const target = new URL(redirectUri);
    target.searchParams.set("error", error);
    target.searchParams.set("error_description", description);
    const state = url.searchParams.get("state");
    if (state) target.searchParams.set("state", state);
    return Response.redirect(target.toString(), 302);
  }
  return htmlResponse(400, htmlPage("orchyn-mcp: bad request", `<p>${escapeHtml(description)}</p>`));
}

async function handleAuthorizeGet(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const p = getAuthorizeParams(url);
  if (!p) {
    return htmlResponse(400, htmlPage("orchyn-mcp: bad request", `<p>Missing required parameters: response_type, client_id, redirect_uri, code_challenge, code_challenge_method.</p>`));
  }
  if (p.response_type !== "code") {
    return authorizeError(url, p.redirect_uri, "unsupported_response_type", "Only response_type=code is supported.");
  }
  if (!p.code_challenge || p.code_challenge_method !== "S256") {
    return authorizeError(url, p.redirect_uri, "invalid_request", "PKCE is required: code_challenge and code_challenge_method=S256.");
  }
  if (!isAllowedRedirectUri(p.redirect_uri)) {
    return htmlResponse(400, htmlPage("orchyn-mcp: bad request", `<p>redirect_uri must be a loopback URL or an https URL.</p>`));
  }
  const scopes = p.scope.split(/\s+/).filter(Boolean);
  if (scopes.some((s) => s !== SCOPE)) {
    return authorizeError(url, p.redirect_uri, "invalid_scope", `Unsupported scope(s). Supported: ${SCOPE}.`);
  }

  // Delegate to the Rust server's branded login (single source of truth)
  const authRequestId = randomToken(16);
  const callbackUrl = `${env.PUBLIC_URL}/auth/callback?state=${encodeURIComponent(authRequestId)}`;
  const mcpLoginUrl = new URL(`${env.ORCHYN_BASE_URL}/auth/mcp-login`);
  mcpLoginUrl.searchParams.set("redirect", callbackUrl);
  await env.STORE.put(`auth_req:${authRequestId}`, JSON.stringify({ ...p, createdAt: Date.now() }), { expirationTtl: PENDING_TTL_SECONDS });
  return Response.redirect(mcpLoginUrl.toString(), 302);
}

async function handleAuthorizePost(request: Request, env: Env): Promise<Response> {
  const form = await request.clone().formData();
  const p = {
    response_type: form.get("response_type") as string,
    client_id: form.get("client_id") as string,
    redirect_uri: form.get("redirect_uri") as string,
    code_challenge: form.get("code_challenge") as string,
    code_challenge_method: form.get("code_challenge_method") as string,
    scope: form.get("scope") as string,
    state: (form.get("state") as string) || undefined,
    email: form.get("email") as string,
    password: form.get("password") as string,
  };

  if (!p.response_type || !p.client_id || !p.redirect_uri || !p.code_challenge || !p.code_challenge_method) {
    return htmlResponse(400, htmlPage("orchyn-mcp: bad request", `<p>Missing required parameters.</p>`));
  }
  if (p.response_type !== "code" || !p.code_challenge || p.code_challenge_method !== "S256") {
    const url = new URL(request.url);
    return authorizeError(url, p.redirect_uri, p.response_type !== "code" ? "unsupported_response_type" : "invalid_request", "Only response_type=code with PKCE S256 is supported.");
  }
  if (!isAllowedRedirectUri(p.redirect_uri)) {
    return htmlResponse(400, htmlPage("orchyn-mcp: bad request", `<p>redirect_uri must be loopback or https.</p>`));
  }

  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  if (await isRateLimited(env, ip)) {
    return jsonResponse(429, { error: "slow_down", error_description: "Too many sign-in attempts; try again in a few minutes." });
  }

  let session;
  try {
    session = await OrchynClient.login(env.ORCHYN_BASE_URL, p.email, p.password);
  } catch (err: any) {
    const msg = err instanceof Error ? escapeHtml(err.message) : "Invalid credentials";
    return htmlResponse(200, htmlPage("orchyn-mcp: sign in", `
      <h2>Sign in with your orchyn account</h2>
      <p style="color:red">Sign-in failed: ${msg}</p>
      <form method="post" action="/authorize">
        <input type="hidden" name="response_type" value="${escapeHtml(p.response_type)}" />
        <input type="hidden" name="client_id" value="${escapeHtml(p.client_id)}" />
        <input type="hidden" name="redirect_uri" value="${escapeHtml(p.redirect_uri)}" />
        <input type="hidden" name="code_challenge" value="${escapeHtml(p.code_challenge)}" />
        <input type="hidden" name="code_challenge_method" value="${escapeHtml(p.code_challenge_method)}" />
        <input type="hidden" name="scope" value="${escapeHtml(p.scope)}" />
        <input type="hidden" name="state" value="${escapeHtml(p.state ?? "")}" />
        <div class="row"><label>Email <input type="email" name="email" autocomplete="username" required /></label></div>
        <div class="row"><label>Password <input type="password" name="password" autocomplete="current-password" required /></label></div>
        <div class="row"><button type="submit">Try again</button></div>
      </form>
    `));
  }

  const mcpAuthCode = randomToken(32);
  const pending = {
    clientId: p.client_id,
    redirectUri: p.redirect_uri,
    codeChallenge: p.code_challenge,
    scopes: p.scope.split(/\s+/).filter(Boolean),
    mcpAuthCode,
    clientState: p.state,
    createdAt: Date.now(),
    orchynAccessToken: session.accessToken,
    orchynRefreshToken: session.refreshToken,
    orchynUser: session.user ? { id: session.user.id, email: session.user.email, displayName: session.user.displayName } : undefined,
  };
  await storePending(env, pending);

  const target = new URL(p.redirect_uri);
  target.searchParams.set("code", mcpAuthCode);
  if (p.state) target.searchParams.set("state", p.state);
  return Response.redirect(target.toString(), 302);
}

async function handleAuthCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDesc = url.searchParams.get("error_description");
  // Load the original OAuth request
  let reqRaw: string | null = null;
  let req: ReturnType<typeof getAuthorizeParams> | null = null;
  if (state) {
    reqRaw = await env.STORE.get(`auth_req:${state}`);
    if (reqRaw) {
      try { req = JSON.parse(reqRaw); } catch {}
    }
  }
  if (error) {
    if (req && req.redirect_uri) {
      const target = new URL(req.redirect_uri);
      target.searchParams.set("error", "access_denied");
      target.searchParams.set("error_description", errorDesc || error);
      if (req.state) target.searchParams.set("state", req.state);
      if (state) await env.STORE.delete(`auth_req:${state}`);
      return Response.redirect(target.toString(), 302);
    }
    return htmlResponse(400, htmlPage("orchyn-mcp: auth failed", `<p>${escapeHtml(errorDesc || error)}</p>`));
  }
  if (!state || !code) {
    return htmlResponse(400, htmlPage("orchyn-mcp: bad request", `<p>Missing state or code.</p>`));
  }
  if (!reqRaw || !req) {
    return htmlResponse(400, htmlPage("orchyn-mcp: bad request", `<p>Invalid or expired state. Please try again.</p>`));
  }
  if (!req.redirect_uri || !req.code_challenge) {
    return htmlResponse(400, htmlPage("orchyn-mcp: bad request", `<p>Invalid state.</p>`));
  }
  let session;
  try {
    session = await OrchynClient.exchangeCode(env.ORCHYN_BASE_URL, code);
  } catch (err: any) {
    const msg = err instanceof Error ? escapeHtml(err.message) : "Code exchange failed";
    const retryUrl = `${env.ORCHYN_BASE_URL}/auth/mcp-login?redirect=${encodeURIComponent(`${env.PUBLIC_URL}/auth/callback?state=${encodeURIComponent(state)}`)}`;
    return htmlResponse(200, htmlPage("orchyn-mcp: sign in", `<p style="color:red">Sign-in failed: ${msg}</p><p><a href="${escapeHtml(retryUrl)}">Try again</a></p>`));
  }
  const mcpAuthCode = randomToken(32);
  const pending = {
    clientId: req.client_id,
    redirectUri: req.redirect_uri,
    codeChallenge: req.code_challenge,
    scopes: req.scope.split(/\s+/).filter(Boolean),
    mcpAuthCode,
    clientState: req.state,
    createdAt: Date.now(),
    orchynAccessToken: session.accessToken,
    orchynRefreshToken: session.refreshToken,
    orchynUser: session.user ? { id: session.user.id, email: session.user.email, displayName: session.user.displayName } : undefined,
  };
  await storePending(env, pending);
  await env.STORE.delete(`auth_req:${state}`);
  const target = new URL(req.redirect_uri);
  target.searchParams.set("code", mcpAuthCode);
  if (req.state) target.searchParams.set("state", req.state);
  return Response.redirect(target.toString(), 302);
}

async function handleToken(request: Request, env: Env): Promise<Response> {
  const form = await request.clone().formData();
  const grantType = form.get("grant_type") as string;
  const code = form.get("code") as string;
  const clientId = form.get("client_id") as string;
  const redirectUri = form.get("redirect_uri") as string;
  const codeVerifier = form.get("code_verifier") as string;

  if (grantType !== "authorization_code") {
    return jsonResponse(400, { error: "unsupported_grant_type", error_description: "Only grant_type=authorization_code is supported." });
  }
  const pending = await loadPending(env, code);
  if (!pending) {
    return jsonResponse(400, { error: "invalid_grant", error_description: "Unknown or incomplete authorization code." });
  }
  if (pending.clientId !== clientId) {
    return jsonResponse(400, { error: "invalid_grant", error_description: "client_id does not match the authorization request." });
  }
  if (redirectUri !== null && pending.redirectUri !== redirectUri) {
    return jsonResponse(400, { error: "invalid_grant", error_description: "redirect_uri does not match the authorization request." });
  }
  if (!(await verifyPkce(codeVerifier, pending.codeChallenge))) {
    return jsonResponse(400, { error: "invalid_grant", error_description: "PKCE verification failed." });
  }
  await deletePending(env, code);

  const accessToken = randomToken(32);
  await storeSession(env, accessToken, {
    orchynAccessToken: pending.orchynAccessToken,
    orchynRefreshToken: pending.orchynRefreshToken,
    orchynUser: pending.orchynUser,
    clientId: pending.clientId,
    scopes: pending.scopes,
    expiresAt: Date.now() + TOKEN_TTL_SECONDS * 1000,
  });

  return jsonResponse(200, {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: TOKEN_TTL_SECONDS,
    scope: pending.scopes.join(" "),
  });
}

async function handleRegister(request: Request, _env: Env): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse(400, { error: "invalid_request", error_description: "Invalid JSON body." });
  }
  const redirectUris = body.redirect_uris as string[] | undefined;
  if (!redirectUris || !Array.isArray(redirectUris) || redirectUris.length === 0) {
    return jsonResponse(400, { error: "invalid_request", error_description: "redirect_uris is required." });
  }
  // Validate each redirect_uri (allow any https or loopback, same policy as authorize)
  for (const uri of redirectUris) {
    if (typeof uri !== "string" || !isAllowedRedirectUri(uri)) {
      return jsonResponse(400, { error: "invalid_redirect_uri", error_description: `Invalid redirect_uri: ${uri}` });
    }
  }
  const clientId = `orchyn_${randomToken(16)}`;
  const now = Math.floor(Date.now() / 1000);
  // Public client — no secret needed (token_endpoint_auth_method: none)
  return jsonResponse(201, {
    client_id: clientId,
    client_name: (body.client_name as string) || "MCP Client",
    redirect_uris: redirectUris,
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: (body.scope as string) || SCOPE,
    client_id_issued_at: now,
    // No client_secret for public clients
  }, {
    "access-control-allow-origin": "*",
  });
}

// --- MCP routing ------------------------------------------------------------

async function routeToEndpoint(request: Request, env: Env): Promise<Response> {
  // Handle CORS preflight for ChatGPT's sandboxed iframe
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
        "access-control-allow-headers": "content-type, authorization, mcp-session-id, mcp-protocol-version, mcp-method",
        "access-control-max-age": "86400",
      },
    });
  }
  // GET /mcp is used by MCP clients (including ChatGPT) to open an SSE stream
  // for server-initiated notifications. The session-id determines which DO handles it.
  const sid = request.headers.get("mcp-session-id");
  const id = sid ? env.MCP_ENDPOINT.idFromName(sid) : env.MCP_ENDPOINT.idFromName(randomToken(16));
  const stub = env.MCP_ENDPOINT.get(id);
  try {
    const response = await stub.fetch(request);
    // Add CORS headers to all MCP responses for ChatGPT's sandbox
    const headers = new Headers(response.headers);
    headers.set("access-control-allow-origin", "*");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (err) {
    // If the DO is unavailable (cold start, eviction), return a JSON-RPC error
    // instead of a hard crash — ChatGPT's connector retries on clean errors.
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse(502, {
      jsonrpc: "2.0",
      error: { code: -32603, message: `MCP endpoint unavailable: ${msg}` },
      id: null,
    });
  }
}
