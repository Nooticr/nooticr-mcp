#!/usr/bin/env node
// A stand-in for nooticr-server, implementing only the handful of endpoints
// scripts/e2e-server-lib.sh and this repo's own NooticrClient actually touch
// during the E2E harness's boot/login/tool-call sequence: GET /health,
// POST /auth/dev-login, POST /graphql (createWorkspace/createApp only), and
// POST /mcp (tools/call for the tools scripts/mcp-smoke-client.mjs and
// tests/e2e/agentic-visual.e2e.ts exercise). Pure Node, no native deps, no
// network calls of its own.
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
    case "discover_social_posts": {
      // Flat shape the UI template's postCard() actually reads (see
      // tests/e2e/ui-template.e2e.ts's POSTS fixture) — this is what lets
      // tests/e2e/agentic-visual.e2e.ts render and click real posts that
      // came from an actual tools/call, not a hand-crafted fixture.
      const niche = String(args?.niche ?? "demo");
      const posts = [1, 2].map((i) => ({
        platform: "tiktok",
        caption: `Fixture post ${i} about ${niche}`,
        creatorHandle: `fixture_creator_${i}`,
        externalUrl: `https://www.tiktok.com/@fixture_creator_${i}/video/${i}`,
        videoUrl: "https://e2e.nooticr.test/fixture/video.mp4",
        contentType: "video",
        views: 1000 * i,
        likes: 100 * i,
        comments: 10 * i,
      }));
      return {
        content: [{ type: "text", text: `Found ${posts.length} fixture posts about ${niche}.` }],
        structuredContent: { platform: "tiktok", posts },
      };
    }
    case "get_social_media": {
      if (args?.url !== STUB_URL) {
        return { error: { code: -32602, message: `fixture only answers ${STUB_URL}` } };
      }
      // Flat — ui-template.ts's renderView falls back `postCard(d.post||d,
      // true)`, and postCard() (ui-template.ts:2007-2018) reads
      // p.externalUrl, p.creatorHandle, p.videoUrl and flat
      // p.views/likes/comments/shares directly off whatever it's handed.
      // An earlier version of this fixture used a nested `stats` object and
      // `mediaUrl` instead of `videoUrl`, and no `externalUrl` at all — none
      // of postCard's own field names, so the view rendered with no
      // open-link and no stat pills. scripts/mcp-smoke-client.mjs also
      // reads `contentType` at this top level, so keep this flat rather
      // than nesting under `.post` — either is plausible against the real
      // backend's loosely-declared schema (output-schemas.ts), but this
      // repo's own passthrough (toToolResult) does not flatten one into the
      // other, so pick one and keep every consumer of this fixture
      // consistent with it.
      return {
        content: [{ type: "text", text: "Fetched fixture post media." }],
        structuredContent: {
          platform: "tiktok",
          contentType: "video",
          caption: "A fixture caption for local harness validation — not real content.",
          creatorHandle: "fixture-user",
          externalUrl: STUB_URL,
          videoUrl: "https://e2e.nooticr.test/fixture/video.mp4",
          views: 100,
          likes: 10,
          comments: 2,
          shares: 1,
          fetchedAt: new Date().toISOString(),
        },
      };
    }
    case "search_creators": {
      const creators = [1, 2].map((i) => ({
        platform: "tiktok",
        username: `fixture_creator_${i}`,
        nickname: `Fixture Creator ${i}`,
        followers: 10000 * i,
        signature: `Fixture bio ${i} — not a real creator.`,
        verified: i === 1,
      }));
      return {
        content: [{ type: "text", text: `Found ${creators.length} fixture creators.` }],
        structuredContent: { platform: "tiktok", creators },
      };
    }
    case "get_post_transcript": {
      // Real shape (see ui-template.ts's transcript-view gate): `available`
      // must be truthy or the view renders "No transcript available."
      return {
        content: [{ type: "text", text: "Fetched fixture transcript." }],
        structuredContent: {
          available: true,
          wordCount: 6,
          language: "en",
          autoGenerated: true,
          transcript: "This is a fixture transcript for testing.",
        },
      };
    }
    case "discover_hashtags": {
      return {
        content: [{ type: "text", text: "Found fixture trending hashtags." }],
        structuredContent: {
          country: "US",
          days: 7,
          hashtags: [
            { hashtag: "fixturetag1", posts: 1000, views: 100000, trend: "rising", url: "https://www.tiktok.com/tag/fixturetag1" },
            { hashtag: "fixturetag2", posts: 500, views: 50000, trend: "steady", url: "https://www.tiktok.com/tag/fixturetag2" },
          ],
        },
      };
    }
    case "get_post_comments": {
      return {
        content: [{ type: "text", text: "Fetched fixture comments." }],
        structuredContent: {
          url: STUB_URL,
          platform: "tiktok",
          summary: "Fixture comment summary.",
          comments: [
            { text: "This is a fixture comment, long enough to exercise the show-more/show-less toggle in the widget rather than staying under its truncation threshold the whole way through, which is the point of this sentence being unusually long.", author: "fixture_commenter_1", likes: 12 },
            { text: "A short fixture comment.", author: "fixture_commenter_2", likes: 3 },
          ],
        },
      };
    }
    case "discover_sounds": {
      return {
        content: [{ type: "text", text: "Found fixture sounds." }],
        structuredContent: {
          sounds: [
            {
              title: "Fixture Sound 1",
              author: "fixture_artist_1",
              duration: 30,
              playUrl: "https://e2e.nooticr.test/fixture/sound1.mp3",
              coverUrl: "https://e2e.nooticr.test/fixture/cover1.jpg",
              videoCount: 100,
            },
          ],
        },
      };
    }
    case "search_mentions": {
      // Real shape (output-schemas.ts's search_mentions entry): threads[]
      // grouped under a post, each carrying its own mentions[] with a
      // stable `id` — that id is exactly what ui-template.ts's data-mention-id
      // renders (verbatim, not synthesized), so these ids are what
      // tests/e2e/agentic-visual-full-app.e2e.ts picks by selector.
      const term = String(args?.term ?? "fixture");
      const posts = [1, 2];
      const threads = posts.map((i) => ({
        post: {
          platform: "reddit",
          caption: `Fixture thread ${i} mentioning ${term}`,
          externalUrl: `https://reddit.com/r/fixture/comments/${i}`,
          contentType: "text",
        },
        postIsAboutTerm: i === 1,
        postHits: i,
        mentionCount: 2,
        mentions: [
          { id: `fixture-mention-${i}-a`, text: `Fixture mention ${i}a about ${term}.`, username: `fixture_user_${i}a`, likes: 3, replies: 0, hits: 1 },
          { id: `fixture-mention-${i}-b`, text: `Fixture mention ${i}b about ${term}.`, username: `fixture_user_${i}b`, likes: 1, replies: 0, hits: 1 },
        ],
      }));
      return {
        content: [{ type: "text", text: `Found ${threads.length} fixture threads mentioning ${term}.` }],
        structuredContent: {
          term,
          searched: ["reddit"],
          totalMentions: threads.length * 2,
          totalThreads: threads.length,
          // renderMonitor()'s platform-filter chips (ui-template.ts:1250)
          // build entirely from `byPlatform` and render nothing at all —
          // not even the "All" chip — when it's empty, regardless of
          // `threads`. Easy to miss: this fixture's first draft omitted it
          // and the whole .mchips row silently failed to render.
          byPlatform: { reddit: threads.length * 2 },
          threads,
          hasMore: false,
        },
      };
    }
    case "analyze_comments": {
      // Real inputSchema is {url, limit?}.strict() (tools.ts) — this fixture
      // case is what a *correctly* wired caller (postAiActions' "Read
      // comments" button, ui-template.ts:614) reaches. Contrast with the
      // Monitor view's "Analyse these" button, which sends {comments, ids}
      // instead and never reaches any backend at all — rejected by this
      // repo's own zod schema before a request is even made. See
      // tests/e2e/agentic-visual-full-app.e2e.ts for both.
      return {
        content: [{ type: "text", text: "Analyzed fixture comments." }],
        structuredContent: {
          report: { themes: ["fixture theme"], objections: [], whatToMakeNext: ["fixture idea"] },
          commentsAnalyzed: 2,
        },
      };
    }
    case "buy_nooticr_credits": {
      // This raw URL is what the backend returns; tools.ts's proxyUrls()
      // rewrites it into a /media/proxy?url=... link before it reaches this
      // repo's client, since `checkoutUrl` is neither a RAW_URL_KEYS entry
      // nor one of the fixed image-key names — see
      // tests/e2e/agentic-visual-full-app.e2e.ts's buy_nooticr_credits test
      // for why that's a real bug, not something to route around here.
      return {
        content: [{ type: "text", text: "Fixture checkout link." }],
        structuredContent: {
          checkoutUrl: "https://checkout.stripe.com/fixture-session",
          packs: [{ name: "Starter", price: "$12.50", credits: 500 }],
        },
      };
    }
    case "generate_captions": {
      // Real shape (own-account.ts passthrough): {ok, cues, transcript, cost,
      // provider} — no `available`/`wordCount`. See ui-template.ts's
      // transcript-view gate: `transcript` present but `available` absent
      // means `!d.available` is true and it renders "No transcript
      // available." despite `cues`/`transcript` being real data — a real
      // product bug this fixture lets tests/e2e/agentic-visual-full-app.e2e.ts
      // demonstrate concretely rather than just assert against a schema.
      return {
        content: [{ type: "text", text: "Generated fixture captions." }],
        structuredContent: {
          ok: true,
          provider: "mock",
          cost: 1,
          transcript: "Fixture caption transcript.",
          cues: [{ text: "Fixture caption transcript.", start_sec: 0, end_sec: 3 }],
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
