# Agentic end-to-end testing

What this repo's CI already checks, before this doc, is entirely **protocol
and schema conformance**: `tests/*.test.ts` drive `createMcpServer` in-process
against a stub `NooticrClient`; CI's Host contract / Host compatibility / MCP
Apps conformance steps boot the real built `dist/index.js` and drive it with
`@modelcontextprotocol/inspector` and `@mcpjam/cli` — real third-party MCP
clients, but ones that check tool metadata, resource shapes and dual-mime
UI resources, not whether calling a tool actually does the right thing.
Nothing anywhere boots this server and has an LLM decide which tool to call,
with what arguments, and checks the outcome — the failure mode that matters
most (an agent calls `analyze_post` when it meant `analyze_post_fast`, or
passes another workspace's `appId`) is invisible to all of the above.

This doc adds that missing layer: **agentic E2E testing** — a real LLM,
acting as an MCP client, driving real conversations against this server
(built exactly as shipped) backed by a real, disposable `nooticr-server`
instance, with assertions on which tools actually got called.

## The two pieces that make this possible

**1. `nooticr-server` already has a test-mode backend for exactly this.**
`ALLOW_DEV_LOGIN=1` (mints a JWT with no credentials via `POST
/auth/dev-login`) and `NOOTICR_E2E_MODE=1` (skips MCP credit debiting,
answers `https://e2e.nooticr.test/import/<platform>/e2e-stub` URLs from a
built-in fixture instead of scraping) are both real, already-shipped,
already-tested mechanisms — see that repo's README ("Automated MCP runs
(test mode)") and `scripts/mcp-test-run.sh`. Both are opt-in and the server
refuses to boot with either set unless `APP_URL` is a loopback origin, so
there's no risk of this leaking into a real deployment. This is the piece
that makes an agentic test *behaviorally meaningful* rather than a mock:
the tool call goes through this repo's real `NooticrClient` → real JSON-RPC
→ `nooticr-server`'s real `mcp_tools.rs` dispatch → real workspace-authz
checks (`resolve_app_target`, `require_app_in_workspace`) against a real
Postgres. An agent that gets handed the wrong `appId` and the backend lets
it through is a real bug this setup can catch; a mocked backend can't.

**2. This repo already reads `NOOTICR_ACCESS_TOKEN` and `NOOTICR_BASE_URL`
from the environment**, bypassing both the credentials file and the
browser OAuth flow (`src/auth.ts`, `src/config.ts` — "env
`NOOTICR_ACCESS_TOKEN` > credentials file"). So the *exact* CLI a user
installs (`node dist/index.js`, stdio transport) can be pointed at a
throwaway `nooticr-server` and handed a dev-login token, with no code path
different from production other than which server it talks to.

Put together: boot `nooticr-server` in test mode, log in, run this repo's
real built CLI against it, and let a real model drive it. That's the whole
mechanism — `scripts/run-agentic-evals.sh` automates it end to end.

## What drives the conversation: MCPJam Evals

Surveyed the current (2026) landscape before picking a tool — full notes
below. Landed on **MCPJam** (`@mcpjam/cli evals run`) because this repo's
CI already depends on it for conformance/compat checking
(`scripts/mcpjam-apps-conformance.sh`), so it's one tool family to know
instead of two, and because it does the one thing needed here without
extra ceremony: point it at a server (any stdio/HTTP MCP server — no
MCPJam-specific SDK to embed), give it API keys, give it test cases as
plain-language `query` strings with an `expectedToolCalls` list, and it
runs a real agent loop, records `actualToolCalls`, and diffs the two.

Everything MCPJam needs lives in `.mcpjam/`:
- `environment.template.json` — the server(s) under test. This repo's
  variant is a stdio command (`node dist/index.js`) with `NOOTICR_BASE_URL`
  / `NOOTICR_ACCESS_TOKEN` filled in at run time by the boot script (never
  committed with real values — `environment.generated.json` is gitignored).
- `llms.json` (gitignored, generated from `ANTHROPIC_API_KEY`) — provider
  keys for the model doing the driving.
- `tests.json` — the actual test cases (committed; see below).

Caveat worth stating plainly: I could not verify MCPJam's evals config
format and assertion vocabulary against its live docs
(`docs.mcpjam.com/evals/*`) — that domain was unreachable from this
environment's egress policy. What's in `tests.json` is built from a
verified primary source (`MCPJam/evals-cli-starter` on GitHub, fetched
directly) rather than blog/search summaries, but the exact CLI flags and
any richer assertion types (argument matching, LLM-judge rubrics) should be
re-checked against `docs.mcpjam.com/evals/overview` before leaning on this
for anything beyond `expectedToolCalls`. If that turns out wrong or MCPJam
adds a config version bump, the fallback in the survey below
(`mcp-use/eval-action`, a GitHub Action with a richer rubric+regex
assertion format, or `lastmile-ai/mcp-eval`, a Python framework with the
richest assertion vocabulary of anything surveyed: call sequencing, OTel
traces, weighted LLM-judge rubrics) are both real, working alternatives if
this needs to grow past "was the right tool called."

## Three tiers, from "needs nothing" to "needs everything"

Getting a real model in the loop turned out to have a dependency chain
underneath it worth pulling apart, because each layer is independently
useful and independently blocked by something different:

| Tier | Script | Needs | Proves |
|---|---|---|---|
| **Fixture smoke** | `npm run test:e2e-smoke:fixture` | Just Node | This repo's real built CLI actually speaks MCP correctly — connects over stdio, `tools/list`, `tools/call` round-trips a real JSON-RPC response — against `scripts/fixture-server.mjs`, a pure-Node stand-in for the three endpoints (`/auth/dev-login`, `/graphql`, `/mcp`) the harness and `NooticrClient` actually touch. |
| **Real smoke** | `npm run test:e2e-smoke` | Rust + Postgres + FFmpeg/ONNX toolchain (no LLM key) | The same protocol round-trip against **real** `nooticr-server` behavior — real workspace-authz, real dev-login, real `NOOTICR_E2E_MODE` fixture-URL handling. |
| **Agentic evals** | `npm run test:agentic-e2e` | Real smoke's requirements + `ANTHROPIC_API_KEY` | Does a real model call the *right* tool — the layer neither smoke tier can check, since both drive fixed, scripted tool calls. |

The fixture tier exists because building `nooticr-server` needs a real
Rust/Postgres/FFmpeg/ONNX toolchain that isn't available everywhere — this
doc was written in an environment where it genuinely isn't: `ort-sys`
(the ONNX Runtime binding `crates/media` depends on for YAMNet audio
classification) fetches a prebuilt binary from `cdn.pyke.io` at build time,
and that host was outside the sandbox's network egress allowlist, so
`cargo build -p nooticr-server` fails there no matter what — a network
policy limit, not a bug in either repo (confirmed by installing this
repo's exact CI recipe, `.github/actions/rust-env`'s apt packages, by hand:
every FFmpeg header resolved fine; only the ONNX download was blocked).
Without the fixture tier, that meant **no way to prove this harness's own
scripts were mechanically correct** — real bugs in `scripts/e2e-server-lib.sh`
or `scripts/mcp-smoke-client.mjs` would have been indistinguishable from
"couldn't test it here." `scripts/fixture-server.mjs`'s header spells out
exactly what it does and doesn't stand in for; the short version is it
proves the wiring, not `nooticr-server`'s actual behavior — run the real
tier (or agentic evals) before trusting a change to either repo's
backend-facing logic.

All three share `scripts/e2e-server-lib.sh` (one boot/login/provision
implementation, `NOOTICR_E2E_BACKEND=real|fixture` switches which backend it
boots) so they can't drift on how a server gets stood up and logged into.

```bash
# Fastest — needs nothing but Node. Verified working end to end while
# writing this doc, in an environment that could not build nooticr-server:
npm run test:e2e-smoke:fixture

# Real backend, no LLM — needs Rust/Postgres reachable (see nooticr-server's
# AGENTS.md), no API key:
export DATABASE_URL=postgres://nooticr:nooticr@localhost:5432/nooticr
npm run test:e2e-smoke

# Real backend + a real model:
export ANTHROPIC_API_KEY=sk-ant-...
npm run test:agentic-e2e
```

What `scripts/e2e-server-lib.sh` actually does, in "real" mode (the fixture
mirrors the same sequence against its own in-memory state):
1. Boots `nooticr-server` (`$NOOTICR_SERVER_DIR`, default `../nooticr-server`)
   with `ALLOW_DEV_LOGIN=1 NOOTICR_E2E_MODE=1 APP_URL=http://localhost:5173`,
   waits for `/health`.
2. `POST /auth/dev-login`, then a `createWorkspace` + `createApp` GraphQL
   mutation (same flow AGENTS.md documents as "the GraphQL auth scope
   gotcha"), then re-logs-in scoped to that workspace — so
   workspace-scoped tools (`list_own_apps`, `draft_post`, ...) have
   something real to read.
3. Exports `NOOTICR_BASE_URL`/`NOOTICR_ACCESS_TOKEN` for whichever caller
   sourced it — `scripts/mcp-smoke-client.mjs` (smoke tiers) or
   `scripts/run-agentic-evals.sh`, which additionally generates
   `.mcpjam/environment.generated.json` + `.mcpjam/llms.json` from those and
   runs `npx @mcpjam/cli evals run` against `.mcpjam/tests.json`.
4. Tears the server down (`trap ... EXIT`) and exits with the underlying
   tool's exit code, so any of the three can gate CI once proven.

`run-agentic-evals.sh` additionally skips cleanly (exit 0, clear message,
pointing at `test:e2e-smoke`) if `ANTHROPIC_API_KEY` is unset — what makes
it safe to land in CI before that secret exists.

## Visual / click testing

Everything above tests *data* — does the right tool get called, with the
right structured content back. None of it renders the actual widget a user
sees or clicks anything in it. Two layers cover that, and they test
different things:

- **`tests/e2e/ui-template.e2e.ts`** (pre-existing, ~90 Playwright tests) —
  loads `NOOTICR_UI_TEMPLATE` in a real browser and clicks real buttons
  (`.mp-pick`, `#pickgo`, `.ai-btn`, filter chips, sort buttons, ...),
  asserting on the exact `postMessage` the widget sends back — real widget
  behavior, but against **hand-crafted fixture data**. Thorough on layout
  and interaction logic; proves nothing about whether that data shape is
  what a real tool call actually produces.
- **`tests/e2e/agentic-visual.e2e.ts`** and **`tests/e2e/agentic-visual-full-app.e2e.ts`**
  (new) close that gap, across every view the template can reach: boot
  `scripts/fixture-server.mjs` (each on its own port, via the shared
  `tests/e2e/support/mcp-e2e-session.ts`, so Playwright's `fullyParallel`
  running both files at once never collides), make a real `tools/call`
  through this repo's real built CLI, take the **real** `structuredContent`
  that came back, render the same widget with it, and click every
  host-facing button in that view — not just checking the resulting
  `postMessage` shape, but for buttons whose click issues another
  `tools/call`, actually executing that follow-up call for real through the
  same client and confirming it succeeds. That's the literal answer to "do
  these buttons really drive the right next thing": not a guess from
  reading the message, but making the call the button asked for and
  watching whether it works.

  Between the two files: the posts gallery (`discover_social_posts`) in
  depth (`agentic-visual.e2e.ts`), and all nine other reachable views —
  single post card + its four `ai-btn` actions round-tripped for real,
  the two Monitor variants (`search_mentions`, `show_comment_review`),
  transcript, hashtags, comments, sounds, creators, credits, checkout
  (`agentic-visual-full-app.e2e.ts`). What's covered vs. not, precisely:
  `docs`/§ below lists the tools with no UI view at all (nothing to click),
  and every reachable view now has at least one real-call test; the
  meaningfully-interactive ones (posts gallery, single post, both Monitor
  variants, transcript, hashtags) have every host-facing control clicked,
  not just rendered.

  Verified for real in the environment that wrote this doc, from a clean
  `dist/`: both files pass on their own, and the full suite
  (`npx playwright test`, 105 tests) passes together. Needs the same
  Chromium install as the existing e2e suite
  (`npx playwright install --with-deps chromium`).

**On MCPJam specifically** — the user prompt that led to this section was
right that MCPJam has something here, and it's more than the evals feature
above: verified directly against `MCPJam/inspector`'s source (not just its
docs, which were unreachable from this sandbox), `apps render` and
`apps session start/action/snapshot/step/close`
(`cli/src/commands/apps.ts`) genuinely mount a `ui://` resource in a real
headless Chromium and let you drive it — by role/name/testId, Playwright-
locator-style — then report `widgetToolCalls` (what the widget posted back)
with a dedicated `widgetToolCalled` assertion. That's a real alternative to
the hand-written spec above, done through the same CLI already used for
conformance/compat rather than a bespoke Playwright file. Two reasons this
change uses the hand-written spec instead, both practical rather than
"MCPJam can't do it": (1) `tests/e2e/ui-template.e2e.ts` already established
this repo's own Playwright pattern, so `agentic-visual.e2e.ts` is one more
file in a style already reviewed and trusted here, not a new tool surface;
(2) it's what I could actually run and verify end-to-end in this sandbox —
standing up MCPJam's own Inspector server to drive `apps session` wasn't
something I exercised, so I'm not claiming it works here, only reporting
precisely what the source says it does. If `agentic-visual.e2e.ts`'s
one-flow coverage needs to grow into several widget-interaction cases,
`mcpjam apps session` is worth adopting then — one caveat found in the
source worth knowing before relying on it for a CI gate: the raw
`apps session action/step` commands don't set a process exit code from the
assertion result themselves (only `apps conformance`, `conformance-suite`,
and `apps render --require-render` do) — a script driving `apps session`
in CI has to check the JSON `ok` field itself, the same thing
`agentic-visual.e2e.ts`'s own `expect()` calls do.

## Bugs this exercise surfaced — and what happened to each

Testing every reachable view against real tool-call output — not the
hand-crafted fixtures the pre-existing widget suite uses — found six real
product issues, each proven with an actual executed call in
`tests/e2e/agentic-visual-full-app.e2e.ts` (see that file's comments for
exact line references), not inferred from reading the code. Four were
fixed; two turned out to be intentional design, closed a different way
after the product owner weighed in.

**Fixed:**

1. **The Monitor view's "Analyse these" button sent an argument shape
   `analyze_comments` rejects** — `{comments, ids}` against a real
   `{url, limit?}.strict()` schema, a guaranteed rejection on any real host.
   Fixed in `ui-template.ts`: it now resolves which post the picks belong
   to and calls `analyze_comments` on that post's url when they're all the
   same one, or refuses to send anything (with a clear button message)
   when they span multiple posts — the tool has no way to act on an
   arbitrary cross-post selection, so sending nothing is correct, not a
   remaining gap.
2. **`buy_nooticr_credits`'s pack cards had no click handler**, and
   hardcoded three fixed prices regardless of the real `d.checkoutUrl`/
   `d.packs`. Fixed: each card is now a real `<a href>` to the real
   checkout URL, built from the real `d.packs` when present, so the
   existing generic anchor handler opens it via `ui/open-link` — same
   mechanism every other "Open on ..." link already used.
3. **That same `checkoutUrl` arrived mangled by the image proxy** —
   `tools.ts`'s `proxyUrls()` only exempted a fixed key list from
   rewriting, and `checkoutUrl` wasn't on it, so any URL-shaped string
   value got routed through `/media/proxy?url=...` regardless of key name.
   Fixed: `checkoutUrl` added to `RAW_URL_KEYS`; it now passes through raw.
4. **`generate_captions` rendered "No transcript available" despite
   returning real cues** — its real output has no `available` field, and
   the transcript view's gate required one truthy before showing anything.
   Fixed: a present, non-empty `transcript` is now itself accepted as
   evidence of availability. (Its Copy button was separately dead too —
   `class="btn btn-sm"` with a `data-copy` attribute that neither of the
   file's two copy-click handlers matched; now also carries `.copyable`.)

**Left alone, on purpose — the product owner confirmed the design:**

5. **`compare_posts` only ever fetches `urls[0]`**, never sets
   `.comparison`, never returns `.posts` — the dedicated comparison
   scoreboard view was unreachable by any real call.
6. **`analyze_post`/`analyze_post_fast`/`understand_social_post` never
   set `.analysis`** — same root cause: both run through `runEvidence()`,
   which returns evidence and a guidance instruction, never a verdict. The
   `analysisCard` view (an AI verdict, meters, quotable lines, hashtag
   chips) was unreachable the same way.

Both looked like bugs from the widget's side — a rich view built for a
shape nothing ever produces — but the *reason* is this repo's actual,
documented design: "Nothing here calls a model of ours, so nothing here
sells you a judgement" (README, "Your own model does the thinking"). The
Rust backend crate these tools proxy to (`crates/mcp/src/tools.rs` in
`nooticr-server`) genuinely does have separate, real AI-generation code
for these same tool names — `text_ai()` calls, real prompts — but that's
used by `nooticr-server`'s own internal dashboard copilot (a first-party
surface with no other model in the loop), not by this repo's public MCP
surface. Confirmed directly with the product owner: **the host LLM (the
one the person is already talking to) should do all the writing/analysis,
never a second model on the server.** What *was* genuinely missing wasn't
server-side generation — it was somewhere for the host LLM's own writing
to land. So instead of making `compare_posts`/`analyze_post_fast`/etc. call
real AI generation (which would reverse the documented design and its
pricing model — these are priced at fetch-cost, not generation-cost), five
new free, no-request tools close the loop the same way `show_comment_review`
already did for `analyze_comments`:

- **`show_comparison`** renders the (previously unreachable) comparison
  scoreboard — the model does the actual comparing across
  `get_social_media` calls, then calls this with the real posts + its
  comparison.
- **`show_analysis`** renders the (previously unreachable) `analysisCard` —
  same idea, for `analyze_post`/`analyze_post_fast`/`understand_social_post`.
- **`show_hooks`**, **`show_variants`**, **`show_repurposed_post`** are new
  view code (this repo had no existing branch for a hooks list, a variants
  list, or per-surface rewritten copy) for `write_hooks`, `create_variants`
  and `repurpose_post` respectively.

Every evidence tool's guidance text (`evidence.ts`) now ends with an
instruction to call the matching `show_*` tool when the model is done
writing. All five are exercised for real in
`tests/e2e/agentic-visual-full-app.e2e.ts` — including the two reusing
existing view branches and the three exercising genuinely new view code,
none of which had ever rendered in a real browser before those tests.

## CI

The **fixture tier needs none of nooticr-server's toolchain** (see the table
above), so it runs directly in *this* repo's own `.github/workflows/ci.yml`,
as an always-on step (`npm run test:e2e-smoke:fixture`, plain Node, no new
job or service dependencies) right after the package build, on every push —
no secret, no cross-repo checkout, nothing to provision first.

The real-backend and agentic tiers live in **`nooticr-server`**, not here —
`nooticr-mcp`'s own CI runs on plain hosted `ubuntu-latest` deliberately (see
the comment at the top of `.github/workflows/ci.yml`: it used to depend on a
self-hosted box scoped to `nooticr-server` and that stalled every run), and
building `nooticr-server` needs its FFmpeg/Rust toolchain
(`.github/actions/rust-env`) and a Postgres service container that already
exist there. So `nooticr-server/.github/workflows/agentic-e2e.yml` checks
out both repos, boots the server the same way `test` does, checks out
`nooticr-mcp` at a chosen ref, and runs `test:agentic-e2e`.

