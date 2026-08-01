# orchyn-mcp — Platform Submission

`orchyn-mcp` is an MCP server exposing **one tool** — `analyze_video` — that
starts an AI analysis of a TikTok / Instagram / YouTube video from its link,
authenticated with the user's orchyn account (OAuth) and billed against the
user's orchyn server credits.

This document is the submission package for the three major MCP platforms:
**Claude Desktop**, **Cursor**, and **OpenAI** (Agents SDK).

---

## 1. Compatibility matrix (verified)

| Platform | Transport | Auth | Status |
|----------|-----------|------|--------|
| Claude Desktop | stdio (`npx orchyn-mcp`) | pre-authenticated (`login`) or env token | ready |
| Claude Desktop | remote HTTP (`http://host:3457/mcp`) | OAuth 2.0 + PKCE (MCP 2025-03-26 discovery) | ready |
| Cursor | stdio (`npx orchyn-mcp`) | pre-authenticated (`login`) or env token | ready |
| Cursor | remote HTTP (Settings → MCP → server URL) | OAuth 2.0 + PKCE | ready |
| OpenAI Agents SDK | `StdioMCPClient` | pre-authenticated / env token | ready |
| OpenAI Agents SDK | `RemoteMCPClient` | OAuth 2.0 + PKCE (browser flow) | ready |

The server is spec-compliant with MCP `2025-03-26` (JSON-RPC over stdio and
Streamable HTTP, `/.well-known/oauth-authorization-server`,
`/.well-known/oauth-protected-resource`, Authorization Code + PKCE S256,
public client). No API keys are ever shared with end users — each user signs
in with their own orchyn Google account and consumes their own credits.

End-to-end verified against a live orchyn server (E2E mode): `initialize`,
`tools/list`, `tools/call` happy path (import → credit debit → analysis job →
result), paywall (`402`) reporting, full OAuth dance (authorize → orchyn
sign-in → loopback callback → `/token` → MCP RPC), token refresh, and
`login` CLI. Verified with a brand-new account: first use auto-creates a
default workspace + app and completes onboarding server-side — **no
dashboard setup required**.

---

## 2. Claude Desktop

### Option A — stdio (recommended for personal use)

1. Install + authenticate once:

   ```bash
   npm install -g orchyn-mcp
   orchyn-mcp login          # opens "Sign in with Google" (orchyn)
   ```

2. Add to `claude_desktop_config.json`:

   ```json
   {
     "mcpServers": {
       "orchyn": {
         "command": "npx",
         "args": ["-y", "orchyn-mcp"],
         "env": {
           "ORCHYN_BASE_URL": "http://localhost:8080"
         }
       }
     }
   }
   ```

   `ORCHYN_BASE_URL` must point at the reachable orchyn server
   (`https://api.orchyn.com` in production). Tokens are picked up from
   `~/.config/orchyn-mcp/credentials.json` written by `login`; alternatively
   set `ORCHYN_ACCESS_TOKEN` in `env`.

3. Restart Claude Desktop. The single tool `analyze_video` appears as
   **Orchyn: analyze_video** — e.g. *"Analyze this TikTok video:
   https://www.tiktok.com/@x/video/123"*.

### Option B — remote HTTP + OAuth (multi-user / shared deployment)

Run the HTTP transport on a host reachable by Claude Desktop:

```bash
ORCHYN_BASE_URL=https://api.orchyn.com ORCHYN_PUBLIC_URL=https://mcp.orchyn.app \
  ORCHYN_PORT=3457 npx -y orchyn-mcp --http
```

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "orchyn": {
      "url": "https://mcp.orchyn.app/mcp"
    }
  }
}
```

Claude Desktop discovers the OAuth endpoints from
`https://mcp.orchyn.app/.well-known/oauth-authorization-server` and runs the
browser sign-in. Note: production remote servers should be served over HTTPS
(reverse-proxy TLS termination or deploy behind Cloudflare).

---

## 3. Cursor

### Option A — stdio

1. `npm install -g orchyn-mcp && orchyn-mcp login`.
2. Add to `.mcp.json` (project) or `~/.cursor/mcp.json` (global):

   ```json
   {
     "mcpServers": {
       "orchyn": {
         "command": "npx",
         "args": ["-y", "orchyn-mcp"],
         "env": {
           "ORCHYN_BASE_URL": "http://localhost:8080"
         }
       }
     }
   }
   ```

3. Reload the MCP servers in Cursor (Settings → MCP). Ask e.g. *"Analyze
   https://youtu.be/abc — start a video analysis"*.

### Option B — remote URL

With `orchyn-mcp --http` running, add the server by URL
(`http://localhost:3457/mcp` locally, or the deployed `https://.../mcp`).
Cursor uses the OAuth discovery flow; a browser opens once for sign-in.

