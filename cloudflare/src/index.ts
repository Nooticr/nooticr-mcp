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

import { OrchynClient } from "./orchyn.js";
import {
  authorizationServerMetadata,
  protectedResourceMetadata,
  isAllowedRedirectUri,
  randomToken,
  loadPending,
  deletePending,
  storePending,
  storeSession,
  isRateLimited,
  escapeHtml,
  verifyPkce,
  SCOPE,
  TOKEN_TTL_SECONDS,
} from "./oauth.js";

export { McpEndpoint } from "./endpoint.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
     const path = url.pathname.replace(/\/+$/, "") || "/";
     const method = request.method;

     if (path === "/.well-known/oauth-authorization-server" && method === "GET") {
      return jsonResponse(200, authorizationServerMetadata(env.PUBLIC_URL));
    }
    if (path === "/.well-known/oauth-protected-resource" && method === "GET") {
      return jsonResponse(200, protectedResourceMetadata(env.PUBLIC_URL));
    }
    if (path === "/token" && method === "POST") {
      return handleToken(request, env);
    }
    if (path === "/authorize") {
      return method === "GET" ? handleAuthorizeGet(request, env) : handleAuthorizePost(request, env);
    }
    if (path === "/" && method === "GET") {
      const meta = authorizationServerMetadata(env.PUBLIC_URL);
      return htmlResponse(200, htmlPage("orchyn-mcp", `
        <h1>orchyn-mcp</h1>
        <p>MCP server is running.</p>
        <p>Authorization endpoint: <code>${escapeHtml(meta.authorization_endpoint)}</code></p>
        <p>Token endpoint: <code>${escapeHtml(meta.token_endpoint)}</code></p>
        <p>MCP endpoint: <code>${escapeHtml(env.PUBLIC_URL)}/mcp</code></p>
      `));
    }
    if (path === "/mcp" || path === "") {
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

  return htmlResponse(200, htmlPage("orchyn-mcp: sign in", `
    <h2>Sign in with your orchyn account</h2>
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
      <div class="row"><button type="submit">Sign in</button></div>
    </form>
    <p><small>Your password is sent directly to the orchyn API; the MCP does not store it.</small></p>
  `));
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

// --- MCP routing ------------------------------------------------------------

async function routeToEndpoint(request: Request, env: Env): Promise<Response> {
  const sid = request.headers.get("mcp-session-id");
  const id = sid ? env.MCP_ENDPOINT.idFromName(sid) : env.MCP_ENDPOINT.idFromName(randomToken(16));
  const stub = env.MCP_ENDPOINT.get(id);
  return stub.fetch(request);
}
