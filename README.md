# @nooticr/mcp

MCP (Model Context Protocol) server for [nooticr](https://nooticr.com).

Gives an AI assistant three things: it can **read** real social posts across
ten networks (TikTok, Instagram, YouTube, X, Reddit, LinkedIn, Douyin,
Xiaohongshu, Weibo, Bilibili), **understand** them — transcript, video frames,
comments, the numbers — and **make** something from what it learned: hooks,
variants to film, a scored draft, a repurposed thread.

The understanding is your model's, not ours. Every tool here fetches material
and hands it over with an account of what to do with it; none of them ask a
model of ours for an opinion first. You pay for the fetch and nothing else.

It also **monitors a name**: `search_mentions` sweeps nine of those networks for
every comment that says your brand, inside a date window you choose, and
`search_spoken_mentions` reads the words actually said out loud in TikTok and
YouTube videos for the mentions that were never typed anywhere.

Runs over stdio locally or as a hosted connector at `https://mcp.nooticr.com/mcp`.
Billed against your nooticr credits; new accounts get 20 free.

## Install (one link)

**Claude Code** — register the marketplace, then install the plugin:

```
/plugin marketplace add Nooticr/nooticr-mcp
/plugin install nooticr@nooticr
```

**Claude Code / CLI without the plugin**:

```bash
claude mcp add nooticr --user -- npx -y @nooticr/mcp
npx @nooticr/mcp login   # one-time sign-in (Google)
```

**Cursor / any stdio MCP client** (`claude_desktop_config.json`, `.mcp.json`, …):

```json
{
  "mcpServers": {
    "nooticr": {
      "command": "npx",
      "args": ["-y", "@nooticr/mcp"],
      "env": { "NOOTICR_BASE_URL": "https://api.nooticr.com" }
    }
  }
}
```

## Tools

49 tools, grouped by what you are trying to do. Prices are in nooticr credits and
match what the server actually charges.

Seven of them — the ones under **Answer a question you actually have** — are not
endpoint wrappers. Each names a job, fans out over the calls that job needs,
groups the evidence by whatever you are deciding about, gives every item an id
a follow-up tool can act on, and hands the reading to your model rather than to
ours. They fan out, so they cost the sum of what they fetched and every one of
them caps that fan-out with an argument.

### Read a post

| Tool | Credits | What it is for |
|------|---------|----------------|
| `get_social_media` | 1 | The post's facts and media — contentType, title, caption, author, stats, direct media URLs, plus an inline thumbnail. Use when you want the post itself and nothing interpreted. |
| `get_post_transcript` | 1 | The words actually spoken, read from the post's caption track (TikTok and YouTube). Exact rather than inferred, and far cheaper than watching the video. Use before any analysis when the wording matters. |
| `get_post_frames` | 2 | Frames sampled evenly across a post's video, returned as **images you can actually look at** — not a description of them. ffmpeg opens the stream directly rather than downloading it, so HLS works and an expired link is re-resolved on the spot. Verified live at 3/3 on TikTok, YouTube, Instagram, Douyin and X; Reddit works on video posts. A carousel or slideshow returns its own images unchanged. Each frame costs roughly 1,200 tokens of your context. |
| `get_post_comments` | 2 | Top comments plus the themes the platform clusters them into, with which ones the creator pinned or liked. Use when you want to read what people wrote. |

### Understand a post

| Tool | Credits | What it is for |
|------|---------|----------------|
| `analyze_post_fast` | 2 | The post's transcript, caption and stats — everything but the pictures, which is what makes it the cheap read. Two fetches: `get_social_media` (1) and `get_post_transcript` (1). The sensible default. |
| `analyze_post` | 3 | Frames sampled across the video, as **images your model can actually look at**, plus the transcript. Two fetches: `get_post_frames` (2) and `get_post_transcript` (1). Use when the visuals are the point — framing, editing, on-screen text. |
| `understand_social_post` | 3 | The same two fetches, asked for a description of what physically happens on screen rather than why it works. Use when you need the events, not the strategy. |
| `analyze_comments` | 2 | The comment section, every comment with a stable id, and the taxonomy to label them with — sentiment, and whether each is praise, a complaint, a bug report, a question, a request, a comparison or spam. The same `get_post_comments` call, at the same price as reading them directly. |
| `show_comment_review` | free | Draws the classifications your model produced — every comment with its sentiment and category, filterable and selectable. Makes no requests; it only renders what you pass it. |
| `compare_posts` | 1 | The first of two to five posts, fetched with its stats, and the comparison left to you. Fetch the rest with `get_social_media` at 1 credit each. Use when performance differs and you need to know why. |

### Research a niche or a creator

| Tool | Credits | What it is for |
|------|---------|----------------|
| `discover_social_posts` | 2 | Recent posts for a niche across nine networks, with inline thumbnails and `limit`/`offset` pagination. Use to find posts to look at. |
| `get_user_posts` | 2 | One creator's recent posts with stats. Use to scan an account. |
| `search_creators` | 2 | Creators by niche or keyword. Use when you know the niche but not the names. |
| `get_similar_creators` | 2 | Lookalikes for a creator that already works. |
| `discover_sounds` | 2 | Trending audio with playable previews. Sound is a major ranking signal on TikTok. |
| `discover_hashtags` | 2 | Trending hashtags with volumes and whether each is rising, cooling or steady. |
| `find_hook_pattern` | 2 | A creator's recent posts, so their opening lines can be read as a set and turned into fill-in-the-blank templates. One `get_user_posts` call. |
| `search_mentions` | 2 per network (5 for Xiaohongshu) | **Brand monitoring.** Every *comment* that names a term, across nine networks at once, grouped under the post it was left on. A brand is named far more often in the replies than in a caption, so the comment is the unit — not the post. Takes a `since` date to read a past window, and pages with `offset`/`pageSize` so a nine-network sweep does not arrive all at once. Does not read speech inside a video — `search_spoken_mentions` does, on TikTok and YouTube. |
| `watch_creator` | free | Add a creator to your watchlist. Stores the handle only — nothing is fetched. |
| `unwatch_creator` | free | Drop a creator from the watchlist. |
| `catch_up_watchlist` | 2 per creator | What everyone you watch has posted since your last catch-up. Compares against the snapshot taken last time and moves it forward, so it answers "what is new" rather than "what exists". |
| `create_brand_watch` | free to call | Schedule a recurring `search_mentions` sweep and get emailed only what is new. Two calls by design: the first returns the quote (cost per run, cadence, cost per day) and a `confirmationToken`; nothing is created or charged until you call it again with `confirm: true` and that token. Each run then bills the same as calling `search_mentions` yourself. |
| `list_brand_watches` | free | Every watch you have scheduled: term, networks, cadence, cost per run, credits spent so far, runs made, and when the next one is due. |
| `stop_brand_watch` | free | Stop a watch by `watchId` or `term`. Immediate — the next run does not happen and nothing more is charged. |
| `niche_report` | 2 | Recent posts in a niche with their stats, so the dominant formats, hook patterns and the gaps nobody fills can be read off them. One `discover_social_posts` call. Use when deciding what to make. |
| `analyze_creator_profile` | 2 | A creator's recent posts with their stats — the material of a teardown: niche, themes, hook formula, what over- and underperforms, who the audience is. One `get_user_posts` call. |

### Answer a question you actually have

| Tool | Credits | What it is for |
|------|---------|----------------|
| `answer_my_audience` | 2 + 2 per post opened (14 by default) | **The mirror of `search_mentions`.** The questions waiting under your *own* posts: recent posts fetched, comments read on each, grouped under the post they were left on, every comment with a stable id, and the ones that read like questions or requests flagged and sorted to the top. It finds and drafts — it cannot post a reply, because no nooticr connection carries comment-write permission on any network. `limit` caps how many posts are opened, which is the price. |
| `show_audience_replies` | free | Lays your drafts out for a person to work through, grouped under the post, each with what you decided to do about it. Sends nothing; fetches nothing. |
| `track_competitor` | 2 | What a creator shipped, and which of it beat **their own** median rather than a raw view count that mostly measures follower count. One post list, whatever the window. If they are on your watchlist it also marks what is new since your last check and moves that marker forward — its own marker, not the one `catch_up_watchlist` keeps. |
| `who_should_i_work_with` | 2, or 4 with a seed | A collaboration shortlist: a keyword search merged with the lookalikes of a creator who already fits, marked by which search found each one. It does **not** measure audience overlap — that costs about nine credits a candidate, so the result says so and shows how to check a finalist rather than faking the signal. |
| `why_did_this_underperform` | 3 | One post against the creator's own recent distribution, with the post taken back out of its own baseline. Returns median, quartiles, ratio and percentile, so the answer can be "this is an ordinary result, not a failure". Different question from `compare_posts`, which weighs two URLs you already picked. |
| `what_should_i_make_next` | 2 + 2 per post read + 2 (12 by default) | Demand against supply: what your commenters explicitly ask for, set beside what a niche sweep shows is already being made. A gap nobody asked for is noise; a request nobody serves is the opportunity. Falls back to your most-used hashtag when you name no niche. |
| `search_spoken_mentions` | 2 per platform narrowed by niche + 2 per creator handle + 1 per transcript, up to `maxTranscripts` | **The mirror of `search_mentions`, for what was said rather than typed.** Narrows to candidate posts (a niche sweep, named handles, and/or your watchlist), transcribes only the most-viewed survivors up to a hard ceiling, and searches the words for the term — TikTok and YouTube only, and only where the platform actually supplies a caption track. Reports how many candidates were found, transcribed and matched, so the spend is legible. |

### Make something

| Tool | Credits | What it is for |
|------|---------|----------------|
| `write_hooks` | 2, or free | The source post and its transcript, to write openings against. Give a topic instead of a url and it fetches nothing and costs nothing. |
| `score_draft` | free | **Your** draft back with the rubric to hold it to — hook, clarity, payoff, specificity and fit, each scored 1-10, plus the three fixes worth making and a rewritten opening. Fetches nothing: the text is already yours. The only tool that runs before the content exists. |
| `repurpose_post` | 2 | The source post and its transcript, to rewrite for other surfaces — X thread, LinkedIn post, carousel slides, YouTube metadata, newsletter. |
| `create_variants` | 2 | The post that worked, with its transcript, to build variants from: hook, the angle that changes, ordered shot beats and a CTA. |

### Account

| Tool | Credits | What it is for |
|------|---------|----------------|
| `check_nooticr_credits` | free | Balance and billing URL. |
| `buy_nooticr_credits` | free | A Stripe Checkout URL for a credit pack. Credits land automatically after payment. |
| `nooticr_login` | free | Re-link the account when a call fails with an authentication error. |

### Your own product

Everything above reads someone else's content. These read and generate for **your own** — a different product, a different balance (your workspace's plan AI credits, not the personal MCP credits above), billed exactly like the matching dashboard button.

