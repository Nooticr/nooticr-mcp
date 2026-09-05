#!/usr/bin/env bash
# Agentic end-to-end tests: boots a real, disposable nooticr-server in test
# mode, builds and runs this repo's real CLI (dist/index.js) against it, and
# has a real LLM drive it through .mcpjam/tests.json via `mcpjam evals run`,
# asserting on which tools it actually called.
#
# See docs/testing/agentic-e2e-testing.md for the full design and why each
# piece here exists. Short version:
#   - nooticr-server's ALLOW_DEV_LOGIN + NOOTICR_E2E_MODE are real, already-
#     shipped test-mode switches (that repo's README "Automated MCP runs
#     (test mode)", scripts/mcp-test-run.sh) — not something invented here.
#   - This repo already reads NOOTICR_BASE_URL / NOOTICR_ACCESS_TOKEN from
#     the environment ahead of the credentials file (src/auth.ts), so the
#     real shipped CLI can be pointed at a throwaway server with no code
#     path different from production.
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
#   EVAL_MODEL          model id passed through to .mcpjam/tests.json's
#                       expectations (informational only here; the model is
#                       actually pinned per test case in tests.json).
set -euo pipefail

say() { printf '%s\n' "$*" >&2; }

# --- Soft-skip when there's nothing to authenticate the driving model with.
# This is what makes it safe to land this script and its CI job before
# ANTHROPIC_API_KEY exists as a secret anywhere: nothing downstream runs,
# and CI stays green instead of red for a secret nobody's added yet.
if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  say "==> skipping agentic E2E evals: ANTHROPIC_API_KEY is not set."
  say "    Every case in .mcpjam/tests.json calls a real model, so this"
  say "    step needs a real API key on purpose. Set ANTHROPIC_API_KEY (or"
  say "    extend scripts/run-agentic-evals.sh + .mcpjam/llms.json for"
  say "    another provider) to actually run it."
  exit 0
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="${NOOTICR_SERVER_DIR:-${REPO_ROOT}/../nooticr-server}"
BASE_URL="http://localhost:8080"
APP_URL="http://localhost:5173" # server only requires this be a loopback origin
WORKSPACE_NAME="agentic-e2e-$(date +%s)"
NIL_UUID="00000000-0000-0000-0000-000000000000"

if [[ ! -f "${SERVER_DIR}/Cargo.toml" ]]; then
  say "error: no nooticr-server checkout at ${SERVER_DIR}."
  say "       Set NOOTICR_SERVER_DIR, or clone nooticr-server as a sibling"
  say "       of this repo."
  exit 1
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  say "error: DATABASE_URL is not set. See nooticr-server/AGENTS.md for how"
  say "       to start Postgres and what to point it at."
  exit 1
fi

json_get() { python3 -c 'import json,sys; print(json.load(sys.stdin)'"$1"')'; }

say "==> npm run build (evals run the real built dist/index.js)"
(cd "${REPO_ROOT}" && npm run build) >&2

say "==> booting nooticr-server (test mode) from ${SERVER_DIR}"
SERVER_LOG="$(mktemp)"
(
  cd "${SERVER_DIR}" && \
  ALLOW_DEV_LOGIN=1 NOOTICR_E2E_MODE=1 APP_URL="${APP_URL}" \
  DATABASE_URL="${DATABASE_URL}" JWT_SECRET="${JWT_SECRET:-agentic-e2e-test-secret}" \
  cargo run -p nooticr-server
) >"${SERVER_LOG}" 2>&1 &
SERVER_PID=$!

cleanup() {
  say "==> stopping nooticr-server (pid ${SERVER_PID})"
  kill "${SERVER_PID}" >/dev/null 2>&1 || true
  wait "${SERVER_PID}" 2>/dev/null || true
}
trap cleanup EXIT

say "==> waiting for ${BASE_URL}/health"
ready=""
for _ in $(seq 1 180); do
  if curl -sS -o /dev/null "${BASE_URL}/health"; then
    ready="1"
    break
  fi
  sleep 1
done
if [[ -z "${ready}" ]]; then
  say "error: nooticr-server never became healthy. Last log lines:"
  tail -n 60 "${SERVER_LOG}" >&2
  exit 1
fi

say "==> POST ${BASE_URL}/auth/dev-login (bootstrap user, no workspace yet)"
bootstrap_login="$(curl -sS --fail-with-body -X POST "${BASE_URL}/auth/dev-login" \
  -H 'content-type: application/json' -d '{}')"
bootstrap_token="$(printf '%s' "${bootstrap_login}" | json_get '["token"]')"

say "==> creating a workspace + app via GraphQL for workspace-scoped tools"
graphql() {
  curl -sS --fail-with-body -X POST "${BASE_URL}/graphql" \
    -H "authorization: Bearer ${bootstrap_token}" \
    -H 'content-type: application/json' \
    -d "$1"
}

ws_query=$(python3 -c '
import json
print(json.dumps({
    "query": "mutation($name: String!, $createdBy: UUID!) { createWorkspace(name: $name, createdBy: $createdBy) { id } }",
    "variables": {"name": "'"${WORKSPACE_NAME}"'", "createdBy": "'"${NIL_UUID}"'"},
}))
')
ws_response="$(graphql "${ws_query}")"
workspace_id="$(printf '%s' "${ws_response}" | json_get '["data"]["createWorkspace"]["id"]')"
say "    workspace ${workspace_id}"

app_query=$(python3 -c '
import json
print(json.dumps({
    "query": "mutation($workspaceId: UUID!, $name: String!, $slug: String!) { createApp(workspaceId: $workspaceId, name: $name, slug: $slug) { id } }",
    "variables": {"workspaceId": "'"${workspace_id}"'", "name": "Agentic E2E App", "slug": "agentic-e2e-app"},
}))
')
app_response="$(graphql "${app_query}")"
app_id="$(printf '%s' "${app_response}" | json_get '["data"]["createApp"]["id"]')"
say "    app ${app_id}"

say "==> POST ${BASE_URL}/auth/dev-login (re-login scoped to that workspace)"
scoped_login_body=$(python3 -c 'import json; print(json.dumps({"workspace_id": "'"${workspace_id}"'"}))')
scoped_login="$(curl -sS --fail-with-body -X POST "${BASE_URL}/auth/dev-login" \
  -H 'content-type: application/json' -d "${scoped_login_body}")"
token="$(printf '%s' "${scoped_login}" | json_get '["token"]')"

say "==> writing .mcpjam/environment.generated.json and .mcpjam/llms.json"
python3 - "${REPO_ROOT}" "${BASE_URL}" "${token}" "${ANTHROPIC_API_KEY}" <<'PY'
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

say "==> npx @mcpjam/cli evals run"
set +e
(cd "${REPO_ROOT}" && npx -y @mcpjam/cli@latest evals run \
  --tests .mcpjam/tests.json \
  --environment .mcpjam/environment.generated.json \
  --llms .mcpjam/llms.json)
eval_status=$?
set -e

rm -f "${REPO_ROOT}/.mcpjam/environment.generated.json" "${REPO_ROOT}/.mcpjam/llms.json"

if [[ ${eval_status} -ne 0 ]]; then
  say "==> agentic evals failed (exit ${eval_status}). Server log:"
  tail -n 60 "${SERVER_LOG}" >&2
fi
exit ${eval_status}
