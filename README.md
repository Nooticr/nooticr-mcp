# @orchyn/mcp

MCP (Model Context Protocol) server for [orchyn](https://orchyn.com) — fetch,
discover and understand social posts (TikTok, Instagram, YouTube, X) with your
orchyn account and orchyn credits.

## Install (one link)

**Claude Code** — register the marketplace, then install the plugin:

```
/plugin marketplace add orchynX/mcp
/plugin install orchyn@orchyn
```

**Claude Code / CLI without the plugin**:

```bash
claude mcp add orchyn --user -- npx -y @orchyn/mcp
npx @orchyn/mcp login   # one-time sign-in (Google)
```

**Cursor / any stdio MCP client** (`claude_desktop_config.json`, `.mcp.json`, …):

```json
{
  "mcpServers": {
    "orchyn": {
      "command": "npx",
      "args": ["-y", "@orchyn/mcp"],
      "env": { "ORCHYN_BASE_URL": "https://api.orchyn.com" }
    }
  }
}
```

## Tools

| Tool | Credits | Description |
|------|---------|-------------|
| `analyze_post` | first free* | **Preferred.** Analyze any post (video, image, carousel/slideshow) from a TikTok/Instagram/YouTube/X-Twitter URL — imports the media and runs AI analysis over the actual content (video frames, carousel images, caption). Returns a `jobId` to poll via `GET /ai/analyze-post`. *First analysis free per workspace via the dashboard free grant.* |
| `get_social_media` | 1 | Fetch a post's media from a URL: `contentType` (video/image/carousel/slideshow), title, caption, author, stats, direct media URLs **+ inline thumbnail image in chat**. |
| `discover_social_posts` | 2 | **Preferred.** Find recent posts (video/image/carousel/slideshow) for a niche (YouTube via `yt-dlp` search; TikTok/Instagram via Apify). Each post includes title/caption, views/likes/comments, author, `externalUrl` + **inline thumbnails (4 at a time)** — see *Images in chat* below. Supports `limit`/`offset` pagination (“next”). |
| `understand_social_post` | 10 | Import a post URL **and** analyze it with multimodal AI over the actual video/images: factual `whatHappens` description, hook strength, viral triggers, format breakdown, variation ideas, suggested hook/hashtags. Includes inline thumbnails. |

All tools require a connected orchyn account and are billed against your orchyn credit balance (`POST /billing/mcp-credits/checkout` tops up).

`*` `analyze_post`/`analyze_video` bill against **workspace** credits (first free grant); the other three bill against **per-user MCP** credits (never tied to an app/workspace).

## Images in Claude / ChatGPT chat

Every tool that returns posts also renders **inline thumbnails** directly in the chat:

- `get_social_media` / `understand_social_post` / `analyze_post` — up to 4 frames inline (poster + carousel slides). The full `mediaItems[].preview_url` + `thumbnailUrl` stay in `structuredContent` for the model to reason over.
- `discover_social_posts` — each discovered post shows its thumbnail inline (up to 4 of the 6 results at once) together with its title/caption + views/likes/comments. Say **"next"** or **"show more"** — Claude will re-call `discover_social_posts` with `offset` pagination. Say **"analyze the 2nd one"** — Claude calls `analyze_post` or `understand_social_post` on that URL.
- **Batch analysis** — ask "analyze all 4" or "understand these 3 in batch" and Claude will call `analyze_post`/`understand_social_post` once per URL in parallel and summarize. For large batches, `discover_social_posts` + a follow-up `analyze_post` per URL is the recommended flow.

> The backend's `analyze_post` now watches the **actual video/images** (direct MP4, YouTube `fileUri`, or 6 carousel frames via Gemini multimodal) — not just the caption. The analysis includes a `whatHappens` field describing exactly what is seen.

## Prerequisites

- Node.js >= 18 (tested on Node 22)
- An orchyn account (created automatically on first sign-in — Google sign-in
  via `npx @orchyn/mcp login`; the dashboard is **not** required: the server
  auto-creates a default workspace + app for new accounts)
- Access to an orchyn server — defaults to the cloud API
  (`https://api.orchyn.com`); point `ORCHYN_BASE_URL` at your own deployment
  for local development

## Quick start

```bash
# 1. Sign in with your orchyn account (Google sign-in opens in your browser)
npx @orchyn/mcp login
#    or with email/password:
npx @orchyn/mcp login --email you@example.com --password '...'

# 2. Add it to your MCP client (see install section above) — or run it manually:
npx @orchyn/mcp            # stdio (default; for Claude Desktop / Cursor)
npx @orchyn/mcp --http     # remote HTTP with OAuth (for OpenAI Agents SDK)
```

`login` stores your orchyn tokens in `~/.config/orchyn-mcp/credentials.json`
(mode `0600`). If your browser cannot be opened automatically, copy the URL it
prints into a browser manually.

## Usage in Claude Desktop

After `npx @orchyn/mcp login`, add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "orchyn": {
      "command": "npx",
      "args": ["-y", "@orchyn/mcp"]
    }
  }
}
```

Tokens are resolved from the credentials file written by `login` (or from
`ORCHYN_ACCESS_TOKEN`). If your client does not inherit your shell environment,
set the env vars explicitly:

```json
{
  "mcpServers": {
    "orchyn": {
      "command": "npx",
      "args": ["-y", "@orchyn/mcp"],
      "env": {
        "ORCHYN_BASE_URL": "http://localhost:8080"
      }
    }
  }
}
```

## Usage in Cursor

In `.mcp.json` (project root) or `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "orchyn": {
      "command": "npx",
      "args": ["-y", "@orchyn/mcp"]
    }
  }
}
```

After adding the server, run `npx @orchyn/mcp login` in your terminal — Cursor
spawns the server with your environment, so it picks up the stored credentials.

For remote/HTTP usage, Cursor can connect to the OAuth-enabled HTTP mode with
`npx @orchyn/mcp --http` running, pointing the server URL at
`http://localhost:3457/mcp`. Remote clients (including Cursor) discover the
OAuth endpoints from
`http://localhost:3457/.well-known/oauth-authorization-server`, open the
"Sign in with Google" page, and store the resulting access token.

