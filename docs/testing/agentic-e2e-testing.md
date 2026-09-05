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

## Running it

```bash
# One-time: clone nooticr-server as a sibling of this repo (or point
# NOOTICR_SERVER_DIR elsewhere), and have Postgres reachable — see that
# repo's AGENTS.md for the two ways to start it (docker compose vs.
# pg_ctlcluster). This script does not manage Postgres itself.
export DATABASE_URL=postgres://nooticr:nooticr@localhost:5432/nooticr
export ANTHROPIC_API_KEY=sk-ant-...

npm run test:agentic-e2e
```

The script (`scripts/run-agentic-evals.sh`):
1. Skips cleanly (exit 0, clear message) if `ANTHROPIC_API_KEY` is unset —
   this is what makes it safe to land in CI before that secret exists.
2. `npm run build` — the eval runs the real built `dist/index.js`, not
   source.
3. Boots `nooticr-server` (`$NOOTICR_SERVER_DIR`, default `../nooticr-server`)
   with `ALLOW_DEV_LOGIN=1 NOOTICR_E2E_MODE=1 APP_URL=http://localhost:5173`,
   waits for `/health`.
4. `POST /auth/dev-login`, then a `createWorkspace` + `createApp` GraphQL
   mutation (same flow AGENTS.md documents as "the GraphQL auth scope
   gotcha"), then re-logs-in scoped to that workspace — so
   workspace-scoped tools (`list_own_apps`, `draft_post`, ...) have
   something real to read.
5. Generates `.mcpjam/environment.generated.json` and `.mcpjam/llms.json`
   with the live base URL / token / key, and runs
   `npx @mcpjam/cli evals run` against `.mcpjam/tests.json`.
6. Tears the server down (`trap ... EXIT`) and exits with MCPJam's own exit
   code, so this can gate CI once it's proven itself.

## CI

Lives in **`nooticr-server`**, not here — `nooticr-mcp`'s own CI runs on
plain hosted `ubuntu-latest` deliberately (see the comment at the top of
`.github/workflows/ci.yml`: it used to depend on a self-hosted box scoped
to `nooticr-server` and that stalled every run), and building
`nooticr-server` needs its FFmpeg/Rust toolchain (`.github/actions/rust-env`)
and a Postgres service container that already exist there. So
`nooticr-server/.github/workflows/agentic-e2e.yml` checks out both repos,
boots the server the same way `test` does, checks out `nooticr-mcp` at
a chosen ref, and runs this script.

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
