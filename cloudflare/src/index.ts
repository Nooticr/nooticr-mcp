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

import { OrchynClient } from "../../src/shared/orchyn.js";
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
    if (path === "/" && method === "GET") {
      return htmlResponse(200, landingPage(env));
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

async function handleDashboard(request: Request, env: Env): Promise<Response> {
  const token = bearerToken(request) || new URL(request.url).searchParams.get("token") || "";
  let session: Awaited<ReturnType<typeof verifyToken>> = undefined;
  let balance: number | null = null;
  let isAuthed = false;
  if (token) {
    session = await verifyToken(env, token);
    isAuthed = !!session;
    if (isAuthed && session) {
      try {
        // Use the MCP check_credits tool via the Rust server to get balance
        const client = new OrchynClient(env.ORCHYN_BASE_URL, (session as any).orchynAccessToken ?? "");
        const res = await client.callTool("check_orchyn_credits", {});
        const structured = (res as any).structured as Record<string, unknown> | undefined;
        if (structured && typeof structured.balance === "number") balance = structured.balance as number;
        else if (typeof (res as any).balance === "number") balance = (res as any).balance;
      } catch {}
    }
  }
  const title = "Orchyn MCP Dashboard";
  const body = `
    <div style="max-width:56rem;margin:0 auto;padding:2rem 1rem;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#14151a">
      <header style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2rem">
        <div style="display:flex;align-items:center;gap:10px;font-weight:700"><svg width="28" height="28" viewBox="0 0 48 48" fill="none"><g fill="#ff4d23" transform="translate(24 24)"><circle r="4.1"/><g id="r2"><path d="M-2.85 -5.2 L0 -20.6 L2.85 -5.2 L1.15 1.1 L-1.15 1.1 Z"/></g><use href="#r2" transform="rotate(45)"/><use href="#r2" transform="rotate(90)"/><use href="#r2" transform="rotate(135)"/><use href="#r2" transform="rotate(180)"/><use href="#r2" transform="rotate(225)"/><use href="#r2" transform="rotate(270)"/><use href="#r2" transform="rotate(315)"/></g></svg> Orchyn MCP</div>
        <div style="display:flex;gap:8px">${isAuthed ? `<span style="font-size:13px;color:#6b7280">Balance: <strong>${balance ?? "—"}</strong> credits</span><a href="/auth/callback?state=logout" style="font-size:13px;color:#6b7280">Log out</a>` : `<a href="/authorize?response_type=code&client_id=dashboard&redirect_uri=${encodeURIComponent(env.PUBLIC_URL + "/dashboard" + new URL(request.url).search)}&code_challenge=dummy&code_challenge_method=S256&scope=analyze:video" style="background:#14151a;color:#fff;padding:8px 14px;border-radius:999px;text-decoration:none;font-size:14px">Sign in</a>`}</div>
      </header>
      <h1 style="font-size:32px;letter-spacing:-0.02em;margin:0">Your MCP credits</h1>
      <p style="color:#6b7280;margin:8px 0 24px">Top up here — same credits work at <a href="https://orchyn.com/settings?tab=billing" style="color:inherit">orchyn.com</a> and via the MCP tools <code>check_orchyn_credits</code> / <code>buy_orchyn_credits</code>.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));gap:16px;margin:24px 0">
        <div style="border:2px solid #e5e7eb;border-radius:16px;padding:20px"><h3 style="margin:0">Starter</h3><div style="font-size:28px;font-weight:800;margin:8px 0">$12.50</div><div style="color:#6b7280;font-size:13px">500 credits • $0.025/cr</div><button onclick="buy('starter')" style="width:100%;margin-top:12px;background:#fff;border:1px solid #e5e7eb;padding:10px;border-radius:999px;cursor:pointer">Buy Starter</button></div>
        <div style="border:2px solid #14151a;border-radius:16px;padding:20px;box-shadow:0 8px 24px rgba(0,0,0,0.08)"><h3 style="margin:0">Pro</h3><div style="font-size:28px;font-weight:800;margin:8px 0">$40</div><div style="color:#6b7280;font-size:13px">2,000 credits • $0.02/cr</div><button onclick="buy('pro')" style="width:100%;margin-top:12px;background:#14151a;color:#fff;padding:10px;border-radius:999px;cursor:pointer">Buy Pro</button></div>
        <div style="border:2px solid #e5e7eb;border-radius:16px;padding:20px"><h3 style="margin:0">Scale</h3><div style="font-size:28px;font-weight:800;margin:8px 0">$85</div><div style="color:#6b7280;font-size:13px">5,000 credits • $0.017/cr</div><button onclick="buy('scale')" style="width:100%;margin-top:12px;background:#fff;border:1px solid #e5e7eb;padding:10px;border-radius:999px;cursor:pointer">Buy Scale</button></div>
      </div>
      <section style="border:1px solid #e5e7eb;border-radius:12px;padding:16px"><h3 style="margin:0 0 8px">Quick check</h3><p style="margin:0;color:#6b7280;font-size:13px">In Claude, run <code>check_orchyn_credits</code> to see balance, or <code>buy_orchyn_credits</code> to get a Stripe Checkout link instantly.</p><p style="margin:8px 0 0;font-size:13px"><a href="/">← Back to landing</a> • <a href="https://www.npmjs.com/package/@orchyn/mcp" target="_blank">npm @orchyn/mcp</a></p></section>
    </div>
    <script>
      async function buy(tier){
        const token = new URL(location.href).searchParams.get('token') || '';
        const headers = token ? { 'authorization': 'Bearer ' + token, 'content-type': 'application/json' } : { 'content-type': 'application/json' };
        try{
          const res = await fetch('${env.ORCHYN_BASE_URL}/billing/mcp-credits/checkout', { method: 'POST', headers, body: JSON.stringify({ tier }) });
          const data = await res.json();
          if(data.url) { location.href = data.url; } else if(data.checkoutUrl) { location.href = data.checkoutUrl; } else { alert('Checkout failed: ' + (data.error || JSON.stringify(data))); }
        }catch(e){ alert('Checkout failed: ' + e.message); }
      }
      // Auto-buy if ?buy= is present
      (function(){
        const buyTier = new URL(location.href).searchParams.get('buy');
        if(buyTier && typeof buy === 'function'){
          // If authed (balance was shown), trigger buy after a short delay
          const isAuthed = document.body.innerHTML.includes('Balance:');
          if(isAuthed){
            setTimeout(() => buy(buyTier), 600);
          }
        }
      })();
    </script>
  `;
  return htmlResponse(200, `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${body}</body></html>`);
}

function landingPage(env: Env): string {
  const title = "Orchyn MCP — Social intelligence for AI agents";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="description" content="Give Claude, ChatGPT and Cursor the ability to fetch, discover and understand TikTok, Instagram, YouTube, X, Douyin, Xiaohongshu and Bilibili posts.">` +
    `<style>
      :root{--bg:#ffffff;--fg:#14151a;--muted:#6b7280;--border:#e5e7eb;--card:#ffffff;--primary:#14151a;--primary-fg:#ffffff;--accent:#ff4d23;--radius:12px}
      *{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--fg);line-height:1.5}
      a{color:inherit} .wrap{max-width:72rem;margin:0 auto;padding:0 1.5rem}
      header{position:sticky;top:0;backdrop-filter:saturate(180%) blur(8px);background:rgba(255,255,255,0.8);border-bottom:1px solid var(--border)}
      header .wrap{display:flex;align-items:center;justify-content:space-between;height:56px}
      .logo{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:-0.02em}
      .logo-mark{width:28px;height:28px;color:var(--accent)} .logo small{font-weight:500;letter-spacing:0.08em;font-size:10px;color:var(--muted);text-transform:uppercase}
      .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 16px;border-radius:999px;font-weight:600;font-size:14px;text-decoration:none;border:1px solid transparent;cursor:pointer}
      .btn-primary{background:var(--primary);color:var(--primary-fg)} .btn-ghost{border-color:var(--border);background:var(--card)}
      .hero{padding:64px 0 32px;text-align:center} .hero h1{font-size:42px;line-height:1.1;letter-spacing:-0.03em;margin:0} .hero p{color:var(--muted);max-width:36rem;margin:16px auto 0;font-size:18px}
      .grid3{display:grid;grid-template-columns:repeat(1,1fr);gap:16px;margin:32px 0} @media(min-width:768px){.grid3{grid-template-columns:repeat(3,1fr)}}
      .card{border:1px solid var(--border);border-radius:var(--radius);padding:20px;background:var(--card)}
      .card h3{margin:0 0 8px;font-size:16px} .card p{margin:0;color:var(--muted);font-size:14px}
      .pricing{display:grid;grid-template-columns:repeat(1,1fr);gap:16px;margin:24px 0} @media(min-width:768px){.pricing{grid-template-columns:repeat(3,1fr)}}
      .price{border:2px solid var(--border);border-radius:16px;padding:24px;position:relative} .price.featured{border-color:var(--primary);box-shadow:0 8px 24px rgba(0,0,0,0.08)}
      .price h3{margin:0;font-size:18px} .price .amt{font-size:32px;font-weight:800;letter-spacing:-0.02em;margin:8px 0} .price ul{padding-left:18px;color:var(--muted);font-size:14px}
      code{background:#f3f4f6;padding:2px 6px;border-radius:6px;font-size:12px}
      footer{border-top:1px solid var(--border);padding:24px 0;color:var(--muted);font-size:13px}
    </style></head><body>` +
    `<header><div class="wrap"><div class="logo"><svg class="logo-mark" viewBox="0 0 48 48" fill="none" aria-hidden="true"><g fill="#ff4d23" transform="translate(24 24)"><circle r="4.1"/><g id="r"><path d="M-2.85 -5.2 L0 -20.6 L2.85 -5.2 L1.15 1.1 L-1.15 1.1 Z"/></g><use href="#r" transform="rotate(45)"/><use href="#r" transform="rotate(90)"/><use href="#r" transform="rotate(135)"/><use href="#r" transform="rotate(180)"/><use href="#r" transform="rotate(225)"/><use href="#r" transform="rotate(270)"/><use href="#r" transform="rotate(315)"/></g></svg><span>Orchyn <small>MCP</small></span></div><div style="display:flex;gap:8px"><a class="btn btn-ghost" href="https://orchyn.com">Dashboard</a><a class="btn btn-primary" href="#pricing">View pricing</a></div></div></header>` +
    `<main class="wrap">` +
    `<section class="hero"><h1>Give your AI eyes on social</h1><p>Fetch, discover and understand TikTok, Instagram, YouTube, X, Douyin, Xiaohongshu and Bilibili posts — with inline thumbnails and AI analysis — inside Claude, ChatGPT and Cursor.</p><div style="display:flex;gap:12px;justify-content:center;margin-top:20px;flex-wrap:wrap"><a class="btn btn-primary" href="#install">Add to Claude</a><a class="btn btn-ghost" href="https://www.npmjs.com/package/@orchyn/mcp" target="_blank">npm @orchyn/mcp</a><code>npx -y @orchyn/mcp login</code></div></section>` +
    `<section id="tools" class="grid3"><div class="card"><h3>Analyze Post</h3><p>Video / image / carousel + AI: hook, viral triggers, format, variation ideas.</p></div><div class="card"><h3>Discover Posts</h3><p>Niche search across 7 platforms via TikHub. Say “next” to paginate.</p></div><div class="card"><h3>Understand Post</h3><p>Multimodal AI over actual video/images — whatHappens, audience, script, CTA, safety.</p></div></section>` +
    `<section id="pricing"><h2 style="font-size:28px;letter-spacing:-0.02em;text-align:center;margin:0">Pricing — 80% margin built in</h2><p style="text-align:center;color:var(--muted);margin:8px 0 0">Credits work across both platforms — top up once, use everywhere.</p><div class="pricing">` +
    `<div class="price"><h3>Starter</h3><div class="amt">$12.50</div><div style="color:var(--muted)">500 credits • $0.025 / cr</div><ul><li>get_social_media ×500</li><li>discover ×250</li><li>understand ×83 (at 6cr)</li></ul><a class="btn btn-ghost" style="width:100%;margin-top:16px" href="/dashboard?buy=starter">Get Starter</a></div>` +
    `<div class="price featured"><div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:var(--primary);color:var(--primary-fg);font-size:11px;letter-spacing:0.08em;text-transform:uppercase;padding:4px 8px;border-radius:999px">Most popular</div><h3>Pro</h3><div class="amt">$40</div><div style="color:var(--muted)">2,000 credits • $0.02 / cr</div><ul><li>~333 understands</li><li>~1,000 discovers</li><li>Prioritized support</li></ul><a class="btn btn-primary" style="width:100%;margin-top:16px" href="/dashboard?buy=pro">Get Pro</a></div>` +
    `<div class="price"><h3>Scale</h3><div class="amt">$85</div><div style="color:var(--muted)">5,000 credits • $0.017 / cr</div><ul><li>~833 understands</li><li>~2,500 discovers</li><li>Best for agents</li></ul><a class="btn btn-ghost" style="width:100%;margin-top:16px" href="/dashboard?buy=scale">Get Scale</a></div>` +
    `</div><p style="text-align:center;color:var(--muted);font-size:13px">Check balance anytime: <code>check_orchyn_credits</code> • Top up: <code>buy_orchyn_credits</code> (Stripe Checkout) • First use of each tool is free per user.</p></section>` +
    `<section id="install" style="margin:32px 0"><div class="card"><h3>Install</h3><p><strong>Claude Code:</strong> <code>/plugin marketplace add orchynX/mcp</code> → <code>/plugin install orchyn@orchyn</code></p><p><strong>Claude.ai / ChatGPT:</strong> Add custom connector <code>${escapeHtml(env.PUBLIC_URL)}/mcp</code> → OAuth via <code>${escapeHtml(env.ORCHYN_BASE_URL)}/auth/mcp-login</code></p><p><strong>Cursor:</strong> <code>mcpServers: { orchyn: { command: "npx", args: ["-y","@orchyn/mcp"] } }</code></p></div></section>` +
    `</main><footer><div class="wrap">© Orchyn • <a href="https://orchyn.com/privacy">Privacy</a> • <a href="https://orchyn.com/terms">Terms</a> • <a href="https://orchyn.com">orchyn.com</a></div></footer>` +
    `</body></html>`;
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
  const sid = request.headers.get("mcp-session-id");
  const id = sid ? env.MCP_ENDPOINT.idFromName(sid) : env.MCP_ENDPOINT.idFromName(randomToken(16));
  const stub = env.MCP_ENDPOINT.get(id);
  return stub.fetch(request);
}
