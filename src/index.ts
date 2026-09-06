#!/usr/bin/env node
/**
 * nooticr-mcp — MCP server exposing `analyze_post` (analyze any post: video/image/carousel) that runs
 * AI video analysis through the user's nooticr account.
 *
 * Modes:
 *   nooticr-mcp            stdio transport (default; Claude Desktop, Cursor)
 *   nooticr-mcp login      browser-based Google sign-in to nooticr
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
import { AuthManager, NooticrAuthError, createHttpTokenProvider, createStdioTokenProvider } from "./auth.js";
import { NooticrClient, NooticrError } from "./nooticr.js";
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
 * endpoint, or when it matches `NOOTICR_ACCESS_TOKEN` (pre-provisioned
 * deployments and local testing — no browser OAuth round-trip needed).
 */
function validMcpToken(token: string, oauth: OAuthManager): boolean {
  if (oauth.verifyToken(token)) return true;
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
        "This MCP server requires OAuth authentication. Fetch an access token from " +
        `${state.oauth.authorizationServerMetadata().authorization_endpoint} first.`,
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
        const session: McpSession | undefined = extra.authInfo?.token
          ? oauth.verifyToken(extra.authInfo.token)
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
  port: number;
}

export async function runLogin(opts: LoginOptions): Promise<void> {
  const baseUrl = getBaseUrl();
  const auth = new AuthManager(baseUrl, getCredentialsFile());
  const client = new NooticrClient(baseUrl, {
    getAccessToken: async () => undefined,
  });

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
  nooticr-mcp --help             Show this help

Environment variables:
  NOOTICR_BASE_URL          nooticr server base URL (default http://localhost:8080)
  NOOTICR_ACCESS_TOKEN      nooticr JWT access token (bypasses login)
  NOOTICR_CREDENTIALS_FILE  token store path (default ~/.config/nooticr-mcp/credentials.json)
  NOOTICR_PUBLIC_URL        public base URL for the HTTP mode (default http://localhost:3457)
  NOOTICR_PORT              port for --http and login (default ${DEFAULT_PORT})
  NOOTICR_TRANSPORT         "stdio" or "http"

Client setup:
  Claude Desktop / Cursor (stdio): after "nooticr-mcp login", use
    "command": "npx", "args": ["nooticr-mcp"]  (plus NOOTICR_ACCESS_TOKEN if needed)
  OpenAI Agents SDK (remote HTTP): use the RemoteMCPClient with URL
    <NOOTICR_PUBLIC_URL>/mcp — the OAuth flow will open your browser.

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
    try {
      await runLogin({ email, password, port });
    } catch (err) {
      process.stderr.write(
        `Login failed: ${err instanceof Error ? err.message : String(err)}\n`
      );
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
