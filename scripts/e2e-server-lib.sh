#!/usr/bin/env bash
# Shared boot/login/provision logic for the two agentic-E2E entry points
# (scripts/run-agentic-evals.sh, scripts/run-mechanical-e2e-smoke.sh). One
# copy so the two never drift on how a test-mode nooticr-server gets booted
# and logged into — see docs/testing/agentic-e2e-testing.md for the full
# design.
#
# TEST ONLY. This boots a real nooticr-server with ALLOW_DEV_LOGIN=1 and
# NOOTICR_E2E_MODE=1 (no credential check, no credit billing) — never point
# these functions at anything but a throwaway local instance.
#
# Meant to be `source`d, not executed. Sets these on success:
#   SERVER_PID, SERVER_LOG   (e2e_start_server)
#   NOOTICR_BASE_URL, NOOTICR_ACCESS_TOKEN, NOOTICR_E2E_APP_ID  (e2e_provision)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="${NOOTICR_SERVER_DIR:-${REPO_ROOT}/../nooticr-server}"
BASE_URL="http://localhost:8080"
APP_URL="http://localhost:5173" # server only requires this be a loopback origin
NIL_UUID="00000000-0000-0000-0000-000000000000"
# "real" boots the actual nooticr-server (Rust/Postgres) — the only mode
# that proves anything about its actual behavior. "fixture" boots
# scripts/fixture-server.mjs, a pure-Node stand-in implementing just the
# endpoints this lib and mcp-smoke-client.mjs touch — no Rust/Postgres/
# FFmpeg/ONNX toolchain needed, so it's what to reach for to validate this
# repo's own MCP-protocol wiring somewhere that toolchain isn't available
# (or just to iterate faster). See scripts/fixture-server.mjs's header for
# exactly what it does and doesn't prove.
BACKEND_MODE="${NOOTICR_E2E_BACKEND:-real}"

e2e_say() { printf '%s\n' "$*" >&2; }

e2e_json_get() { python3 -c 'import json,sys; print(json.load(sys.stdin)'"$1"')'; }

e2e_build_mcp() {
  e2e_say "==> npm run build (this repo's real built dist/index.js, not source)"
  (cd "${REPO_ROOT}" && npm run build) >&2
}

e2e_require_prereqs() {
  if [[ "${BACKEND_MODE}" == "fixture" ]]; then
    return 0
  fi
  if [[ ! -f "${SERVER_DIR}/Cargo.toml" ]]; then
    e2e_say "error: no nooticr-server checkout at ${SERVER_DIR}."
    e2e_say "       Set NOOTICR_SERVER_DIR, or clone nooticr-server as a sibling of this repo,"
    e2e_say "       or set NOOTICR_E2E_BACKEND=fixture to validate against the no-Rust stand-in instead."
    exit 1
  fi
  if [[ -z "${DATABASE_URL:-}" ]]; then
    e2e_say "error: DATABASE_URL is not set. See nooticr-server/AGENTS.md for how"
    e2e_say "       to start Postgres and what to point it at, or set"
    e2e_say "       NOOTICR_E2E_BACKEND=fixture to validate against the no-Rust stand-in instead."
    exit 1
  fi
}

e2e_start_server() {
  SERVER_LOG="$(mktemp)"
  if [[ "${BACKEND_MODE}" == "fixture" ]]; then
    e2e_say "==> booting scripts/fixture-server.mjs (NOOTICR_E2E_BACKEND=fixture — see its header"
    e2e_say "    for what this does and doesn't prove; it is not nooticr-server)"
    node "${REPO_ROOT}/scripts/fixture-server.mjs" >"${SERVER_LOG}" 2>&1 &
    SERVER_PID=$!
  else
    e2e_say "==> booting nooticr-server (test mode) from ${SERVER_DIR}"
    (
      cd "${SERVER_DIR}" && \
      ALLOW_DEV_LOGIN=1 NOOTICR_E2E_MODE=1 APP_URL="${APP_URL}" \
      DATABASE_URL="${DATABASE_URL}" JWT_SECRET="${JWT_SECRET:-agentic-e2e-test-secret}" \
      cargo run -p nooticr-server
    ) >"${SERVER_LOG}" 2>&1 &
    SERVER_PID=$!
  fi

  e2e_say "==> waiting for ${BASE_URL}/health"
  local ready=""
  for _ in $(seq 1 180); do
    if curl -sS -o /dev/null "${BASE_URL}/health" 2>/dev/null; then
      ready="1"
      break
    fi
    sleep 1
  done
  if [[ -z "${ready}" ]]; then
    e2e_say "error: nooticr-server never became healthy. Last log lines:"
    tail -n 60 "${SERVER_LOG}" >&2
    exit 1
  fi
}

