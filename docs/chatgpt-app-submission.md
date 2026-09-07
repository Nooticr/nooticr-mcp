# ChatGPT app submission

Two artifacts, with different jobs:

- **`chatgpt-app-submission.json`** — the file the submission form imports. Its
  shape is fixed by `docs/chatgpt-app-submission.schema.json`, vendored from
  `developers.openai.com/plugins/schemas/chatgpt-app-submission.v1.json`.
  Validate it with `npm run check:submission`.
- **This document** — the sourced answers for everything the form asks that the
  JSON has no field for. Each value names the file it came from, so any line can
  be checked rather than trusted.

## The `$schema` URL: `/apps-sdk/`, and why the vendored schema disagrees

The file declares:

```
https://developers.openai.com/apps-sdk/schemas/chatgpt-app-submission.v1.json
```

The published schema document does not ask for that. Its
`properties.$schema.const` is the **`/plugins/`** path, and its `$id` is too.
But the submission uploader rejects a file declaring `/plugins/` and requires
`/apps-sdk/`, so the two disagree and the uploader is the one that matters — a
file that satisfies the document and fails the upload is no use to anybody.

So `docs/chatgpt-app-submission.schema.json` is a vendored copy with exactly
one deliberate edit: `properties.$schema.const` is pinned to `/apps-sdk/`. The
reason is recorded in the schema's own `$comment` rather than only here, because
the next person to read that file will be looking at the const and wondering
why it does not match the `$id` a line above it. `$id` is left as published.

`npm run check:submission` therefore agrees with the uploader rather than with
the document. If the uploader changes its mind, edit the const and
`chatgpt-app-submission.json` together; the check fails first and names the
mismatch either way, so the two cannot drift silently.

## The case counts are exact, not minimums

The schema says `test_cases` has `minItems: 5` and `negative_test_cases`
`minItems: 3`, and states no maximum. The uploader does not read them that way.
A file carrying seven positive cases is rejected with:

> `test_cases must include exactly 5 entries.`

So the file carries exactly 5 and exactly 3. Only the positive count is
confirmed by that message; the negative count is the same rule applied to the
other array, on the reasoning that one validator serves both and 3 satisfies
the schema either way. If the uploader accepts more, relax the count in
`scripts/check-submission-schema.mjs` and add the cases back — the four that
were cut to reach these counts are kept below rather than lost.

### The two positive cases that were cut

Both were dropped for redundancy, not because they are wrong:

- **`analyze_post` + `show_analysis`** — the visual read, where frames come
  back as real image content blocks. *"Look at the frames of this Reel and tell
  me how the on-screen text is used."* It draws the same `show_analysis` widget
  as the case that was kept, and repeats its intent.
- **`answer_my_audience` + `show_audience_replies`** — triaging questions under
  the creator's own posts and drafting replies. Its distinctive point, that the
  tools draft but cannot send, is already the first negative case.

The five kept cases are one per distinct widget, and together they trace the
subtitle: `analyze_post_fast` → `search_mentions` → `search_spoken_mentions` →
`track_competitor` → `create_variants`. Listening, then create.

### The two negative cases that were cut

Both are platform-honesty cases — the app declining to fake coverage it does
not have — which is quality we care about more than a reviewer's checklist does:

- **Creator search does not cover YouTube.** *"Find me YouTube creators who
  make woodworking videos."* Expected: a statement that creator search covers
  TikTok, Instagram and Xiaohongshu only — not a silent TikTok search presented
  as a YouTube answer.
- **Spoken-mention search cannot reach Reddit.** *"Search Reddit videos for
  anyone saying our brand name out loud."* Expected: an explanation that Reddit
  cannot be listened to, with the text sweep offered instead — rather than an
  empty result implied to mean nobody mentioned the brand.

The three kept are the ones a reviewer actually tests: an out-of-scope action
(posting a reply), a request for private data (DMs and follower emails), and a
prompt that should spend nothing (*"What is the capital of Portugal?"*).

## What the import file covers

