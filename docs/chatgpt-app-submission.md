# ChatGPT app submission — sourced answers

Everything here is read out of this repository, with the file it came from, so a
reviewer can check any line rather than trust it. The companion
`chatgpt-app-submission.json` at the repo root carries the same values in the
shape the submission form asks to upload.

> **This was assembled by hand, not by the OpenAI Developers plugin's
> `$chatgpt-app-submission` skill.** That skill was not available in the
> environment this was written in, so **the field names below are a best guess
> at the form's schema while the values are accurate to the repo.** Before
> uploading, run the real skill if you can, or reconcile the key names against
> the form. Accuracy of the submission is the submitter's responsibility and
> nothing here changes that.

## Identity

| Field | Value | Source |
|---|---|---|
| Name | Nooticr | `server.json` `title` |
| Slug / id | `com.nooticr/mcp` | `server.json` `name` |
| npm package | `@nooticr/mcp` | `package.json` |
| Version | 1.26.23 | `package.json`, `server.json`, `MCP_SERVER_VERSION` (CI gates all three) |
| Short description | Social intelligence for 10 networks: read posts and trends, monitor brand mentions, then create. | `server.json` `description` |
| Website | https://mcp.nooticr.com | `server.json` `websiteUrl` |
| Repository | https://github.com/Nooticr/nooticr-mcp | `server.json` `repository` |
| License | MIT | `package.json`, `LICENSE` |
| Icon (48) | `assets/brand/icon-48.png` — 48×48 PNG, eyes mark on `#FFFFFF` | this branch |
| Icon (512) | `assets/brand/icon-512.png` — 512×512 PNG, eyes mark on `#FFFFFF` | this branch |

### Why the 48 is framed tighter than the 512

Not an oversight. Scaled to the 512's proportions the mark would be 26px wide
inside the 48px box, and at that size the pupils close up and the rings go
mushy — checked by rendering it, not assumed. The shipped 48 puts the mark at
32px wide with 8px side and 14px top/bottom margins, which stays legible and
still clears a rounded-corner mask at the ~23% radius hosts commonly apply.

Both are rendered from `assets/brand/nooticr-icon.svg` — the 48 by
supersampling at 16× and downsampling with LANCZOS, which holds the thin
pupil rings together better than rasterising straight to 48px.

## What it does

Long description, drawn from `README.md`'s opening rather than written fresh:

> Gives an AI assistant three things: it can **read** real social posts across
> ten networks (TikTok, Instagram, YouTube, X, Reddit, LinkedIn, Douyin,
> Xiaohongshu, Weibo, Bilibili), **understand** them — transcript, video
> frames, comments, the numbers — and **make** something from what it learned:
> hooks, variants to film, a scored draft, a repurposed thread.
>
> The understanding is the user's own model's, not ours. Every tool fetches
> material and hands it over with an account of what to do with it; none of
> them ask a model of ours for an opinion first. You pay for the fetch and
> nothing else.
>
> It also **monitors a name**: `search_mentions` sweeps nine of those networks
> for every comment that says a brand, inside a date window, and
> `search_spoken_mentions` reads the words actually said out loud in videos for
> the mentions that were never typed anywhere.

Suggested categories: productivity / marketing / research. Not verified against
the form's own list.

## Technical surface

| Field | Value | Source |
|---|---|---|
| Transport | Streamable HTTP | `server.json` `remotes` |
| MCP endpoint | `https://mcp.nooticr.com/mcp` | `server.json` |
| Also ships | stdio via `npx -y @nooticr/mcp` | `package.json` `bin` |
| Protocol version | 2025-11-25 | `npm run conformance:mcpjam` output |
| Tools | **64** | `tools/list` on the built server |
| Tools with a ChatGPT widget | **56** | `_meta["openai/outputTemplate"]`, verified by `npm run contract:host` |
| UI resources | 114 (56 Claude + 56 ChatGPT twins + 2 legacy view aliases) | `npm run conformance:mcpjam` |
| Widget mime | `text/html+skybridge` at `.html`-suffixed sibling URIs | `src/shared/tools.ts` `APPS_SDK_MIME_TYPE` |

### The dual-mime arrangement, stated up front

Every view is served twice: `text/html;profile=mcp-app` for hosts that speak
the MCP Apps spec, and `text/html+skybridge` at a `.html` sibling URI for
ChatGPT, whose Apps SDK looks for `_meta["openai/outputTemplate"]` and expects
that mime. Handing ChatGPT the profile mime renders the HTML but never attaches
the bridge — the widget sits on its idle placeholder with a clean console.