### Cursor MCP marketplace (optional)

If submitting to the Cursor marketplace, provide:

```json
{
  "name": "orchyn",
  "description": "Analyze TikTok, Instagram, and YouTube videos with your orchyn AI credits",
  "tools": ["analyze_video"],
  "command": "npx",
  "args": ["-y", "orchyn-mcp"],
  "env": { "ORCHYN_BASE_URL": "https://api.orchyn.com" },
  "type": "stdio",
  "auth": "external"
}
```

---

## 4. OpenAI (Agents SDK)

### Local stdio server

```bash
npx -y orchyn-mcp login
npx -y orchyn-mcp --stdio
```

```python
from agents import Agent, Runner
from agents.mcp import StdioMCPClient

async def main():
    async with StdioMCPClient(command="npx", args=["-y", "orchyn-mcp"]) as client:
        agent = Agent(name="orchyn", mcp_servers=[client])
        result = await Runner.run(
            agent,
            "Analyze this Instagram reel: https://www.instagram.com/reel/abc/",
        )
        print(result.final_output)
```

### Remote HTTP server with OAuth

```bash
npx -y orchyn-mcp --http --port 3457
```

```python
from agents import Agent, Runner
from agents.mcp import RemoteMCPClient

async def main():
    async with RemoteMCPClient(
        url="http://localhost:3457/mcp",
        auth_provider="oidc",   # opens the browser once for orchyn sign-in
    ) as client:
        agent = Agent(name="orchyn", mcp_servers=[client])
        result = await Runner.run(
            agent,
            "Analyze this YouTube video: https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        )
        print(result.final_output)
```

TypeScript equivalent uses `RemoteMCPClient({ url, authProvider: "oidc" })`
from `agents/mcp/client`. For remote OpenAI usage over the internet the MCP
URL must be HTTPS.

---

## 5. Server-side requirements (deployment checklist)

The MCP relies on the orchyn server for identity, credits, and analysis.
The orchyn backend must expose:

- `POST /mcp/analyze-video` — start analysis (JWT bearer, body `{url, appId?}`);
  auto-bootstraps a default workspace + app + onboarding for accounts that
  have none, so new users work immediately
- `GET /ai/analyze-post?jobId=...` — poll analysis jobs (JWT bearer)
- `POST /auth/google/start` — Google sign-in with **loopback redirects allowed**
  (added upstream so the MCP loopback callback can receive the completion code)
- `POST /auth/oauth/complete` — exchange the sign-in completion code for a JWT
- `POST /auth/refresh`, `POST /auth/login`, `GET /auth/me` — session management

Environment for the MCP itself:

| Variable | Example | Notes |
|----------|---------|-------|
| `ORCHYN_BASE_URL` | `https://api.orchyn.com` | orchyn server URL |
| `ORCHYN_PUBLIC_URL` | `https://mcp.orchyn.app` | HTTPS in production |
| `ORCHYN_PORT` | `3457` | HTTP transport port |
| `ORCHYN_ACCESS_TOKEN` | — | optional pre-provisioned token (bypasses `login`) |
| `ORCHYN_CREDENTIALS_FILE` | — | token store (default `~/.config/orchyn-mcp/credentials.json`, mode 0600) |

---

## 6. Tool contract

`analyze_video(url: string)` — the only tool.

- Accepts public TikTok / Instagram / YouTube links (`tiktok.com`,
  `vm.tiktok.com`, `instagram.com`, `instagr.am`, `youtube.com`,
  `youtu.be`, `m.youtube.com` incl. `/shorts/`).
- Calls `POST /mcp/analyze-video`, which imports the post, debits orchyn
  credits (10 per analysis; first analysis free per workspace), and queues an
  analysis job.
- Polls `GET /ai/analyze-post?jobId=...` until completion and returns the full
  analysis JSON (`hookStrength`, `whyItWorks`, `viralTriggers`,
  `formatBreakdown`, `variationIdeas`, `suggestedHook`,
  `suggestedHashtags`, ...) plus job metadata and cost.
- Errors are surfaced clearly: invalid URL (host check), 401 (not
  authenticated), 402 paywall (`reason`, `used`/`max`, `cost`), 422 (import
  failed).

---

## 7. Verification evidence

- `npm run build` — clean (TypeScript strict).
- `npm test` — 54/54 unit tests pass (URL validation, API error mapping
  incl. paywall, token refresh-on-401, PKCE verification, poll-until-done).
- Live E2E (orchyn server E2E mode): stdio + HTTP transports, OAuth dance,
  tool happy path, 402 paywall, credit lifecycle (debit persists, refund only
  on real failure).
- orchyn server: `cargo fmt --all -- --check` clean, `cargo test -p
  orchyn-server` 22/22 pass.
