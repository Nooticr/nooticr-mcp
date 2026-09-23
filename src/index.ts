#!/usr/bin/env node
/**
 * nooticr-mcp — MCP server exposing `analyze_post` (analyze any post: video/image/carousel) that runs
 * AI video analysis through the user's nooticr account.
 *
 * Modes:
 *   nooticr-mcp            stdio transport (default; Claude Desktop, Cursor)
 *   nooticr-mcp login      browser-based Google sign-in (or --api-key, no browser)
 *   nooticr-mcp api-key    mint/list/revoke a key for a server with no browser
 *   nooticr-mcp --http     remote HTTP transport with OAuth (OpenAI Agents SDK)
 */

import http from "node:http";
import { randomUUID } from "node:crypto";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  getBaseUrl,
  getPublicUrl,
  getPort,
  getCredentialsFile,
  getTransportMode,
  DEFAULT_PORT,
} from "./config.js";
import {
  AuthManager,
  NooticrAuthError,
  createApiKeyTokenProvider,
  createHttpTokenProvider,
  createManagementTokenProvider,
  createStdioTokenProvider,
} from "./auth.js";
import { forwardedHeaders, forwardedSession, looksLikeApiKey } from "./shared/api-key.js";
import { NooticrClient, NooticrError, type NooticrApiKey } from "./nooticr.js";
import {OAuthManager, type McpSession, SCOPES} from "./oauth.js";
import { createMcpServer } from "./shared/tools.js";
import { stdioIdempotencyKey } from "./idempotency.js";
import { FileWatchStore } from "./shared/watchlist.js";
import path from "node:path";

/**
 * The watchlist lives beside the credentials: one machine, one signed-in user,
 * and it has to outlive the process or "since I last looked" means nothing.
 */
function watchStoreForStdio(): FileWatchStore {
  return new FileWatchStore(path.join(path.dirname(getCredentialsFile()), "watchlist.json"));
}

// ---------------------------------------------------------------------------
// stdio mode
// ---------------------------------------------------------------------------

export async function runStdio(): Promise<void> {
  const auth = new AuthManager(getBaseUrl(), getCredentialsFile());
  const server = createMcpServer(
    (ctx) =>
      new NooticrClient(
        getBaseUrl(),
        createStdioTokenProvider(auth),
        stdioIdempotencyKey(ctx)
      ),
    { localWatchStore: watchStoreForStdio() }
  );
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Keep the process alive until the transport closes (handled by the SDK).
}

// ---------------------------------------------------------------------------
// HTTP mode
// ---------------------------------------------------------------------------

interface HttpState {
  oauth: OAuthManager;
  auth: AuthManager;
  transports: Map<string, StreamableHTTPServerTransport>;
  connections: Map<StreamableHTTPServerTransport, unknown>;
  serverFactory: () => ReturnType<typeof createMcpServer>;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => {
      if (chunks.length === 0) return resolve(undefined);
      const text = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(JSON.parse(text));
      } catch {
        resolve(undefined);
      }
    });
    req.on("error", reject);
  });
}

function sendHtml(res: http.ServerResponse, status: number, body: string): void {
  const payload = `<!doctype html><html><head><meta charset="utf-8"><title>nooticr-mcp</title></head><body>${body}</body></html>`;
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(payload);
}

function bearerToken(req: http.IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : undefined;
}

/**
 * A request bearer token is valid when it was issued by our OAuth `/token`
 * endpoint, when it is a nooticr API key, or when it matches
 * `NOOTICR_ACCESS_TOKEN` (pre-provisioned deployments and local testing — no
 * browser OAuth round-trip needed).
 *
 * A key is accepted on its shape alone because this process does not hold the
 * secret to check it against — only nooticr-server does, and it checks every
 * call. What that admits without a round trip is `initialize` and
 * `tools/list`, both of which answer the same for everyone; the first call
 * that touches an account gets the backend's own 401.
 */
function validMcpToken(token: string, oauth: OAuthManager): boolean {
  if (oauth.verifyToken(token)) return true;
  if (looksLikeApiKey(token)) return true;
  // Same reasoning as a key: the backend verifies the session on every call.
  if (forwardedSession(token)) return true;
  const envToken = process.env.NOOTICR_ACCESS_TOKEN;
  return typeof envToken === "string" && envToken.length > 0 && token === envToken;
}

