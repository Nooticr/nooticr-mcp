# Quests: testing what happens between two tool calls

Every test tier this repo had before quests checks **one call at a time**.
`tests/*.test.ts` drive `createMcpServer` in-process and assert on a result's
shape. `npm run contract:host` and `npm run conformance:mcpjam` drive the
built server over stdio but only ask it about metadata. The mechanical smoke
tiers (`npm run test:e2e-smoke`) make real calls, but a script chose which
ones. The Playwright suites render a view and click it.

None of them can see the failure that matters most here, because it does not
live in any single call:

> `analyze_post` returns frames, a transcript, and a sentence that ends
> *"When you are done, call `show_analysis` with the url and your analysis —
> it draws what you found ... so it is visible, not only said in chat."*
> The host writes a genuinely good analysis. It never calls `show_analysis`.
> The analysis lands in chat, the view is never drawn, and **every test stays
> green, because every individual call worked.**

A quest is a whole journey: a plain-language user request, a real host, and
an assertion on the **chain** of tools it actually walked.

```bash
npm run test:quests                         # the whole corpus
npm run test:quests -- --filter show        # just the show_* loop
npm run test:quests -- --runs 1 --gate      # one run each, non-zero on a break
npx vitest run tests/quests.test.ts         # the harness's own logic, no model
```

## What quests found, on the first run

### 1. No text-block guidance reaches Claude Code

When a tool result carries `structuredContent`, Claude Code drops **every**
`content` text block, keeps the non-text blocks, and appends the serialised
`structuredContent` as the only text the model sees. All 64 tools the built
server publishes declare an `outputSchema` and therefore return
`structuredContent`. So `evidence.ts`'s premise —

> *"A tool result is the only channel to the calling model — prompts are
> user-controlled and cannot drive anything. So the guidance below is not
> documentation; it is the steering, and it lands in the model's context."*

