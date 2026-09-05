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
| **MCPJam** (`@mcpjam/cli`) | Real agent loop against a real MCP server; `expectedToolCalls` diffing, `runs: N` for stability. Already used here for conformance. | **Chosen** — one tool family, not two |
| Official `@modelcontextprotocol/inspector` | Headless CLI mode, but scripted single JSON-RPC calls — not an agent loop. Most mature/widely-used project surveyed (10k+★). | Good for protocol checks (already used here); not sufficient alone for agentic behavior |
| `modelcontextprotocol/conformance`, `YawLabs/mcp-compliance` | Official / third-party protocol-spec conformance, no LLM involved | Complementary, not agentic; worth a spike alongside the existing MCPJam conformance step |
| `lastmile-ai/mcp-eval` | Python, richest assertion vocabulary (call sequence, OTel traces, weighted LLM-judge rubrics), pytest-native | Real alternative if assertions need to grow past tool-call matching |
| `mcp-use/eval-action` | Small GitHub Action; YAML cases with rubric + regex/contains argument matching + threshold | Closest single-file drop-in to what MCPJam's *marketing* implies it does — worth a look if MCPJam's actual assertion surface turns out too thin |
| promptfoo MCP provider | Mature general eval tool; `mcp.enabled: true` mode lets a real model freely call tools across a conversation, multi-turn | Reasonable if this repo ever wants MCP evals alongside other promptfoo suites already in use elsewhere |
| Academic benchmarks (MCP-AgentBench, MCP-Bench, etc.) | LLM-as-judge methodology over curated multi-server tasks | Ideas only — not installable CI tooling |

Every option in this table needs a real LLM API key at run time; none of
them offer free hosted inference for headless/CI use. That's the actual
constraint on how often this can run, not tooling maturity.