async function handleMcpRequest(
  state: HttpState,
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const token = bearerToken(req);
  const session = token ? state.oauth.verifyToken(token) : undefined;
  if (!token || !validMcpToken(token, state.oauth)) {
    return sendJson(res, 401, {
      error: "Unauthorized",
      error_description:
        "This MCP server requires authentication. Fetch an access token from " +
        `${state.oauth.authorizationServerMetadata().authorization_endpoint}, or — on a ` +
        "server with no browser — send a nooticr API key as the bearer token " +
        "(npx @nooticr/mcp api-key create).",
    });
  }

  // Hand the validated token to the SDK transport, which forwards it to tool
  // handlers via RequestHandlerExtra.authInfo (see shared/protocol.js).
  (req as http.IncomingMessage & { auth?: AuthInfo }).auth = {
    token,
    clientId: session?.clientId ?? "nooticr-mcp",
    scopes: session?.scopes ?? [...SCOPES],
    expiresAt: session
      ? Math.floor(session.expiresAt / 1000)
      : Math.floor(Date.now() / 1000) + 3600,
  } satisfies AuthInfo;

  const sessionId = (req.headers["mcp-session-id"] as string | undefined) ?? "";
  let transport: StreamableHTTPServerTransport | undefined;
  let parsedBody: unknown;

  if (sessionId) {
    transport = state.transports.get(sessionId);
  } else {
    // No session id: an "initialize" request always starts a fresh session.
    // Any other request is routed to the sole active session's transport
    // (covers naive clients that never send the session id).
    let isInitialize = false;
    if (req.method === "POST") {
      parsedBody = await readJsonBody(req);
      const messages = Array.isArray(parsedBody) ? parsedBody : [parsedBody];
      isInitialize = messages.some(
        (m) =>
          m !== null &&
          typeof m === "object" &&
          (m as { method?: unknown }).method === "initialize"
      );
    }
    if (!isInitialize && state.transports.size === 1) {
      transport = state.transports.values().next().value as StreamableHTTPServerTransport;
      if (transport.sessionId) {
        // The SDK's stateful transport requires the header on non-initialize
        // requests; hono's node adapter reads req.rawHeaders, so patch both.
        req.rawHeaders.push("mcp-session-id", transport.sessionId);
        (req.headers as Record<string, string | string[] | undefined>)["mcp-session-id"] =
          transport.sessionId;
      }
    }
  }

  if (!transport) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (sid) => {
        state.transports.set(sid, transport as StreamableHTTPServerTransport);
      },
    });
    // The SDK's McpServer can only attach to one transport, so each MCP
    // session gets its own server instance (tools are registered per
    // instance; sessions resolve their nooticr identity via authInfo).
    const mcpserver = state.serverFactory();
    state.connections.set(transport, mcpserver);
    transport.onclose = () => {
      state.connections.delete(transport as StreamableHTTPServerTransport);
      if (transport?.sessionId) state.transports.delete(transport.sessionId);
    };
    await mcpserver.connect(transport);
  }

  try {
    // If we already consumed the body to sniff for "initialize", hand the
    // parsed payload to the transport so it doesn't try to re-read it.
    if (parsedBody !== undefined) {
      await transport.handleRequest(req, res, parsedBody);
    } else {
      await transport.handleRequest(req, res);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!res.headersSent) {
      sendJson(res, 500, { error: `Internal error: ${msg}` });
    }
  }
}

async function handleHttpRequest(
  state: HttpState,
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = url.pathname;

  if (pathname === "/.well-known/oauth-authorization-server" && req.method === "GET") {
    return sendJson(res, 200, state.oauth.authorizationServerMetadata());
  }
  if (pathname === "/.well-known/oauth-protected-resource" && req.method === "GET") {
    return sendJson(res, 200, state.oauth.protectedResourceMetadata());
  }
  if (pathname === "/authorize" && req.method === "GET") {
    return state.oauth.handleAuthorize(req, res);
  }
  if (pathname === "/token" && req.method === "POST") {
    return state.oauth.handleToken(req, res);
  }
  if (pathname === "/oauth/callback" && req.method === "GET") {
    return state.oauth.handleCallback(req, res);
  }
  if (pathname === "/" && req.method === "GET") {
    const meta = state.oauth.authorizationServerMetadata();
    return sendHtml(
      res,
      200,
      `<h1>nooticr-mcp</h1><p>MCP server is running.</p>` +
        `<p>Authorization endpoint: <code>${meta.authorization_endpoint}</code></p>` +
        `<p>Token endpoint: <code>${meta.token_endpoint}</code></p>`
    );
  }
  if (pathname === "/mcp" || pathname === "/") {
    return handleMcpRequest(state, req, res);
  }
  return sendJson(res, 404, { error: "Not found" });
}

