#!/usr/bin/env bash
# Agentic end-to-end tests: boots a real, disposable nooticr-server in test
# mode, builds and runs this repo's real CLI (dist/index.js) against it, and
# has a real LLM drive it through .mcpjam/tests.json via `mcpjam evals run`,
# asserting on which tools it actually called.
#
# This is the layer that needs a real model (real tokens, non-deterministic
# by nature — see docs/testing/agentic-e2e-testing.md). If what you want is
# to check the plumbing itself — does the built CLI actually speak MCP
# correctly against a real test-mode server — without spending on a model,
# that's scripts/run-mechanical-e2e-smoke.sh instead; it shares the same
# boot/login logic (scripts/e2e-server-lib.sh) and needs no API key at all.
#
# TEST ONLY. Never set these env vars against a real deployment: dev-login
# mints a session with no credentials, and E2E mode skips credit billing.
#
# Usage:
#   DATABASE_URL=postgres://nooticr:nooticr@localhost:5432/nooticr \
#   ANTHROPIC_API_KEY=sk-ant-... \
#     npm run test:agentic-e2e
#
# Env vars:
#   ANTHROPIC_API_KEY   required to actually run evals (real model calls,
#                       real tokens); missing it is a soft skip (exit 0),
#                       not a failure — see below.
#   DATABASE_URL        required; Postgres nooticr-server should migrate
#                       into. This script does not start Postgres itself —
#                       see nooticr-server/AGENTS.md for the two ways
#                       (docker compose vs. pg_ctlcluster).
#   NOOTICR_SERVER_DIR  path to a nooticr-server checkout (default: sibling
#                       directory "../nooticr-server").
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=./e2e-server-lib.sh
source "${REPO_ROOT}/scripts/e2e-server-lib.sh"

# --- Soft-skip when there's nothing to authenticate the driving model with.
# This is what makes it safe to land this script and its CI job before
# ANTHROPIC_API_KEY exists as a secret anywhere: nothing downstream runs,
# and CI stays green instead of red for a secret nobody's added yet.
if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  e2e_say "==> skipping agentic E2E evals: ANTHROPIC_API_KEY is not set."
  e2e_say "    Every case in .mcpjam/tests.json calls a real model, so this"
  e2e_say "    step needs a real API key on purpose. Set ANTHROPIC_API_KEY (or"
  e2e_say "    extend this script + .mcpjam/llms.json for another provider)"
  e2e_say "    to actually run it."
  e2e_say ""
  e2e_say "    To validate the harness itself right now with no API key,"
  e2e_say "    run: npm run test:e2e-smoke"
  exit 0
fi

e2e_build_mcp
e2e_require_prereqs
e2e_start_server
trap e2e_stop_server EXIT
e2e_provision

e2e_say "==> writing .mcpjam/environment.generated.json and .mcpjam/llms.json"
python3 - "${REPO_ROOT}" "${NOOTICR_BASE_URL}" "${NOOTICR_ACCESS_TOKEN}" "${ANTHROPIC_API_KEY}" <<'PY'
import json
import sys

repo_root, base_url, token, api_key = sys.argv[1:5]

with open(f"{repo_root}/.mcpjam/environment.template.json") as f:
    text = f.read()
text = text.replace("__NOOTICR_BASE_URL__", base_url).replace("__NOOTICR_ACCESS_TOKEN__", token)
env = json.loads(text)
del env["_comment"]
with open(f"{repo_root}/.mcpjam/environment.generated.json", "w") as f:
    json.dump(env, f, indent=2)

with open(f"{repo_root}/.mcpjam/llms.json", "w") as f:
    json.dump({"anthropic": api_key}, f, indent=2)
PY

e2e_say "==> npx @mcpjam/cli evals run"
set +e
(cd "${REPO_ROOT}" && npx -y @mcpjam/cli@latest evals run \
  --tests .mcpjam/tests.json \
  --environment .mcpjam/environment.generated.json \
  --llms .mcpjam/llms.json)
eval_status=$?
set -e

rm -f "${REPO_ROOT}/.mcpjam/environment.generated.json" "${REPO_ROOT}/.mcpjam/llms.json"

if [[ ${eval_status} -ne 0 ]]; then
  e2e_say "==> agentic evals failed (exit ${eval_status}). Server log:"
  tail -n 60 "${SERVER_LOG}" >&2
fi
exit ${eval_status}