e2e_stop_server() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    e2e_say "==> stopping nooticr-server (pid ${SERVER_PID})"
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
}

# Logs in, creates a workspace + app (so workspace-scoped tools like
# list_own_apps/draft_post have something real to read), re-logs-in scoped
# to that workspace, and exports the token the CLI reads
# (NOOTICR_BASE_URL/NOOTICR_ACCESS_TOKEN — see src/auth.ts, src/config.ts).
e2e_provision() {
  e2e_say "==> POST ${BASE_URL}/auth/dev-login (bootstrap user, no workspace yet)"
  local bootstrap_login bootstrap_token workspace_name ws_query ws_response workspace_id
  local app_query app_response app_id scoped_login_body scoped_login
  bootstrap_login="$(curl -sS --fail-with-body -X POST "${BASE_URL}/auth/dev-login" \
    -H 'content-type: application/json' -d '{}')"
  bootstrap_token="$(printf '%s' "${bootstrap_login}" | e2e_json_get '["token"]')"

  e2e_say "==> creating a workspace + app via GraphQL for workspace-scoped tools"
  workspace_name="agentic-e2e-$(date +%s)"
  ws_query=$(python3 -c '
import json
print(json.dumps({
    "query": "mutation($name: String!, $createdBy: UUID!) { createWorkspace(name: $name, createdBy: $createdBy) { id } }",
    "variables": {"name": "'"${workspace_name}"'", "createdBy": "'"${NIL_UUID}"'"},
}))
')
  ws_response="$(curl -sS --fail-with-body -X POST "${BASE_URL}/graphql" \
    -H "authorization: Bearer ${bootstrap_token}" -H 'content-type: application/json' -d "${ws_query}")"
  workspace_id="$(printf '%s' "${ws_response}" | e2e_json_get '["data"]["createWorkspace"]["id"]')"
  e2e_say "    workspace ${workspace_id}"

  app_query=$(python3 -c '
import json
print(json.dumps({
    "query": "mutation($workspaceId: UUID!, $name: String!, $slug: String!) { createApp(workspaceId: $workspaceId, name: $name, slug: $slug) { id } }",
    "variables": {"workspaceId": "'"${workspace_id}"'", "name": "Agentic E2E App", "slug": "agentic-e2e-app"},
}))
')
  app_response="$(curl -sS --fail-with-body -X POST "${BASE_URL}/graphql" \
    -H "authorization: Bearer ${bootstrap_token}" -H 'content-type: application/json' -d "${app_query}")"
  app_id="$(printf '%s' "${app_response}" | e2e_json_get '["data"]["createApp"]["id"]')"
  e2e_say "    app ${app_id}"

  e2e_say "==> POST ${BASE_URL}/auth/dev-login (re-login scoped to that workspace)"
  scoped_login_body=$(python3 -c 'import json; print(json.dumps({"workspace_id": "'"${workspace_id}"'"}))')
  scoped_login="$(curl -sS --fail-with-body -X POST "${BASE_URL}/auth/dev-login" \
    -H 'content-type: application/json' -d "${scoped_login_body}")"

  NOOTICR_BASE_URL="${BASE_URL}"
  NOOTICR_ACCESS_TOKEN="$(printf '%s' "${scoped_login}" | e2e_json_get '["token"]')"
  NOOTICR_E2E_APP_ID="${app_id}"
  export NOOTICR_BASE_URL NOOTICR_ACCESS_TOKEN NOOTICR_E2E_APP_ID
}