## Usage with OpenAI Agents SDK

Start the HTTP transport:

```bash
npx @orchyn/mcp --http --port 3457
```

Python:

```python
from agents import Agent, Runner
from agents.mcp import RemoteMCPClient

async def main():
    async with RemoteMCPClient(
        url="http://localhost:3457/mcp",
        auth_provider="oidc",  # OAuth flow opens your browser once
    ) as client:
        agent = Agent(name="orchyn", mcp_servers=[client])
        result = await Runner.run(
            agent,
            "Analyze this video: https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        )
        print(result.final_output)
```

TypeScript (Agents SDK):

```ts
import { Agent } from "agents";
import { RemoteMCPClient } from "agents/mcp/client";

const client = new RemoteMCPClient({
  url: "http://localhost:3457/mcp",
  authProvider: "oidc", // opens the browser for the OAuth flow
});

const agent = new Agent({
  name: "orchyn",
  mcpServers: [client],
});

const result = await agent.run(
  "Analyze this video: https://vm.tiktok.com/abc123/",
);
console.log(result.output);
```

For a local stdio process with the Agents SDK, use `StdioMCPClient` (Python:
`StdioMCPClient(command="npx", args=["@orchyn/mcp"])`).

## Command line

```
orchyn-mcp                    Start in stdio mode (default transport)
orchyn-mcp --stdio            Same as above
orchyn-mcp --http [--port N]  Start the remote HTTP transport with OAuth (default port 3457)
orchyn-mcp login              Sign in to orchyn via Google in your browser
orchyn-mcp login --email ... --password ...   Password login
orchyn-mcp --help             Show help
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ORCHYN_BASE_URL` | `https://api.orchyn.com` | orchyn server base URL (trailing slash stripped) |
| `ORCHYN_ACCESS_TOKEN` | — | orchyn JWT access token; takes priority over the credentials file |
| `ORCHYN_CREDENTIALS_FILE` | `~/.config/orchyn-mcp/credentials.json` | token store path |
| `ORCHYN_PUBLIC_URL` | `http://localhost:3457` | public base URL advertised in OAuth metadata (HTTP mode) |
| `ORCHYN_PORT` | `3457` | port for `--http` and `login` |
| `ORCHYN_TRANSPORT` | `stdio` | `stdio` or `http` (same as `--http`) |