— does not hold on the host this server is primarily built for. Measured
across a full corpus run: **0 of 59 runs, across 175 tool results, contained
a single guidance phrase.** Seven distinct probes ("when you are done", "so it
is visible", "reason over this yourself", "chosen by scene change", "billed as
the fetches", …) each appear in 0 of 59 transcripts.

`node scripts/chain-map.mjs` reaches the same answer without spending on a
model: it calls all 64 tools for real, finds 31 guidance edges (one tool's
result naming another tool), and reports that **0 of the 31** survive on a
host that renders `structuredContent` — 57 of 64 tools carry their guidance in
a text block and nowhere else.

Say it precisely, because the absolute version is wrong: *text-block* guidance
never arrives. Prose that lives **inside** `structuredContent` does — e.g.
`who_should_i_work_with` ships a whole `rubric` array of instructions and the
model reads it. That is the same channel the fix below relies on.

Reproduced four ways, all run rather than reasoned about:

1. **A minimal server, isolating the cause.** Probes returning the same text
   block with and without `structuredContent`. The model quoted back
   `{"value":42}` for the structured ones and the full passphrase for the
   others. Ruled out one by one, each with its own probe: `outputSchema`
   (a probe with `structuredContent` and no schema still lost its text), size
   (an 11.6 KB text block with no `structuredContent` arrived intact), image
   blocks, `ToolSearch` deferral, config directory, and model.
2. **The mechanism, read out of the shipped binary.** Claude Code 2.1.263
   branches on `"structuredContent" in result && result.structuredContent !== undefined`,
   filters `type !== "text"` out of the content array, and substitutes
   `JSON.stringify(structuredContent)`. Unconditional — no setting, no flag,
   and `outputSchema` is never consulted. Package inspection puts the change
   between claude-code 2.0.0 (no such handling) and 2.1.100 (same branch,
   without even the image-preserving arm), so it is not this machine.
3. **A differential on an instruction that exists nowhere else.** Guidance
   telling the model to pass `sourceId: "EVIDENCE-7742"` to a follow-up tool
   whose own description never mentions it. Guidance in a text block: 0/3 runs
   called the follow-up. The same words inside `structuredContent`: it called
   it and passed `sourceId: "EVIDENCE-7742"` and a `frameSpan` it could only
   have read there.
4. **The real server, the real chain.** A raw MCP client sees `analyze_post`
   return a ~2,000-character guidance block ending in the `show_analysis`
   instruction. The same call in a transcript arrives as
   `[image, image, image, text]` where the text is 903 characters of pure
   `structuredContent`. The model wrote a real analysis — hook, structure,
   contrarian-open, the lot — and delivered all of it in chat.

### 2. What decides whether a chain holds is retrieval, not wording

This is the part that would be easy to get wrong, and the corpus settles it
against the obvious guess.

Chaining is not uniformly dead: `repurpose_post → show_repurposed_post` held
3/3, `create_variants → show_variants` 2/3, `analyze_comments →
show_comment_review` 2/3. The tempting conclusion is that their **descriptions**
carried them. That does not survive contact with the descriptions themselves:
`show_analysis` (1/12) says *"Display an analysis you wrote after analyze_post,
analyze_post_fast or understand_social_post handed you the material… Call this
after you have done the analysing, not instead of it"* — the same template as
`show_repurposed_post`'s, naming three predecessors instead of one.
`show_comparison` and `show_collab_shortlist` (both 0/3) name theirs too.
The wording does not vary between the cases that pass and the cases that fail.

What varies is whether the tool was ever **retrieved**. 64 tools is past the
point where Claude Code keeps them all in context, so every one of them sits
behind a `ToolSearch` and only enters context if a search returns it. Over the
36 runs whose expected chain ends in a `show_*` tool:

| | called |
|---|---|
| `ToolSearch` never returned the `show_*` tool | **0 / 18** |
| `ToolSearch` did return it | **14 / 18** |
| the model's **first** `ToolSearch` query already named it | **9 / 10** |
| it was not in the first query | 5 / 26 |

And the passing case is decided before any description or result is in
context: all three `repurpose_post` runs opened with
`select:repurpose_post,show_repurposed_post` as their very first query. The
chain was committed from the **deferred tool-name list alone** —
`repurpose_post` / `show_repurposed_post` share a distinctive stem, so the
pair gets shortlisted together. `analyze_post` / `show_analysis`, sitting in a
crowded `analyze_*` family, does not: `show_analysis` was retrieved in only
4 of its 12 runs, so in the other 8 its description was never in context at
all and cannot be what failed.

The practical read: **guidance text is dead on this host, and what the surface
achieves it achieves through the tool-name surface.** A `show_X` the model
never searches for steers nothing, however well its description reads.

### 3. Full corpus, 20 quests / 59 runs, ~4.5 minutes at `--concurrency 4`

| result | quests |
|---|---|
| 0/3 | `analyse-post-ends-in-show-analysis`, `quick-read-picks-fast-and-shows-it`, `any-analysis-tool-ends-in-show-analysis`, `comparison-ends-in-show-comparison`, `collab-shortlist-is-shown`, `bug-reports-reach-prepare-handoff`, `competitor-tracking-offers-to-watch`, `missing-handle-recovers-via-search` |
| 1/3 | `hooks-end-in-show-hooks`, `drafting-resolves-the-app-first`, `analyse-post-ends-in-show-analysis` (chat host) |
| 2/3 | `variants-end-in-show-variants`, `comments-end-in-show-comment-review`, `audience-replies-end-in-show-audience-replies` |
| 3/3 | `repurpose-ends-in-show-repurposed-post`, `underperformance-digs-into-the-post`, `platform-is-not-silently-tiktok`, `missing-handle-does-not-switch-network`, `brand-watch-degrades-without-elicitation`, `hooks-end-in-show-hooks` (chat host) |

Four things in there are worth acting on beyond the guidance channel:

- **`track_competitor` never gets picked.** "Track what @x has been doing on
  TikTok, and keep an eye on them" selected `analyze_creator_profile` 3/3,
  then went on to `watch_creator` correctly. Two tools read as the same job,
  and the one the user's own word ("track") names loses.
- **`draft_post` gets called without `list_own_apps` 2/3.** Less alarming than
  it looks: nooticr-server's `resolve_app_target` auto-resolves a workspace
  with exactly one app and refuses an `app_id` from another workspace, so the
  unresolved call is safe. What it costs is on a multi-app workspace, where
  skipping the lookup means the host has no way to pick the right product and
  the user gets an error instead of a draft.
- **The chat host profile chains better than the coding one** on the two quests
  run under both (`hooks`: 3/3 vs 1/3; `analysis`: 1/3 vs 0/3). Claude Code's
  own system prompt makes a model more inclined to answer directly and less
  inclined to make a call it was not explicitly asked for.
- **The handle-miss recovery is one-sided.** The negative half passes 3/3 (an
  empty result on X does not become a TikTok answer) — but that is the model's
  own caution, not the guidance, which never arrived. The positive half
  (`get_user_posts → search_creators` on TikTok) is 0/3.

### What to do about it is a product decision, not a test one

The quest suite deliberately does not fix this. Four routes, with what the
corpus says about each:

- **Carry the guidance inside `structuredContent`** (e.g. a `guidance` field on
  the evidence payload). Verified to work in reproduction 3, and
  `who_should_i_work_with`'s `rubric` shows the channel already carrying prose
  today. Costs an `OUTPUT_SCHEMAS` entry per tool and a check that
  `ui-template.ts`'s generic fallback view does not start drawing a wall of
  prose.
- **Make the `show_*` tools retrievable.** The strongest single predictor in
  the corpus, and nothing else in this list matters if the tool is never
  searched for. That means naming (`show_repurposed_post` wins because it
  shares a stem with `repurpose_post`) and it means the words a host would
  search — `show_analysis` competes with five `analyze_*` tools for the same
  query.
- **Drop `structuredContent` on the tools whose value is the guidance.**
  Cheapest to write, but those tools' views go with it.
- **Move the chain instruction into the tool descriptions.** Necessary but
  demonstrably not sufficient: the descriptions already say it, in the failing
  cases as clearly as in the passing ones.

Re-run `npm run test:quests` after any of them: the rates above are the
baseline to beat.

## What a quest looks like

`quests/quests.json`. Each entry is a user request plus what should happen:

```json
{
  "id": "analyse-post-ends-in-show-analysis",
  "title": "A full analysis ends up drawn, not only said in chat",
  "why": "chain-map edge analyze_post -> show_analysis ...",
  "prompt": "Take a proper look at this TikTok post and give me your read on its hook and structure: {STUB}",
  "runs": 3,
  "expect": { "chain": ["analyze_post", "show_analysis"] }
}
```

`expect` supports:

| key | meaning |
|---|---|
| `chain` | ordered **subsequence** — extra calls in between are fine |
| `chainExact` | the exact call sequence, nothing more |
| `forbid` | tools that must not be called at all |
| `args` | argument assertions on a tool's first call (`{contains}`, `{present}`, `{minLength}`, `{oneOf}`, or a literal) |
| `neverArgs` | no call to this tool may carry these arguments |
| `maxCalls` | a call budget |
| `threshold` | pass rate a quest needs, default 1 |

`why` is required and checked for length by `tests/quests.test.ts`. A red
quest a year from now is only actionable if it says which edge broke and what
the user loses when it does.

`chain` being a subsequence rather than an equality is deliberate: a host
that checks its credit balance on the way, or re-reads a post it already has,
has still followed the chain. Requiring an exact sequence fails on behaviour
nobody would call a bug.

## The host under test is a real host

The driver is the **Claude Code CLI** (`claude -p`), not an agent loop built
for testing. Three things follow from that, and each of them is the point:

- It is the same binary a user installs, with the same system prompt.
- This server publishes 64 tools, which is past the point where Claude Code
  stops putting them all in context and defers them behind a `ToolSearch`.
  A real chain here starts with the model having to *find the next tool by
  name* — which is exactly the condition under which a guidance sentence
  naming that tool earns its keep. No in-process client reproduces it.
- It is where the `structuredContent` finding came from. A test-only driver
  reading `result.content` directly would have reported every chain as
  healthy.

Each quest runs under a **host profile**: `coding` keeps Claude Code's own
system prompt, `chat` replaces it (`--system-prompt`) with a plain assistant
one to stand in for a consumer chat host. Two quests are duplicated across
both on purpose — a chain that holds under one and not the other is a finding
about the host rather than about the guidance, and without both numbers there
is no way to tell those two apart.

Each run is launched in an empty scratch directory. Claude Code reads a
`CLAUDE.md` from its working directory into context, and running from the
repo root would hand the driving model this repo's own account of how its
tools are meant to chain — which would make every quest pass for a reason
that has nothing to do with the server.

## Why the backend is a fixture

`scripts/run-quests.sh` boots `scripts/fixture-server.mjs`, not a real
`nooticr-server`. That is the design, not a convenience:

- What is under test is **this repo** — descriptions, guidance text, argument
  shapes. A quest failing must mean the harness steered wrong, never that a
  scrape came back different today.
- No Rust, Postgres, FFmpeg or ONNX toolchain, so it runs anywhere Node does.
- No credits and no upstream calls, so the only cost is the driving model.

`NOOTICR_E2E_BACKEND=real npm run test:quests` runs the same corpus against a
real server. The chains should not change; if they do, something in the
payload is steering the host, which is worth knowing.

### Fixtures a model can tell are fixtures do not work

This cost two full runs to learn, and it is the part most likely to be
repeated by whoever adds the next quest.

The fixture's frames were a 1×1 transparent PNG — valid, and fine for every
test that only checks a frame round-trips. Put a real model in front of them
and the API returns them as unprocessable; the model reads three unprocessable
frames as *"this post is broken or stub content"* and abandons the job. Fixed:
`fixtureFramePng()` draws small, distinct, describable images.

That was not enough. The caption said *"A fixture caption for local harness
validation — not real content"*, the transcript said *"This is a fixture
transcript for testing"*, and the URL was `e2e.nooticr.test/.../e2e-stub`. The
model did exactly the right thing — told the user it had been handed test
scaffolding and stopped — and the chaining report showed a broken chain that
said nothing about the chain. Fixed: `FIXTURE_POST` in
`scripts/fixture-server.mjs` is one post's worth of plausible content, the
comment set contains a real-sounding bug report (so the
`analyze_comments → prepare_handoff` chain has something to carry), and quests
use a post-shaped URL.

**The rule: a fixture that announces itself changes the behaviour under test,
so it measures itself.** This is the same rule as CLAUDE.md's "never mock the
reasoning step", arriving from the other direction: there, the *model's* half
must be real; here, the *material's* half has to be plausible enough that the
model will engage with it.

## Cost, and why this is not in `npm run verify`

Every run is a real model call. The corpus is 20 quests / 59 runs; a full
sweep took 4m37s wall-clock at `--concurrency 4`. That is
why it is its own command, why `--runs 1` exists, and why the runner
**reports rather than gates** unless you pass `--gate`.

A quest is a measurement before it is a gate. Whether a host follows a chain
is a probability, not a fact, which is why every quest reports a pass rate
over N runs. An LLM-driven gate that goes red on its own noise gets muted
within a week, and then it catches nothing at all.

`scripts/run-quests.sh` soft-skips (exit 0) when there is no `claude` on
PATH, so it is safe in a pipeline that does not have one. The half that needs
no model — the verdict logic and the corpus's own validity — is an ordinary
vitest file and runs on every push.

## What quests do not prove

- **Nothing about `nooticr-server`.** The backend is a fixture. Run
  `npm run test:e2e-smoke` (real mode) for that.
- **Nothing about hosts other than Claude Code.** The `structuredContent`
  behaviour above was measured on Claude Code 2.1.263 and nowhere else.
  ChatGPT, Cursor and Codex may each do something different; `mcpjam compat`
  is the tool for that question, and `--emit-mcpjam` (below) is how the same
  corpus gets there.
- **Nothing about the rendered view.** A quest sees that `show_analysis` was
  called with a real analysis; whether it *draws* correctly is
  `tests/e2e/agentic-visual-full-app.e2e.ts`'s job.
- **It is not a proof of absence.** A quest that passes 3/3 has passed three
  times, on one model, on one day.

## MCPJam: `evals run` no longer exists

`scripts/run-agentic-evals.sh` calls `npx @mcpjam/cli@latest evals run`. At
5.6.0 that command is gone:

```
$ npx -y @mcpjam/cli@latest evals run --tests .mcpjam/tests.json
{"error":{"code":"USAGE_ERROR","message":"error: unknown command 'evals'"}}
```

Evals moved under `mcpjam cloud eval`, are account-bound and paid, and a
suite's targets are servers **registered in an MCPJam Cloud project**
(`{name, id?}` — no `command`/`args`/`env`), so a local stdio
`node dist/index.js` cannot be a target without exposing it over HTTP first.
`.mcpjam/tests.json`'s `expectedToolCalls` is also not a key the current v1
suite schema accepts — it fails contract validation. That whole tier has been
un-runnable since the CLI moved, and nothing said so, because it is
`workflow_dispatch`-only and soft-skips without an API key.

So the local driver is this repo's job now, and what MCPJam can still do is
run the **same corpus** against hosts this sandbox cannot drive:

```bash
node scripts/run-quests.mjs --emit-mcpjam quests/report/mcpjam-suite.json
mcpjam cloud eval validate --file quests/report/mcpjam-suite.json
mcpjam cloud eval run --file quests/report/mcpjam-suite.json \
  --match-options '{"toolCallOrder":"in-order"}'
```

The `--match-options` flag is not optional if you care about order: the v1
suite file can only express `firstToolWas`, and ordered matching
(`in-order` → superset, `exact` → strict) is a run-level override.

## Files

| | |
|---|---|
| `quests/quests.json` | the corpus — user requests and expected chains |
| `scripts/run-quests.sh` | boots a backend, runs the chain map, then the quests |
| `scripts/run-quests.mjs` | the runner: drives, judges, reports |
| `scripts/chain-map.mjs` | what the server *says* should chain, read off the real built server |
| `scripts/quest-lib/assert.mjs` | the verdict logic — pure, unit-tested |
| `scripts/quest-lib/drivers/claude.mjs` | the Claude Code driver and its transcript parser |
| `scripts/quest-lib/mcpjam-suite.mjs` | the MCPJam Cloud exporter |
| `scripts/quest-lib/probe-args.mjs` | arguments that make every tool actually run, for the chain map |
| `tests/quests.test.ts` | the harness's own tests — no model, runs on every push |
| `quests/report/` | gitignored: transcripts, chain map, last run's report |