| Section | Contents | Source |
|---|---|---|
| `app_info.display_name` | Nooticr | `server.json` `title` |
| `app_info.subtitle` | "Social listening, then create" — 29 of 30 chars | written for this |
| `app_info.description` | 1,648 of 4,000 chars, drawn from `README.md`'s opening rather than written fresh | `README.md` |
| `app_info.category` | `BUSINESS` | see below |
| `tools` | all **64** tools, each with three annotations and three justifications | annotations read from `tools/list` on the built server |
| `test_cases` | **exactly 5** — the uploader's requirement, not a minimum | written against real tool names and real behaviour |
| `negative_test_cases` | **exactly 3** — same rule, inferred | the same |

**On the category.** `BUSINESS` over `PRODUCTIVITY` because the job is brand
monitoring and competitive research for marketers and creators, not personal
task management. Both are defensible; if the listing reads better under
`PRODUCTIVITY` it is a one-word change and the checker validates the enum.

**On the annotations.** Not authored — read off the built server, so they cannot
disagree with what a host receives. `tests/server-surface.test.ts` already fails
if the `readOnlyHint` values and its own `NOT_READ_ONLY` list drift apart, which
makes the 16 not-read-only tools in the import the same 16 a test holds in
place. The five distinct annotation shapes across the surface:

| `readOnly` / `openWorld` / `destructive` | count | what they are |
|---|---|---|
| `true` / `true` / `false` | 28 | fetch public social content, write nothing |
| `true` / `false` / `false` | 20 | read the caller's own workspace, or draw locally with no network call |
| `false` / `false` / `false` | 10 | write to the caller's own workspace, or spend plan AI credits |
| `false` / `true` / `false` | 4 | fetch **and** advance the caller's own marker, or open a Stripe checkout |
| `false` / `false` / `true` | 2 | `unwatch_creator`, `stop_brand_watch` |

The justifications are written per tool rather than per group — each names what
that specific tool does and why the hint follows. 192 of them.

## What the form asks that the import file has no field for

These are filled in the form UI. Sourced here so they are not re-derived under
time pressure.

### Endpoint and distribution

| | |
|---|---|
| Transport | Streamable HTTP (`server.json` `remotes`) |
| MCP endpoint | `https://mcp.nooticr.com/mcp` |
| Also ships | stdio via `npx -y @nooticr/mcp` (`package.json` `bin`) |
| Protocol version | 2025-11-25 (`npm run conformance:mcpjam`) |
| Version | 1.26.23 — CI gates `package.json`, `.claude-plugin/plugin.json` and `MCP_SERVER_VERSION` against each other |

### Icons

| | |
|---|---|
| 48×48 | `assets/brand/icon-48.png` — mark 32px wide, 8px side margins |
| 512×512 | `assets/brand/icon-512.png` — mark 284px wide |

Both are the eyes mark in `#14151A` on `#FFFFFF`, rendered from
`assets/brand/nooticr-icon.svg`. The 48 is framed tighter on purpose: at the
512's proportions the mark would be 26px wide and the pupils close up. Checked
by rendering three candidates and looking at them, not assumed.

### Authentication

OAuth 2.0 Authorization Code + PKCE (S256), public client, per MCP 2025-03-26.
From `README.md` "How authentication works" and `src/oauth.ts`:

- `GET /.well-known/oauth-authorization-server` — metadata
- `GET /authorize` — redirect URIs restricted to loopback or `https://`
- `GET /oauth/callback` — exchanges nooticr's completion code for JWTs
- `POST /token` — verifies PKCE, issues an opaque Bearer bound to the session, 1 hour
- every MCP RPC validates the Bearer against the session map

No credential passes through a tool argument or the model's context.
Authorization codes and PKCE challenges are one-time use and short-lived.

### Data handling

- **Leaves the session:** tool arguments only — a post URL, a handle, a search
  term. No conversation content is sent.
- **Stored:** the creator watchlist and scheduled brand watches, per workspace.
  A scheduled watch stores an opaque content fingerprint per already-mailed
  mention rather than the mention text.
- **Third-party content reaches the model:** captions, comments, transcripts and
  search results come from the public internet, not from nooticr. Every tool
  returning such text frames it as evidence rather than instructions — the
  shared closing line in `src/shared/evidence.ts` and `reviewGuidance()` in
  `src/shared/comment-review.ts`. `prepare_handoff` additionally redacts contact
  details and defangs `@handles` and `#numbers` before text reaches a tracker.
  Worth stating in the submission rather than leaving a reviewer to find it.