## How authentication works

**stdio mode** (Claude Desktop, Cursor): the server uses the token from
`ORCHYN_ACCESS_TOKEN` or the credentials file written by `login`. If the token
is expired it is automatically refreshed with the stored refresh token, and if
the orchyn API returns `401` the request is retried once after a refresh.

**HTTP mode** (OpenAI Agents SDK, remote clients): the server runs its own
OAuth 2.0 authorization server (Authorization Code + PKCE S256, public client,
per the MCP 2025-03-26 spec):

- `GET /.well-known/oauth-authorization-server` — metadata
- `GET /authorize` — validates the request (loopback or https redirect URIs)
  and forwards the browser to orchyn's Google sign-in
- `GET /oauth/callback` — our own loopback callback; exchanges orchyn's
  completion code for orchyn JWTs and redirects back to the MCP client with a
  one-time code
- `POST /token` — verifies PKCE and issues an opaque Bearer token bound to the
  orchyn session (valid 1 hour)
- every MCP RPC validates the Bearer token against the session map

## Supported URLs

- TikTok: `tiktok.com/*`, `vm.tiktok.com/*` (and `www.`/`m.` subdomains)
- Instagram: `instagram.com/*` (reels, posts, carousels), `instagr.am/*`
- YouTube: `youtube.com/*` (including `/shorts/`), `youtu.be/*`, `m.youtube.com/*`
- X/Twitter: `x.com/*`, `twitter.com/*`

All tools accept these hosts. `analyze_post` (and its `analyze_video` alias) additionally handles **image, carousel and slideshow** posts — not just video.

## Troubleshooting

- **`Not authenticated with orchyn` / 401**: run `npx @orchyn/mcp login` or set
  `ORCHYN_ACCESS_TOKEN`.
- **402 paywall / `insufficient MCP credits`**: your orchyn account is out of
  credits for this tool. Each call costs: `get_social_media` 1,
  `discover_social_videos` 2, `understand_social_post` 10, `analyze_post`/
  `analyze_video` first-call free* (see Tools). Top up via the orchyn dashboard
  billing page or `POST /billing/mcp-credits/checkout`.
- **Expired refresh token**: the stored refresh token was rejected by the
  orchyn server. Run `npx @orchyn/mcp login` again to re-authenticate.
- **`Could not reach the orchyn server`**: `ORCHYN_BASE_URL` is unreachable or
  wrong.
- **Client shows "Bad Request" or connection errors in HTTP mode**: make sure
  the port matches `ORCHYN_PUBLIC_URL` and that the client fetched a token
  first (the OAuth flow must complete once in your browser).

## Platform submissions

See [docs/SUBMISSION.md](docs/SUBMISSION.md) for ready-to-paste configs and the submission
package for **Claude Desktop**, **Cursor**, and **OpenAI Agents SDK**.

## Security notes

- The credentials file is written with mode `0600` and the directory with
  `0700`.
- OAuth redirect URIs are restricted to loopback (`http://localhost`,
  `http://127.0.0.1`, `http://[::1]`) or `https://` URLs; the `/authorize`
  endpoint requires PKCE (`S256`).
- Authorization codes and PKCE challenges are one-time use and short-lived
  (in-memory).
- Access tokens are opaque, random, and bound to the in-memory session map;
  they expire after 1 hour. Restarting the server invalidates all sessions.
- Never share your credentials file or `ORCHYN_ACCESS_TOKEN`.

## Development

```bash
npm install
npm run build    # tsc
npm test         # vitest (54 unit tests, mocked fetch — no network)
```

## License

MIT