| Tool | Credits | What it is for |
|------|---------|----------------|
| `list_own_apps` | free | Every product in your workspace — call this first when you have more than one and another tool below asks for `appId`. |
| `get_content_plan` | free | The saved weekly content plan for a product, if one has been generated. `plan: null` when none has. |
| `review_post` | free | Score a draft before you publish it — hook strength, an A/B hook comparison, aesthetic and storytelling notes, rewritten hooks/captions. Never billed, same as the dashboard's own pre-publish review. |
| `draft_post` | plan AI credits | A ready-to-use draft (title, caption, hashtags, per-slide script) for a topic, grounded in your product's name. Returns text only — saves nothing. |
| `growth_brief` | plan AI credits | A plain-language brief — the one insight that matters, wins, risks, next actions — grounded in your real post history and synced analytics. |
| `generate_content_plan` | plan AI credits | A one-week, day-by-day content plan for your creators, grounded in what already worked. Saved — fetch it later with `get_content_plan`. |
| `generate_captions` | plan AI credits | Timed on-screen caption cues for a video — a transcript plus start/end-timed lines. Returns cue data only. |
| `list_social_connections` | free | The social accounts you've connected and what each is allowed to do — read, publish, manage comments. Also lists which platforms can be connected at all. |
| `connect_social_account` | free | A link to open to connect one account. You approve at the provider; nothing connects until you do, and no credential ever passes through this tool. |