export async function runHttp(port: number, publicUrl?: string): Promise<void> {
  const baseUrl = getBaseUrl();
  const pub = publicUrl ?? getPublicUrl();
  const auth = new AuthManager(baseUrl, getCredentialsFile());

  const oauth = new OAuthManager({
    publicUrl: pub,
    client: new NooticrClient(baseUrl, {
      getAccessToken: async () => undefined,
    }),
    onSession: async (session) => {
      await auth.persistSession(session);
    },
  });

  const state: HttpState = {
    oauth,
    auth,
    transports: new Map(),
    connections: new Map(),
    serverFactory: () =>
      createMcpServer((extra) => {
        const bearer = extra.authInfo?.token;
        // A caller who presented their own API key is answered as themselves.
        // Falling through to `createHttpTokenProvider` here would resolve the
        // *operator's* environment or credentials file instead — one tenant's
        // request served from another's account.
        if (looksLikeApiKey(bearer)) {
          return new NooticrClient(baseUrl, createApiKeyTokenProvider(bearer));
        }
        // nooticr-server's chat, calling as the user signed in to it.
        const forwarded = forwardedSession(bearer);
        if (forwarded) {
          return new NooticrClient(
            baseUrl,
            createApiKeyTokenProvider(forwarded.token),
            undefined,
            forwardedHeaders(forwarded)
          );
        }
        const session: McpSession | undefined = bearer
          ? oauth.verifyToken(bearer)
          : undefined;
        return new NooticrClient(
          baseUrl,
          createHttpTokenProvider(
            auth,
            session
              ? {
                  accessToken: session.nooticrAccessToken,
                  refreshToken: session.nooticrRefreshToken,
                }
              : undefined
          )
        );
      }),
  };

  const server = http.createServer((req, res) => {
    handleHttpRequest(state, req, res).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) sendJson(res, 500, { error: `Internal error: ${msg}` });
      else res.end();
    });
  });

  server.listen(port, () => {
    process.stdout.write(
      `[nooticr-mcp] HTTP server listening on ${pub.replace(/:\d+$/, "")}:${port}\n` +
        `[nooticr-mcp] OAuth metadata: ${pub}/.well-known/oauth-authorization-server\n` +
        `[nooticr-mcp] MCP endpoint:   ${pub}/mcp\n`
    );
  });
}

// ---------------------------------------------------------------------------
// login command
// ---------------------------------------------------------------------------

export interface LoginOptions {
  email?: string;
  password?: string;
  apiKey?: string;
  port: number;
}