This is deliberate and is pinned by `tests/ui-resource.test.ts` and by
`scripts/mcpjam-apps-conformance.sh`, which excludes exactly two conformance
checks (`ui-listed-resources-valid`, `ui-resource-contents-valid`) because both
require the profile mime everywhere. Score on the remaining checks: **100/100,
5/5**. Worth mentioning in the submission so the deviation is not read as a
defect.

## Authentication

OAuth 2.0 Authorization Code + PKCE (S256), public client, per MCP 2025-03-26.
From `README.md` "How authentication works" and `src/oauth.ts`:

- `GET /.well-known/oauth-authorization-server` — metadata
- `GET /authorize` — redirect URIs restricted to loopback or `https://`
- `GET /oauth/callback` — exchanges nooticr's completion code for JWTs
- `POST /token` — verifies PKCE, issues an opaque Bearer bound to the session, 1 hour
- every MCP RPC validates the Bearer against the session map

No credential passes through a tool argument or the model's context.
Authorization codes and PKCE challenges are one-time use and short-lived
(`README.md` "Security notes").

## Data handling

Answers a review will ask for, all verifiable in the source:

- **What leaves the user's session:** the tool arguments (a post URL, a handle,
  a search term) go to `api.nooticr.com`, which fetches from the upstream data
  provider. No conversation content is sent.
- **What is stored:** the creator watchlist and scheduled brand watches, per
  workspace (`migrations/0048_creator_watchlist.sql`,
  `0045_brand_watches.sql` in nooticr-server). A scheduled watch stores an
  opaque content fingerprint per already-mailed mention, not the mention text.
- **Third-party content is returned to the model:** post captions, comments,
  transcripts and search results come from the public internet, not from
  nooticr. Every tool that returns such text frames it as data to reason over
  rather than as instructions — the shared `ownIt` line in
  `src/shared/evidence.ts` and `reviewGuidance()` in
  `src/shared/comment-review.ts`. `prepare_handoff` additionally redacts
  contact details and defangs `@handles` and `#numbers` before the text reaches
  a tracker. This is a prompt-injection surface handled deliberately; say so
  rather than leaving a reviewer to find it.
- **Billing:** nooticr credits, 20 free on signup, Stripe Checkout for top-ups.
  Tools price themselves in their own descriptions; the six whose price is set
  by an argument ask for confirmation over MCP `elicitation` above 6 credits.

### Tools that change state (16 of 64)

`buy_nooticr_credits`, `watch_creator`, `unwatch_creator`,
`catch_up_watchlist`, `track_competitor`, `create_brand_watch`,
`stop_brand_watch`, `create_product`, `update_product`, `analyze_product`,
`review_post`, `draft_post`, `growth_brief`, `generate_content_plan`,
`generate_captions`, `connect_social_account`.

Source: `NOT_READ_ONLY` in `tests/server-surface.test.ts`, which fails if the
list and the tools' `readOnlyHint` annotations disagree. The other 48 declare
`readOnlyHint: true`.

**Nothing in this server posts to a social network.** No nooticr connection
carries comment-write permission, so `answer_my_audience` and
`show_audience_replies` draft replies for a person to paste in themselves. See
issue #29 for the one place that claim is in tension with
`list_social_connections`' reported scopes.

## What only you can supply

These are not in the repo and must not be invented:

- [ ] **Privacy policy URL** — nothing in the repo references one. Almost
      certainly a hard requirement.
- [ ] **Terms of service URL** — same.
- [ ] **Support contact** (email or URL) — no `support@` anywhere in the repo.
- [ ] **Publisher / legal entity name** as it should appear.
- [ ] **Category** from the form's own list.
- [ ] Whether the submission should point at the hosted endpoint only, or also
      declare the npm/stdio distribution.

While you are there: `package.json` has no `homepage`, `repository` or `author`
field. `server.json` carries all three, so nothing is broken, but a reviewer
looking at the npm page will find them missing.

## Readiness — one technical item worth fixing first

**Issue #26 is directly relevant to this submission.** `npm run contract:host`
passes with 0 errors and **1,291 warnings**, of which 1,286 are:

> `type` is an array (`["string","number","boolean"]`). The array form is legal
> JSON Schema, but several MCP clients read `type` as a single string and
> **either reject the tool or drop the constraint**.

ChatGPT is precisely the third-party strict client that warning is about. The
failure mode is invisible from here — a host that rejects a tool makes it
disappear from `tools/list` with no error this repo would ever see. The fix is
in a handful of helpers in `src/shared/output-schemas.ts`, not in 1,286 places.

I would land #26 before submitting rather than after a rejection that gives no
diagnostic.

Everything else is green as of this branch: tsc clean on root and
`cloudflare/`, 765 unit tests, `contract:host` 0 errors,
`contract:manifest` intact, mcpjam conformance 100/100, mutation guard 6/6,
`playwright` 153/153.