That workflow is **`workflow_dispatch`-only** for now, on purpose: every run
calls a real model once per test case, which costs real tokens, and there's
no `ANTHROPIC_API_KEY` (or cross-repo checkout PAT) provisioned in either
repo yet, so it can't run automatically until someone adds those secrets.
Once it's been run manually a few times and its false-positive rate is
known, promoting it to a nightly `schedule:` (commented out in the
workflow already) is the natural next step — not gating every PR, since
LLM-judge/agentic evals are inherently non-deterministic (MCPJam's own
`runs: N` field exists because of this) and a flaky gate on every PR erodes
trust in CI faster than it catches bugs.

## Survey of the field (2026), condensed

Full detail lives in this PR's description / the research that produced it;
the shape of the decision:

| Tool | What it actually does | Verdict |
|---|---|---|
| **MCPJam** (`@mcpjam/cli`) | Real agent loop against a real MCP server; `expectedToolCalls` diffing, `runs: N` for stability. Also — verified directly against its source, not just docs — a genuine widget-rendering/click layer (`apps session`/`apps render`): real headless Chromium via Playwright, drives a rendered `ui://` resource by role/name/testId, and reports `widgetToolCalls` back with a `widgetToolCalled` assertion type. Already used here for conformance. | **Chosen for evals**; its widget-interaction layer is a real alternative to the Playwright spec below — see "Visual / click testing" |
| Official `@modelcontextprotocol/inspector` | Headless CLI mode, but scripted single JSON-RPC calls — not an agent loop. Most mature/widely-used project surveyed (10k+★). | Good for protocol checks (already used here); not sufficient alone for agentic behavior |
| `modelcontextprotocol/conformance`, `YawLabs/mcp-compliance` | Official / third-party protocol-spec conformance, no LLM involved | Complementary, not agentic; worth a spike alongside the existing MCPJam conformance step |
| `lastmile-ai/mcp-eval` | Python, richest assertion vocabulary (call sequence, OTel traces, weighted LLM-judge rubrics), pytest-native | Real alternative if assertions need to grow past tool-call matching |
| `mcp-use/eval-action` | Small GitHub Action; YAML cases with rubric + regex/contains argument matching + threshold | Closest single-file drop-in to what MCPJam's *marketing* implies it does — worth a look if MCPJam's actual assertion surface turns out too thin |
| promptfoo MCP provider | Mature general eval tool; `mcp.enabled: true` mode lets a real model freely call tools across a conversation, multi-turn | Reasonable if this repo ever wants MCP evals alongside other promptfoo suites already in use elsewhere |
| Academic benchmarks (MCP-AgentBench, MCP-Bench, etc.) | LLM-as-judge methodology over curated multi-server tasks | Ideas only — not installable CI tooling |

Every option in this table needs a real LLM API key at run time; none of
them offer free hosted inference for headless/CI use. That's the actual
constraint on how often this can run, not tooling maturity.