export async function runLogin(opts: LoginOptions): Promise<void> {
  const baseUrl = getBaseUrl();
  const auth = new AuthManager(baseUrl, getCredentialsFile());
  const client = new NooticrClient(baseUrl, {
    getAccessToken: async () => undefined,
  });

  if (opts.apiKey) {
    // Check the key before writing it. This is the one moment a person is
    // present to fix a typo — an unchecked key would instead surface as a
    // failed tool call later, from a client that cannot explain itself.
    const keyed = new NooticrClient(baseUrl, createApiKeyTokenProvider(opts.apiKey));
    let user: Awaited<ReturnType<NooticrClient["me"]>>;
    try {
      user = await keyed.me();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new NooticrAuthError(
        `That API key was rejected by ${baseUrl}: ${msg}\n` +
          "`npx nooticr-mcp api-key list` (signed in) shows which keys are still active."
      );
    }
    await auth.persistApiKey(opts.apiKey, user);
    process.stdout.write(
      `Signed in as ${user?.email ?? "unknown user"} with an API key. ` +
        `Saved to ${auth.getCredentialsFile()}\n` +
        "The key does not expire, so there is nothing to refresh and no browser to open again.\n" +
        "On a server, prefer NOOTICR_API_KEY over this file — see the README.\n"
    );
    return;
  }

  if (opts.email && opts.password) {
    const session = await client.login(opts.email, opts.password);
    await auth.persistSession(session);
    process.stdout.write(
      `Signed in as ${session.user?.email ?? opts.email}. Credentials saved to ${auth.getCredentialsFile()}\n`
    );
    return;
  }

  // Browser flow: open the nooticr-branded login page (Google + email/password)
  // at /auth/mcp-login?redirect=<loopback callback>. Both paths converge on a
  // single ?code= redirect the listener exchanges for JWTs.
  const callbackPath = "/oauth/callback";
  const callbackUrl = `http://127.0.0.1:${opts.port}${callbackPath}`;
  const mcpLoginUrl = new URL("/auth/mcp-login", baseUrl);
  mcpLoginUrl.searchParams.set("redirect", callbackUrl);

  const listener = http.createServer((req, res) => {
    const reqUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    if (reqUrl.pathname === callbackPath && req.method === "GET") {
      const code = reqUrl.searchParams.get("code") ?? "";
      if (code) {
        client
          .exchangeCompletionCode(code)
          .then(async (session) => {
            await auth.persistSession(session);
            res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
            res.end(
              "<html><body><h1>Signed in!</h1><p>You can close this tab and return to your terminal.</p></body></html>"
            );
            process.stdout.write(
              `Signed in as ${session.user?.email ?? "unknown user"}. Credentials saved to ${auth.getCredentialsFile()}\n`
            );
            process.exit(0);
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            res.writeHead(502, { "content-type": "text/html; charset=utf-8" });
            res.end(`<html><body><h1>Sign-in failed</h1><p>${msg}</p></body></html>`);
            process.stderr.write(`Sign-in failed: ${msg}\n`);
            process.exit(1);
          });
      } else {
        res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
        res.end("<html><body><h1>Sign-in failed</h1><p>No code returned.</p></body></html>");
        process.exit(1);
      }
      return;
    }
    res.writeHead(404).end();
  });

  await new Promise<void>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(opts.port, "127.0.0.1", resolve);
  });

  process.stdout.write(
    `Open this URL in your browser to sign in with your nooticr account:\n\n  ${mcpLoginUrl.toString()}\n\n`
  );

  try {
    const { default: open } = await import("open");
    await open(mcpLoginUrl.toString());
  } catch {
    process.stdout.write(
      "Could not open the browser automatically. Copy the URL above into your browser.\n"
    );
  }

  // Time out after 5 minutes.
  setTimeout(() => {
    process.stderr.write("Timed out waiting for sign-in.\n");
    process.exit(1);
  }, 300_000).unref();
}

// ---------------------------------------------------------------------------
// api-key command
// ---------------------------------------------------------------------------

export interface ApiKeyOptions {
  action: "create" | "list" | "revoke";
  name?: string;
  workspaceId?: string;
  expiresInDays?: number;
  id?: string;
  json?: boolean;
}

function formatDate(value: string | undefined): string {
  if (!value) return "never";
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? value : at.toISOString().slice(0, 10);
}

function describeKey(key: NooticrApiKey): string {
  const state = key.revokedAt
    ? "revoked"
    : key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now()
      ? "expired"
      : "active";
  return [
    `${key.prefix}\u2026  ${key.name}`,
    `  id         ${key.id}`,
    `  state      ${state}`,
    `  created    ${formatDate(key.createdAt)}`,
    `  last used  ${formatDate(key.lastUsedAt)}`,
    `  expires    ${formatDate(key.expiresAt)}`,
  ].join("\n");
}

/**
 * Mints, lists and revokes the keys a headless deployment authenticates with.
 *
 * Creating one needs an interactive session exactly once — that is the step it
 * removes from every run afterwards — so these commands deliberately refuse to
 * authenticate with `NOOTICR_API_KEY` even when one is set. The backend
 * refuses key management to a key-authenticated caller anyway; resolving one
 * here would only turn that bound into a 403 that reads like a bug.
 */
