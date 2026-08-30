# @orchyn/mcp

MCP (Model Context Protocol) server for [orchyn](https://orchyn.com).

Gives an AI assistant three things: it can **read** real social posts across
eight networks (TikTok, Instagram, YouTube, X/Twitter, LinkedIn, Douyin,
Xiaohongshu, Bilibili), **understand** them — transcript, hook, script
structure, comment themes, why one post beat another — and **make** something
from what it learned: hooks, variants to film, a scored draft, a repurposed
thread.

Runs over stdio locally or as a hosted connector at `https://mcp.orchyn.com/mcp`.
Billed against your orchyn credits; new accounts get 20 free.

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

24 tools, grouped by what you are trying to do. Prices are in orchyn credits and
match what the server actually charges.

### Read a post

| Tool | Credits | What it is for |
|------|---------|----------------|
| `get_social_media` | 1 | The post's facts and media — contentType, title, caption, author, stats, direct media URLs, plus an inline thumbnail. Use when you want the post itself and nothing interpreted. |
| `get_post_transcript` | 1 | The words actually spoken, read from the post's caption track (TikTok and YouTube). Exact rather than inferred, and far cheaper than watching the video. Use before any analysis when the wording matters. |
| `get_post_comments` | 2 | Top comments plus the themes the platform clusters them into, with which ones the creator pinned or liked. Use when you want to read what people wrote. |

### Understand a post

| Tool | Credits | What it is for |
|------|---------|----------------|
| `analyze_post_fast` | 2 | The full analysis built from transcript, caption and stats instead of video frames — **a third the price**. Weaker on visual style, just as strong on hook, script, CTA and audience. The sensible default. |
| `analyze_post` | 6 (first use free) | The same analysis with the video actually watched. Use when the visuals are the point — framing, editing, on-screen text. |
| `understand_social_post` | 6 (first use free) | A factual description of what physically happens on screen. Use when you need the events, not the strategy. |
| `analyze_comments` | 6 (first use free) | The comment section synthesised: sentiment, recurring themes, questions asked, objections raised, content requested, and follow-up ideas. Use when the goal is what to make next. |
| `compare_posts` | 8 (first use free) | Two to five posts side by side: which won, what actually differed, and the one test to run next. Use when performance differs and you need to know why. |

### Research a niche or a creator

| Tool | Credits | What it is for |
|------|---------|----------------|
| `discover_social_posts` | 2 | Recent posts for a niche across seven networks, with inline thumbnails and `limit`/`offset` pagination. Use to find posts to look at. |
| `get_user_posts` | 2 | One creator's recent posts with stats. Use to scan an account. |
| `search_creators` | 2 | Creators by niche or keyword. Use when you know the niche but not the names. |
| `get_similar_creators` | 2 | Lookalikes for a creator that already works. |
| `discover_sounds` | 2 | Trending audio with playable previews. Sound is a major ranking signal on TikTok. |
| `discover_hashtags` | 2 | Trending hashtags with volumes and whether each is rising, cooling or steady. |
| `find_hook_pattern` | 2 | A creator's repeatable formula from their captions, as fill-in-the-blank templates. Much cheaper than the full profile teardown because it never watches the videos. |
| `niche_report` | 3 | What is working in a niche right now: dominant formats, hook patterns, what over- and underperforms, the gaps nobody is filling. Use when deciding what to make. |
| `analyze_creator_profile` | 15 (first use free) | Full teardown — fetches recent posts, watches up to three, then synthesises niche, themes, hook styles, strengths, audience and collaboration fit. |

### Make something

| Tool | Credits | What it is for |
|------|---------|----------------|
| `write_hooks` | 2 | Alternative opening lines, grounded in a real post's transcript or in a bare topic. Each comes with the mechanism it uses and who it stops. |
| `score_draft` | 2 | Reviews **your** draft before you film it: hook, clarity and payoff scores, concrete fixes, a rewritten hook. The only tool that runs before the content exists. |
| `repurpose_post` | 2 | One post rewritten for other surfaces — X thread, LinkedIn post, carousel slides, YouTube metadata, newsletter. |
| `create_variants` | 3 | Turns a post that worked into variants you could film next: hook, the angle that changes, ordered shot beats and a CTA. |

### Account

| Tool | Credits | What it is for |
|------|---------|----------------|
| `check_orchyn_credits` | free | Balance, billing URL, and which AI tools still have their free first use. |
| `buy_orchyn_credits` | free | A Stripe Checkout URL for a credit pack. Credits land automatically after payment. |
| `orchyn_login` | free | Re-link the account when a call fails with an authentication error. |

### How billing works

- New accounts get **20 free credits**.
- The **AI analysis tools** (`analyze_post`, `understand_social_post`,
  `analyze_creator_profile`, `analyze_comments`, `compare_posts`, and the
  text-only tools) are **free the first time you use each one**. Data tools bill
  from the first call.
- A call that fails is **refunded automatically**, and a call interrupted
  mid-flight is billed **once at most** — retries are idempotent.
- Platform admins bypass credit debiting entirely.
- `check_orchyn_credits` lists which free first uses you still have.

## Interactive cards in Claude / ChatGPT chat

Every tool that returns posts also renders **inline interactive cards** directly
in the chat (MCP Apps `ui://orchyn/view` resource rendered in a sandboxed
iframe):

- **Video posts** (TikTok/IG/YouTube/Douyin/LinkedIn) — an inline `<video>`
  player with the thumbnail as poster, playing the re-hosted permanent MP4
  (no expiring CDN tokens).
- **Carousels / slideshows** — a horizontally scrollable strip of every slide
  with an image count chip.
- **Single images** — inline thumbnail.
- **Text-only posts** (LinkedIn / X) — a styled quote block of the post text.
- **Official brand marks** — each card shows the platform's real logo
  (simple-icons) in its brand color instead of an emoji.

Also **inline thumbnails** render for the model / plain-text clients:

- `get_social_media` / `understand_social_post` / `analyze_post` — up to 4 frames inline (poster + carousel slides). The full `mediaItems[].preview_url` + `thumbnailUrl` stay in `structuredContent` for the model to reason over.
- `discover_social_posts` / `get_user_posts` / `analyze_creator_profile` — each returned post shows its thumbnail inline (up to 4 at once) together with its title/caption + views/likes/comments. Say **"next"** or **"show more"** — Claude will re-call with `offset`/`limit` pagination. Say **"analyze the 2nd one"** — Claude calls `analyze_post` or `understand_social_post` on that URL.
- **Batch analysis** — ask "analyze all 4" or "understand these 3 in batch" and Claude will call `analyze_post`/`understand_social_post` once per URL in parallel and summarize. For large batches, `discover_social_posts` + a follow-up `analyze_post` per URL is the recommended flow.

> The backend's `analyze_post` now watches the **actual video/images** (direct MP4, YouTube `fileUri`, or 6 carousel frames via AI multimodal) — not just the caption. The analysis includes a `whatHappens` field describing exactly what is seen.

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
- Douyin: `douyin.com/*`
- Xiaohongshu: `xiaohongshu.com/*`, `xhslink.com/*`
- Bilibili: `bilibili.com/*`, `b23.tv/*`
- LinkedIn: `linkedin.com/*` (posts, profile URLs)

All tools accept these hosts and handle **video, image, carousel, slideshow
and text** posts.

## Troubleshooting

- **`Not authenticated with orchyn` / 401**: run `npx @orchyn/mcp login` or set
  `ORCHYN_ACCESS_TOKEN`.
- **402 paywall / `insufficient MCP credits`**: your orchyn account is out of
  credits. Prices are listed per tool in [Tools](#tools) — 1 credit for a post
  lookup or transcript, 2-3 for discovery and the text-only AI tools, 6-15 for
  the ones that watch the video. The **AI tools** are free the first time you
  use each; data tools bill from the first call. Top up via
  `buy_orchyn_credits`, `check_orchyn_credits`, or the orchyn dashboard at
  `https://orchyn.com/settings?tab=billing`.
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
npm test         # vitest (66 unit tests, mocked fetch — no network)
```

## License

MIT
