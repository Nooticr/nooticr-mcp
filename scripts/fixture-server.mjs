#!/usr/bin/env node
// A stand-in for nooticr-server, implementing only the handful of endpoints
// scripts/e2e-server-lib.sh and this repo's own NooticrClient actually touch
// during the E2E harness's boot/login/tool-call sequence: GET /health,
// POST /auth/dev-login, POST /graphql (createWorkspace/createApp only), and
// POST /mcp (tools/call for the few tools scripts/mcp-smoke-client.mjs
// exercises). Pure Node, no native deps, no network calls of its own.
//
// What this is for: nooticr-server needs a real Rust/Postgres/FFmpeg/ONNX
// toolchain to build — not available in every environment (this one
// included: ort-sys's prebuilt-binary fetch is blocked by this session's
// network egress policy) — so there was previously no way to exercise
// scripts/run-mechanical-e2e-smoke.sh's actual MCP-protocol plumbing
// (does dist/index.js spawn, connect, and round-trip a real tools/call)
// without a full nooticr-server build. This fixture makes that path
// buildable and runnable anywhere Node runs, no Rust required.
//
// What this is NOT for: it proves nothing about nooticr-server's real
// behavior — no workspace-authz enforcement, no real credit ledger, no real
// social-post fetching. Run scripts/run-mechanical-e2e-smoke.sh (default
// mode) or scripts/run-agentic-evals.sh against a real nooticr-server
// before trusting a change to either repo's backend-facing logic; this
// fixture only earns confidence in the harness scripts and this repo's own
// MCP-protocol wiring, not in nooticr-server.
//
// Usage: node scripts/fixture-server.mjs [port]  (default 8080)

import http from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.argv[2] || 8080);
const STUB_URL = "https://e2e.nooticr.test/import/tiktok/e2e-stub";

/** @type {Map<string, { workspaceId?: string }>} */
const tokens = new Map();
/** @type {Map<string, { apps: Array<{ id: string; name: string }> }>} */
const workspaces = new Map();
let nextAppId = 1;

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(payload);
}

function bearerToken(req) {
  const header = req.headers.authorization;
  const match = header && /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : undefined;
}

function handleGraphql(body) {
  const query = String(body.query ?? "");
  const variables = body.variables ?? {};
  if (query.includes("createWorkspace")) {
    const id = randomUUID();
    workspaces.set(id, { apps: [] });
    return { data: { createWorkspace: { id } } };
  }
  if (query.includes("createApp")) {
    const ws = workspaces.get(variables.workspaceId);
    if (!ws) return { errors: [{ message: `no such workspace: ${variables.workspaceId}` }] };
    const id = String(nextAppId++);
    ws.apps.push({ id, name: variables.name });
    return { data: { createApp: { id } } };
  }
  return { errors: [{ message: `fixture-server: unhandled GraphQL query: ${query.slice(0, 80)}` }] };
}

function handleMcpCall(name, args, workspaceId) {
  switch (name) {
    case "check_nooticr_credits":
      return {
        content: [{ type: "text", text: "You have 20 nooticr credits remaining (fixture)." }],
        structuredContent: {
          balance: 20,
          tier: "free",
          isAdmin: false,
          bypassCredits: true,
          firstFreeTools: [],
        },
      };
    case "list_own_apps": {
      const apps = (workspaces.get(workspaceId)?.apps ?? []).map((a) => ({
        appId: a.id,
        name: a.name,
        description: null,
        niche: null,
      }));
      return {
        content: [{ type: "text", text: `You have ${apps.length} app(s) in this workspace (fixture).` }],
        structuredContent: { apps },
      };
    }
    case "list_social_connections":
      return {
        content: [{ type: "text", text: "No social accounts connected (fixture)." }],
        structuredContent: { connections: [] },
      };
    case "get_social_media": {
      if (args?.url !== STUB_URL) {
        return { error: { code: -32602, message: `fixture only answers ${STUB_URL}` } };
      }
      return {
        content: [{ type: "text", text: "Fetched fixture post media." }],
        structuredContent: {
          contentType: "video",
          title: "Fixture stub post",
          caption: "A fixture caption for local harness validation — not real content.",
          author: "fixture-user",
          stats: { views: 100, likes: 10, comments: 2 },
          mediaUrl: "https://e2e.nooticr.test/fixture/video.mp4",
          fetchedAt: new Date().toISOString(),
        },
      };
    }
    default:
      // Not a failure: keeps other tool calls from hard-crashing the
      // fixture if a future test case exercises one this stand-in doesn't
      // model yet. scripts/mcp-smoke-client.mjs only asserts on the tools
      // above; anything else getting an empty result is expected, not a bug.
      return {
        content: [{ type: "text", text: `fixture-server: ${name} is not modeled, returning an empty result.` }],
        structuredContent: {},
      };
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      return sendJson(res, 200, { ok: true, database: "ok (fixture)", ffmpeg: "n/a (fixture)" });
    }

    if (req.method === "POST" && req.url === "/auth/dev-login") {
      const body = await readJson(req);
      const token = randomUUID();
      tokens.set(token, { workspaceId: body.workspace_id });
      return sendJson(res, 200, { token });
    }

    if (req.method === "POST" && req.url === "/graphql") {
      const body = await readJson(req);
      return sendJson(res, 200, handleGraphql(body));
    }

    if (req.method === "POST" && req.url === "/mcp") {
      const body = await readJson(req);
      if (body.method !== "tools/call") {
        return sendJson(res, 200, {
          jsonrpc: "2.0",
          id: body.id,
          error: { code: -32601, message: `fixture-server only implements tools/call, got ${body.method}` },
        });
      }
      const token = bearerToken(req);
      const session = token ? tokens.get(token) : undefined;
      const { name, arguments: args } = body.params ?? {};
      const result = handleMcpCall(name, args, session?.workspaceId);
      if (result.error) {
        return sendJson(res, 200, { jsonrpc: "2.0", id: body.id, error: result.error });
      }
      return sendJson(res, 200, {
        jsonrpc: "2.0",
        id: body.id,
        result: { content: result.content, structuredContent: result.structuredContent, isError: false },
      });
    }

    sendJson(res, 404, { error: `fixture-server: no route for ${req.method} ${req.url}` });
  } catch (err) {
    sendJson(res, 500, { error: String(err?.stack ?? err) });
  }
});

server.listen(PORT, () => {
  console.error(`[fixture-server] listening on http://localhost:${PORT} (stand-in for nooticr-server — see this file's header)`);
});