export async function runApiKey(opts: ApiKeyOptions): Promise<void> {
  const baseUrl = getBaseUrl();
  const auth = new AuthManager(baseUrl, getCredentialsFile());
  const token = await auth.getAccessToken(undefined, { allowApiKey: false });
  if (!token) {
    // Telling these two apart matters: "sign in first" is wrong advice for
    // someone who *is* signed in, with a key, and is being refused for a
    // reason the message otherwise never mentions.
    const hasKey = Boolean(await auth.getAccessToken());
    throw new NooticrAuthError(
      hasKey
        ? "You are signed in with an API key, and a key cannot manage keys — that bound is " +
          "what stops a leaked key minting a replacement that outlives revoking the original. " +
          "Sign in as yourself for this one: `npx nooticr-mcp login` " +
          "(or `login --email ... --password ...`)."
        : "Sign in first: `npx nooticr-mcp login` (or `login --email ... --password ...`). " +
          "Minting a key is the one step that needs a browser, and it is the last one: " +
          "the key it returns is what every run afterwards uses."
    );
  }
  const client = new NooticrClient(baseUrl, createManagementTokenProvider(auth));

  if (opts.action === "create") {
    const created = await client.createApiKey({
      ...(opts.name !== undefined ? { name: opts.name } : {}),
      ...(opts.workspaceId !== undefined ? { workspaceId: opts.workspaceId } : {}),
      ...(opts.expiresInDays !== undefined ? { expiresInDays: opts.expiresInDays } : {}),
    });
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(created, null, 2)}\n`);
      return;
    }
    process.stdout.write(
      `Created API key "${created.name}" (${created.id}).\n\n` +
        `  ${created.key}\n\n` +
        "This is the only time the key is shown — nooticr stores a hash of it and\n" +
        "cannot show it again. Store it wherever this deployment keeps its secrets,\n" +
        "then give it to the server:\n\n" +
        "  NOOTICR_API_KEY=<key> npx nooticr-mcp\n\n" +
        "or, against the remote HTTP endpoint, as the bearer token:\n\n" +
        "  Authorization: Bearer <key>\n"
    );
    return;
  }

  if (opts.action === "list") {
    const keys = await client.listApiKeys();
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(keys, null, 2)}\n`);
      return;
    }
    if (keys.length === 0) {
      process.stdout.write(
        "No API keys. Create one with `npx nooticr-mcp api-key create --name <name>`.\n"
      );
      return;
    }
    process.stdout.write(`${keys.map(describeKey).join("\n\n")}\n`);
    return;
  }

  if (!opts.id) {
    throw new NooticrError(400, "Usage: nooticr-mcp api-key revoke <id>");
  }
  await client.revokeApiKey(opts.id);
  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ id: opts.id, revoked: true }, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    `Revoked ${opts.id}. Any server still presenting it now gets a 401.\n`
  );
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printHelp(): void {
  process.stdout.write(`nooticr-mcp — MCP server for nooticr AI video analysis

Usage:
  nooticr-mcp                    Start in stdio mode (default transport)
  nooticr-mcp --stdio            Same as above
  nooticr-mcp --http [--port N]    Start the remote HTTP transport with OAuth
                                (default port ${DEFAULT_PORT}; also NOOTICR_PORT)
  nooticr-mcp login              Sign in to nooticr via Google in your browser
  nooticr-mcp login --email me@example.com --password '...'   Password login
  nooticr-mcp login --api-key nk_...  Sign in with an API key (no browser)
  nooticr-mcp api-key create [--name N] [--expires-in-days D] [--workspace-id W] [--json]
                                Mint a key for a server with no browser
  nooticr-mcp api-key list [--json]        List this account's keys
  nooticr-mcp api-key revoke <id> [--json] Revoke one
  nooticr-mcp --help             Show this help

Environment variables:
  NOOTICR_BASE_URL          nooticr server base URL (default http://localhost:8080)
  NOOTICR_ACCESS_TOKEN      nooticr JWT access token (bypasses login)
  NOOTICR_API_KEY           nooticr API key from "api-key create" — no browser,
                            no refresh, valid until revoked
  NOOTICR_CREDENTIALS_FILE  token store path (default ~/.config/nooticr-mcp/credentials.json)
  NOOTICR_PUBLIC_URL        public base URL for the HTTP mode (default http://localhost:3457)
  NOOTICR_PORT              port for --http and login (default ${DEFAULT_PORT})
  NOOTICR_TRANSPORT         "stdio" or "http"

Client setup:
  Claude Desktop / Cursor (stdio): after "nooticr-mcp login", use
    "command": "npx", "args": ["nooticr-mcp"]  (plus NOOTICR_ACCESS_TOKEN if needed)
  OpenAI Agents SDK (remote HTTP): use the RemoteMCPClient with URL
    <NOOTICR_PUBLIC_URL>/mcp — the OAuth flow will open your browser.
  Server-side, no browser: mint a key once with "api-key create", then either
    set NOOTICR_API_KEY for the stdio server, or send it to the remote endpoint
    as "Authorization: Bearer <key>" and skip the OAuth flow entirely.
  A client that does not inherit your shell environment: "login --api-key nk_..."
    stores the same key in the credentials file instead.

See README.md for full instructions.
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  if (args[0] === "login") {
    const rest = args.slice(1);
    const valueOf = (flag: string): string | undefined => {
      const idx = rest.indexOf(flag);
      return idx >= 0 && rest[idx + 1] ? rest[idx + 1] : undefined;
    };
    const email = valueOf("--email");
    const password = valueOf("--password");
    // Every other flag here is kebab-case; `--api_key` is the near-miss worth
    // naming rather than ignoring, since ignoring it opens a browser instead.
    if (rest.includes("--api_key")) {
      process.stderr.write("Unknown flag --api_key. Did you mean --api-key?\n");
      process.exit(1);
    }
    const apiKey = valueOf("--api-key");
    if (rest.includes("--api-key") && !apiKey) {
      process.stderr.write("--api-key needs a value (the nk_… key from `api-key create`).\n");
      process.exit(1);
    }
    let port = getPort();
    const portRaw = valueOf("--port");
    if (portRaw !== undefined) port = Number.parseInt(portRaw, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      process.stderr.write("Invalid --port value.\n");
      process.exit(1);
    }
    if (Boolean(email) !== Boolean(password)) {
      process.stderr.write("Both --email and --password must be provided together.\n");
      process.exit(1);
    }
    if (apiKey && (email || password)) {
      process.stderr.write("Use --api-key or --email/--password, not both.\n");
      process.exit(1);
    }
    try {
      await runLogin({ email, password, apiKey, port });
    } catch (err) {
      process.stderr.write(
        `Login failed: ${err instanceof Error ? err.message : String(err)}\n`
      );
      process.exit(1);
    }
    return;
  }

  if (args[0] === "api-key" || args[0] === "api-keys") {
    const rest = args.slice(1);
    const action = rest[0];
    if (action !== "create" && action !== "list" && action !== "revoke") {
      process.stderr.write(
        "Usage: nooticr-mcp api-key <create|list|revoke> [options]\n" +
          "       nooticr-mcp api-key create [--name N] [--expires-in-days D] [--workspace-id W]\n" +
          "       nooticr-mcp api-key revoke <id>\n"
      );
      process.exit(1);
    }
    const flags = rest.slice(1);
    const valueOf = (flag: string): string | undefined => {
      const idx = flags.indexOf(flag);
      return idx >= 0 && flags[idx + 1] ? flags[idx + 1] : undefined;
    };
    const opts: ApiKeyOptions = { action, json: flags.includes("--json") };
    const name = valueOf("--name");
    if (name !== undefined) opts.name = name;
    const workspaceId = valueOf("--workspace-id");
    if (workspaceId !== undefined) opts.workspaceId = workspaceId;
    const expiresRaw = valueOf("--expires-in-days");
    if (expiresRaw !== undefined) {
      const days = Number.parseInt(expiresRaw, 10);
      if (!Number.isInteger(days) || days < 1) {
        process.stderr.write("--expires-in-days must be a positive whole number of days.\n");
        process.exit(1);
      }
      opts.expiresInDays = days;
    }
    if (action === "revoke") {
      // The id is positional, so anything that starts with "-" is a flag the
      // user meant for something else, not the key they want gone.
      const id = flags.find((arg) => !arg.startsWith("-"));
      if (!id) {
        process.stderr.write("Usage: nooticr-mcp api-key revoke <id>\n");
        process.exit(1);
      }
      opts.id = id;
    }
    try {
      await runApiKey(opts);
    } catch (err) {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
    return;
  }

  const isHttp = args.includes("--http") || getTransportMode() === "http";
  let port = getPort();
  if (args.includes("--port")) {
    const idx = args.indexOf("--port");
    if (args[idx + 1]) port = Number.parseInt(args[idx + 1], 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      process.stderr.write("Invalid --port value.\n");
      process.exit(1);
    }
  }

  try {
    if (isHttp) {
      await runHttp(port);
    } else {
      await runStdio();
    }
  } catch (err) {
    if (err instanceof NooticrAuthError) {
      process.stderr.write(`${err.message}\n`);
    } else if (err instanceof NooticrError) {
      process.stderr.write(`nooticr API error: ${err.message}\n`);
    } else {
      process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    }
    process.exit(1);
  }
}

main();