### How billing works

- New accounts get **20 free credits**.
- **Every tool is priced at what it fetches upstream**, and bills from the first
  call. A tool that fans out to two fetches costs both — `analyze_post` is 2 for
  the frames plus 1 for the transcript — and its description says so. There is
  no free first use: that grant belonged to the AI calls, and there are none.
- A call that fails is **refunded automatically**, and a call interrupted
  mid-flight is billed **once at most** — retries are idempotent.
- Platform admins bypass credit debiting entirely.

## Interactive cards in Claude / ChatGPT chat

Every tool that returns posts also renders **inline interactive cards** directly
in the chat (MCP Apps `ui://nooticr/view` resource rendered in a sandboxed
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

`search_mentions` renders a different view, because monitoring is triage rather
than browsing:

- **Each row is a person saying something.** Their picture, with the network's
  mark on it, then the handle and when they wrote it — "today at 7:25 PM", not
  a timestamp — then the comment with the term highlighted everywhere it
  appears, then what it earned in likes and replies. A `×N` badge marks a
  comment that names the brand more than once.
- **Each post carries its reach.** The same sentence under a 25K-upvote thread
  and under a post nobody saw are not the same problem, and nothing else on
  screen tells you which one you are reading.
- **The per-network counts are filters.** Click one to narrow to it; a network
  that answered with nothing is shown but is not clickable, because filtering to
  it is a dead end. Filtering and sorting redraw from what you already paid for
  — the view never re-queries.
- **A burst collapses.** One post with a run of near-identical replies (a
  coordinated fan campaign, say) shows the first few and offers the rest, so it
  cannot push four other networks off the screen.
- **Comments are selectable, and the selection is agentic.** Tick any comments,
  or select a whole thread at once, and send them — the view hands the host the
  comment **ids the tool issued**, so the model can reply to, escalate or
  analyse exactly those. Selections survive filtering and sorting.
- **Load more** pages from the `nextOffset` the tool returned.

Also **inline thumbnails** render for the model / plain-text clients:

- `get_social_media` / `understand_social_post` / `analyze_post` — up to 4 frames inline (poster + carousel slides). The full `mediaItems[].preview_url` + `thumbnailUrl` stay in `structuredContent` for the model to reason over.
- `discover_social_posts` / `get_user_posts` / `analyze_creator_profile` — each returned post shows its thumbnail inline (up to 4 at once) together with its title/caption + views/likes/comments. Say **"next"** or **"show more"** — Claude will re-call with `offset`/`limit` pagination. Say **"analyze the 2nd one"** — Claude calls `analyze_post` or `understand_social_post` on that URL.
- **Batch analysis** — ask "analyze all 4" or "understand these 3 in batch" and Claude will call `analyze_post`/`understand_social_post` once per URL in parallel and summarize. For large batches, `discover_social_posts` + a follow-up `analyze_post` per URL is the recommended flow.

## Your own model does the thinking

There is no other mode. Every tool returns **the material an analysis would have
been built from**, at the price of the fetch, and asks your model to reason over
it. Nothing here calls a model of ours, so nothing here sells you a judgement.

For the visual tools that means **actual frames** — real image content blocks,
not a description of them — paired with the transcript. Measured on Claude Code:
~1,200 tokens per 1280×720 frame, eight frames read back correctly and in order.
Twenty frames is about 2.4% of a million-token context.

| Tool | What comes back | Credits |
|---|---|---|
| `analyze_post` | frames as images, plus the transcript and stats | **3** (2 + 1) |
| `analyze_comments` | the comments, each with an id, and the labels to use | **2** |
| `analyze_creator_profile` | the creator's recent posts and their numbers | **2** |
| `score_draft` | your own draft, and the rubric to score it against | **free** |

The prices above are derived from the fetches each tool makes rather than
written down twice — see `EVIDENCE_PLANS` and `planCost` in
`src/shared/evidence.ts`. `score_draft` has no plan at all: it reviews text you
already have, so there is nothing to fetch and nothing to charge for.

`show_comment_review` closes the loop: hand back your classifications and it
draws them — every comment with its sentiment and category, filterable and
selectable. Free, and it makes no requests.

## Before an expensive call, it asks

Most tools print their price in their own description, so a call costs what you
already read. Two do not, because their price is set by an argument:

- `search_mentions` bills **per network swept**, so a bare "monitor my brand"
  sweeps all nine for 21 credits.
- `catch_up_watchlist` bills **per creator**, so the price is the length of a
  list the request never mentions.

Above 6 credits those two ask first, over MCP `elicitation` — the client shows
the number and you accept or decline. Declining spends nothing and is not an
error. A client that does not support elicitation is not blocked; the call runs
as it always did.

## Prerequisites

- Node.js >= 18 (tested on Node 22)
- An nooticr account (created automatically on first sign-in — Google sign-in
  via `npx @nooticr/mcp login`; the dashboard is **not** required: the server
  auto-creates a default workspace + app for new accounts)
- Access to an nooticr server — defaults to the cloud API
  (`https://api.nooticr.com`); point `NOOTICR_BASE_URL` at your own deployment
  for local development

## Quick start

```bash
# 1. Sign in with your nooticr account (Google sign-in opens in your browser)
npx @nooticr/mcp login
#    or with email/password:
npx @nooticr/mcp login --email you@example.com --password '...'

# 2. Add it to your MCP client (see install section above) — or run it manually:
npx @nooticr/mcp            # stdio (default; for Claude Desktop / Cursor)
npx @nooticr/mcp --http     # remote HTTP with OAuth (for OpenAI Agents SDK)
```

`login` stores your nooticr tokens in `~/.config/nooticr-mcp/credentials.json`
(mode `0600`). If your browser cannot be opened automatically, copy the URL it
prints into a browser manually.

## Usage in Claude Desktop

After `npx @nooticr/mcp login`, add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "nooticr": {
      "command": "npx",
      "args": ["-y", "@nooticr/mcp"]
    }
  }
}
```

Tokens are resolved from the credentials file written by `login` (or from
`NOOTICR_ACCESS_TOKEN`). If your client does not inherit your shell environment,
set the env vars explicitly:

```json
{
  "mcpServers": {
    "nooticr": {
      "command": "npx",
      "args": ["-y", "@nooticr/mcp"],
      "env": {
        "NOOTICR_BASE_URL": "http://localhost:8080"
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
    "nooticr": {
      "command": "npx",
      "args": ["-y", "@nooticr/mcp"]
    }
  }
}
```

After adding the server, run `npx @nooticr/mcp login` in your terminal — Cursor
spawns the server with your environment, so it picks up the stored credentials.

For remote/HTTP usage, Cursor can connect to the OAuth-enabled HTTP mode with
`npx @nooticr/mcp --http` running, pointing the server URL at
`http://localhost:3457/mcp`. Remote clients (including Cursor) discover the
OAuth endpoints from
`http://localhost:3457/.well-known/oauth-authorization-server`, open the
"Sign in with Google" page, and store the resulting access token.

## Usage with OpenAI Agents SDK

Start the HTTP transport:

```bash
npx @nooticr/mcp --http --port 3457
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
        agent = Agent(name="nooticr", mcp_servers=[client])
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
  name: "nooticr",
  mcpServers: [client],
});

const result = await agent.run(
  "Analyze this video: https://vm.tiktok.com/abc123/",
);
console.log(result.output);
```

For a local stdio process with the Agents SDK, use `StdioMCPClient` (Python:
`StdioMCPClient(command="npx", args=["@nooticr/mcp"])`).

## Command line

```
nooticr-mcp                    Start in stdio mode (default transport)
nooticr-mcp --stdio            Same as above
nooticr-mcp --http [--port N]  Start the remote HTTP transport with OAuth (default port 3457)
nooticr-mcp login              Sign in to nooticr via Google in your browser
nooticr-mcp login --email ... --password ...   Password login
nooticr-mcp --help             Show help
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NOOTICR_BASE_URL` | `https://api.nooticr.com` | nooticr server base URL (trailing slash stripped) |
| `NOOTICR_ACCESS_TOKEN` | — | nooticr JWT access token; takes priority over the credentials file |
| `NOOTICR_CREDENTIALS_FILE` | `~/.config/nooticr-mcp/credentials.json` | token store path |
| `NOOTICR_PUBLIC_URL` | `http://localhost:3457` | public base URL advertised in OAuth metadata (HTTP mode) |
| `NOOTICR_PORT` | `3457` | port for `--http` and `login` |
| `NOOTICR_TRANSPORT` | `stdio` | `stdio` or `http` (same as `--http`) |

## How authentication works

**stdio mode** (Claude Desktop, Cursor): the server uses the token from
`NOOTICR_ACCESS_TOKEN` or the credentials file written by `login`. If the token
is expired it is automatically refreshed with the stored refresh token, and if
the nooticr API returns `401` the request is retried once after a refresh.

**HTTP mode** (OpenAI Agents SDK, remote clients): the server runs its own
OAuth 2.0 authorization server (Authorization Code + PKCE S256, public client,
per the MCP 2025-03-26 spec):

- `GET /.well-known/oauth-authorization-server` — metadata
- `GET /authorize` — validates the request (loopback or https redirect URIs)
  and forwards the browser to nooticr's Google sign-in
- `GET /oauth/callback` — our own loopback callback; exchanges nooticr's
  completion code for nooticr JWTs and redirects back to the MCP client with a
  one-time code
- `POST /token` — verifies PKCE and issues an opaque Bearer token bound to the
  nooticr session (valid 1 hour)
- every MCP RPC validates the Bearer token against the session map

## Supported URLs

- TikTok: `tiktok.com/*`, `vm.tiktok.com/*` (and `www.`/`m.` subdomains)
- Instagram: `instagram.com/*` (reels, posts, carousels), `instagr.am/*`
- YouTube: `youtube.com/*` (including `/shorts/`), `youtu.be/*`, `m.youtube.com/*`
- X: `x.com/*`, `twitter.com/*`
- Reddit: `reddit.com/*`, `redd.it/*`
- Weibo: `weibo.com/*`, `weibo.cn/*`
- Douyin: `douyin.com/*`
- Xiaohongshu: `xiaohongshu.com/*`, `xhslink.com/*`
- Bilibili: `bilibili.com/*`, `b23.tv/*`
- LinkedIn: `linkedin.com/*` (posts, profile URLs)

All tools accept these hosts and handle **video, image, carousel, slideshow
and text** posts.

## Troubleshooting

- **`Not authenticated with nooticr` / 401**: run `npx @nooticr/mcp login` or set
  `NOOTICR_ACCESS_TOKEN`.
- **402 paywall / `insufficient MCP credits`**: your nooticr account is out of
  credits. Prices are listed per tool in [Tools](#tools) — 1 credit for a post
  lookup or transcript, 2 for discovery and for a tool that makes one fetch, 3
  for the two that fetch frames *and* transcript. Every tool bills from the
  first call. Top up via
  `buy_nooticr_credits`, `check_nooticr_credits`, or the nooticr dashboard at
  `https://nooticr.com/settings?tab=billing`.
- **Expired refresh token**: the stored refresh token was rejected by the
  nooticr server. Run `npx @nooticr/mcp login` again to re-authenticate.
- **`Could not reach the nooticr server`**: `NOOTICR_BASE_URL` is unreachable or
  wrong.
- **Client shows "Bad Request" or connection errors in HTTP mode**: make sure
  the port matches `NOOTICR_PUBLIC_URL` and that the client fetched a token
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
- Never share your credentials file or `NOOTICR_ACCESS_TOKEN`.

## Development

```bash
npm install
npm run build    # tsc
npm test         # vitest (66 unit tests, mocked fetch — no network)
```

Those are unit tests against a stub backend. For real MCP-protocol
end-to-end tests — no Rust, no Postgres, no API key —
`npm run test:e2e-smoke:fixture` spawns this repo's real built CLI and
drives it over stdio against a pure-Node stand-in for nooticr-server. See
`docs/testing/agentic-e2e-testing.md` for that plus the two tiers above it
(`npm run test:e2e-smoke` against a real nooticr-server, and
`npm run test:agentic-e2e`, a real model driving it).

## License

MIT
