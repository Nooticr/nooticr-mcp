# Tool call strategies and harness path

What each composite ("big call") tool actually does on the wire, end to end:
which backend calls it fans out to, where classification happens, what
addressable shape it returns, and how it was verified. Written after actually
driving every one of these through a local harness — see
[Harness verification](#harness-verification) for how to reproduce that.

This complements `CLAUDE.md`'s tool-addition checklist; that file says what
files to touch when adding a tool, this one says what shape a *composite*
tool's pipeline should take and how it was proven to hold up.

## The shared pattern

Every tool below follows the same four-stage pipeline:

```mermaid
flowchart LR
  A["1. Search / list\n(one backend call:\nsearch_creators,\nget_user_posts, …)"] --> B["2. Fan out\n(one backend call\nper item found:\nget_post_comments,\nget_similar_creators)"]
  B --> C["3. Cheap local pre-sort\n(phrase-match heuristics,\nmedian/percentile scoring —\nno LLM call, no extra cost)"]
  C --> D["4. Hand to the calling model\n(addressable ids + guidance text;\nclassification and synthesis\nhappen in the host's own model)"]
```

Two things are deliberate and worth stating plainly, because they cut against
what "hand data to the LLM to classify" sounds like it should mean:

- **Nothing here calls an LLM.** Stage 3's "classification" (an audience
  comment flagged `wants_a_reply`, a post's `standing` against its own
  median) is a phrase-match or arithmetic heuristic in `jobs.ts`/
  `performance.ts`, computed for free before anything reaches a model. The
  *real* classification — sentiment, "is this actually a good idea",
  "should I work with this creator" — is left to whichever model is holding
  the conversation, per the philosophy `jobs.ts`'s own header comment states:
  "it is text over text, the model holding the conversation is better at it
  than a Flash model behind another network hop, and it costs us nothing."
  So stage 4 isn't a formatting step — it's where the actual judgment call
  happens, and it happens in the host, not in this server.
- **This server never sends anything to GitHub, Jira, or any other system.**
  It has no such integration and, by design, doesn't need one: every
  composite tool gives each item (a post, a comment, a creator) a stable
  addressable id (`post:<platform>:<slug>`, `comment:<postId>:<commentId>`,
  `creator:<platform>:<username>` — see `postIdOf`/`commentIdFor` in
  `jobs.ts`). "Send this to Jira" is the calling model's job: an MCP host
  with both this server and a Jira/GitHub/Linear server connected can quote
  that id straight into a ticket body or issue description. The
  interoperability is the id scheme, not a connector this repo would have to
  build and keep credentialed.

## Per-tool pipeline