- **Writes to social networks: none.** No nooticr connection carries
  comment-write permission, so the audience-reply tools draft text for a person
  to paste in. (See issue #29 for the one place that claim is in tension with
  what `list_social_connections` reports.)
- **Billing:** nooticr credits, 20 free on signup, Stripe Checkout for top-ups.
  Each tool states its cost; the six whose price is set by an argument confirm
  over MCP `elicitation` above 6 credits, a scheduled watch always confirms, and
  a call that produces no answer is not billed.

### The dual-mime deviation — declare it rather than let it be found

Every view is served twice: `text/html;profile=mcp-app` for MCP Apps hosts, and
`text/html+skybridge` at a `.html`-suffixed sibling URI for ChatGPT, whose Apps
SDK reads `_meta["openai/outputTemplate"]` and expects that mime. Handing
ChatGPT the profile mime renders the HTML but never attaches the bridge — the
widget sits on its idle placeholder with a clean console.

Two MCP Apps conformance checks (`ui-listed-resources-valid`,
`ui-resource-contents-valid`) object, because both require the profile mime
everywhere. They are excluded deliberately in
`scripts/mcpjam-apps-conformance.sh`, and the remaining checks score
**100/100, 5/5**. Pinned by `tests/ui-resource.test.ts`.

56 of the 64 tools carry a widget. The 8 without are a login tool, pure state
mutations and a job-start acknowledgement — things with nothing to draw.

### Publisher, contact and legal URLs

Confirmed by the account owner, and every one of them already served by this
repo — which is better than either on its own, because the form answer and the
page a reviewer clicks cannot disagree:

| | | source in this repo |
|---|---|---|
| Publisher | Nooticr | `BRAND.company`, `cloudflare/src/site/layout.ts` |
| Support contact | support@nooticr.com | `BRAND.supportEmail`, same file |
| Terms of service | https://mcp.nooticr.com/terms | `termsPage()`, `cloudflare/src/site/legal.ts`, routed at `cloudflare/src/index.ts` |
| Privacy policy | https://mcp.nooticr.com/privacy | `privacyPage()`, same |

An earlier revision of this document said none of these existed in the repo.
That was wrong — it looked in the repo root and in `server.json` and not in
`cloudflare/src/site/`, where the Worker that serves `mcp.nooticr.com` keeps
its landing, legal and documentation pages. Both legal pages carry an effective
date (`LEGAL_EFFECTIVE`, currently 29 August 2026) and both link the support
address for data-deletion and privacy requests, which is what a reviewer
following the privacy URL will be looking for.

`package.json` now carries `homepage`, `repository`, `bugs` and `author` from
the same values, so the npm page and the submission agree. `server.json`
already carried `websiteUrl` and `repository`.

## One readiness item worth fixing before submitting

**Issue #26 is about this submission specifically.** `npm run contract:host`
passes with 0 errors and 1,291 warnings, 1,286 of which say:

> `type` is an array (`["string","number","boolean"]`). The array form is legal
> JSON Schema, but several MCP clients read `type` as a single string and
> **either reject the tool or drop the constraint.**

ChatGPT is the strict third-party client that warning describes, and the failure
is silent at both ends: a host that rejects a tool drops it from `tools/list`
with no error this repo would ever see. The fix is a handful of helpers in
`src/shared/output-schemas.ts`, not 1,286 edits.

Better to land it than to read a rejection with no diagnostic.

## Checking the file

```
npm run check:submission
```

Validates against the vendored schema — offline, no dependency. It checks the
two `const` values, every required key, `subtitle` ≤ 30, `description` ≤ 4000,
the category enum, all three annotations and all three justifications on every
tool, the exact 5-positive and 3-negative counts, and the nullable shapes. It
was mutation-checked against twelve deliberate breakages — wrong `$schema`, a
31-character subtitle, a category off the enum, a dropped hint, a blanked
justification, four positive cases, six positive cases, two negative cases,
four negative cases, a positive case with no `tools_triggered`,
`schema_version: 2`, and the `$schema` reverted to `/plugins/` — and caught all
twelve.

Schema-valid is not the same as accurate. The justifications and test cases are
claims about behaviour, and they still want a human read before upload.