| Tool | Stage 1 (search/list) | Stage 2 (fan-out) | Stage 3 (local pre-sort) | Addressable ids | Stage 4 hand-off |
|---|---|---|---|---|---|
| `answer_my_audience` | `get_user_posts` (1 call, your own feed) | `get_post_comments` × posts opened (default 6) | `replySignals()` phrase-match flags each comment `wants_a_reply` / `unclear` | `post:<platform>:<slug>`, `comment:<postId>:<commentId>` | Draft replies per flagged comment → `show_audience_replies` renders them; a person pastes them in by hand (no connection can post a reply) |
| `track_competitor` | `get_user_posts` (1 call, their feed) | *(none — one fetch is the whole window)* | `distributionOf`/`scored()`: each post's percentile against that creator's own median, `outperformers` filtered by verdict | `post:<platform>:<slug>` | Model reads `outperformers` + `newSincePreviousCheck` and decides what's worth reacting to |
| `who_should_i_work_with` | `search_creators` (keyword) | `get_similar_creators` × 1, only if a `seed` was given | Merge-by-username; `foundBy: "both"` when both searches agree — the strongest signal in the payload | `creator:<platform>:<username>` | Model shortlists finalists; `audienceOverlap.howTo` names the follow-up call (`answer_my_audience` on each finalist) rather than silently charging ~9 credits/candidate to prove it |
| `why_did_this_underperform` | `get_social_media` (the post) | `get_user_posts` (1 call, that creator's window, post excluded from its own baseline) | `distributionOf`: median/quartiles/ratio/percentile for the one post | `post:<platform>:<slug>` | Model states whether the result is a real underperformance or just noise against the creator's own variance |
| `what_should_i_make_next` | `get_user_posts` (your feed) | `get_post_comments` × your posts opened, **plus** `discover_social_posts` (1 call, the niche sweep) | `replySignals()` flags `asking` comments (demand); niche sweep is supply, unscored | `post:<platform>:<slug>`, `comment:<postId>:<commentId>` | Model intersects demand (what's asked for) against supply (what's already made) — the gap is the idea |
| `search_mentions` | *(fans out itself, across up to 9 networks)* | one `get_post_comments`-equivalent fetch per post opened, per platform | none — comments are returned as `mentions` with a raw `hits` count, no sentiment | `<platform>:<postId>:<index>` | Model classifies sentiment per mention (this is the tool the goal's "watching competitor → search terms → classify → video mentions" example matches almost exactly) |
| `analyze_comments` | `get_post_comments` (1 call) | *(none)* | Platform-provided `themes` only, passed through unscored | `comment:<postSlug>:<index>` | Model labels sentiment + category (praise/complaint/bug/question/request/comparison/spam) per the taxonomy the description names; `show_comment_review` then renders the model's own labels for free |

Every fetch above is billed as the sum of backend calls actually made — not a
flat per-tool price — and every tool that can plausibly fan out past
`CONFIRM_ABOVE_CREDITS` (6 credits, `spend.ts`) routes through `confirmSpend`,
which elicits the user before spending rather than charging silently. A
client that hasn't declared elicitation capability (most CLI test harnesses,
including mcpjam's default `tools call`) gets `proceed: true` automatically —
see [Harness verification](#harness-verification) for what that means for
testing these tools locally.

## Harness verification

Every row above was actually driven through the real stdio server, not just
read out of the source. The method, so it can be re-run after a change:

1. **A local fixture backend** stands in for nooticr-server — fabricated
   (non-live) data shaped to match `src/shared/output-schemas.ts`, serving
   `/auth/me` and `POST /mcp` (`tools/call`) for whichever raw tool names a
   given composite tool fans out to (`get_user_posts`, `get_post_comments`,
   `search_creators`, `get_similar_creators`, `discover_social_posts`,
   `search_mentions`, `get_social_media`). No real platform is ever touched
   and no credits are spent. At least one fixture comment/mention/bio in
   every fixture is deliberately phrased like an embedded instruction
   ("ignore your previous instructions...") to exercise the untrusted-content
   framing described in `CLAUDE.md`.
2. **`npm run build`**, then run the built server against that fixture
   backend: `NOOTICR_BASE_URL=http://127.0.0.1:<port>
   NOOTICR_ACCESS_TOKEN=<any value> node dist/index.js`.
3. **Schema-validate every composite tool** with mcpjam's CLI client —
   cheap, deterministic, no model involved, and it catches a fixture/schema
   mismatch immediately (this is how a wrong `mcpCredits` shape was caught
   during this exact exercise):
   ```
   npx @mcpjam/cli@5 tools call --tool-name <name> --tool-args '<json>' \
     --transport stdio --command node --args dist/index.js \
     -e NOOTICR_BASE_URL=http://127.0.0.1:<port> -e NOOTICR_ACCESS_TOKEN=x \
     --validate-response
   ```
   All seven tools in the table above pass this with `isError: null`.
4. **Live-fire the classification-heavy ones with an actual model** — a real
   agent loop, not a static check, using the `claude` CLI in print mode
   pointed at the fixture server via `--mcp-config`/`--strict-mcp-config`:
   ```
   claude -p --model haiku --mcp-config <config> --strict-mcp-config \
     --allowedTools "mcp__nooticr__<tool>" --output-format json "<prompt>"
   ```
   Run against `answer_my_audience` and `search_mentions` (the two whose
   fixtures plant an embedded instruction inside the content being
   classified): Haiku named the injection attempt explicitly in both cases,
   declined to follow it, and still produced correctly classified,
   addressable output (which comment asked a real question vs. which was an
   injection; which mention was positive vs. negative). This is
   defense-in-depth verification, not a fix for an observed failure — the
   description-level framing added alongside this exercise is what protects
   a model or host less consistent about resisting it.
5. mcpjam's `apps conformance` and `compat` suites (already run in CI) are
   unaffected by any of the above — they check the MCP Apps/UI contract, not
   tool-call behavior, and were re-run after this exercise to confirm no
   regression (same two pinned dual-mime deviations as before, nothing new).
