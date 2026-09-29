#!/usr/bin/env bash
# Boot the fixture backend on a free port, provision a session, and run
# scripts/surface-probe.mjs against the freshly built server.
#
# Its own port rather than e2e-server-lib.sh's fixed 8080 so a probe can run
# while a quest run, a dev server or another probe holds that one. The
# fixture writes its FIXTURE_TRACE there, which is how the probe tells a tool
# the fixture models from one its generic default answered.
#
# Usage:
#   npm run probe:surface                    # report + screenshots under quests/report/
#   npm run probe:surface -- --tokens <path> # a different design-system tokens.json
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export NOOTICR_E2E_BACKEND=fixture
# shellcheck source=./e2e-server-lib.sh
source "${REPO_ROOT}/scripts/e2e-server-lib.sh"

e2e_build_mcp

PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
# e2e_provision reads BASE_URL when it runs, so pointing it here is enough.
BASE_URL="http://localhost:${PORT}"
TRACE_DIR="$(mktemp -d)"
export FIXTURE_TRACE="${TRACE_DIR}/fixture-trace.jsonl"
SERVER_LOG="${TRACE_DIR}/fixture.log"

node "${REPO_ROOT}/scripts/fixture-server.mjs" "${PORT}" >"${SERVER_LOG}" 2>&1 &
SERVER_PID=$!
cleanup() {
  kill "${SERVER_PID}" >/dev/null 2>&1 || true
  wait "${SERVER_PID}" 2>/dev/null || true
  rm -rf "${TRACE_DIR}"
}
trap cleanup EXIT

ready=""
for _ in $(seq 1 60); do
  if curl -sS -o /dev/null "${BASE_URL}/health" 2>/dev/null; then
    ready="1"
    break
  fi
  sleep 0.5
done
if [[ -z "${ready}" ]]; then
  e2e_say "error: the fixture backend never became healthy on ${BASE_URL}. Its log:"
  cat "${SERVER_LOG}" >&2
  exit 1
fi

e2e_provision

REPORT_DIR="${REPO_ROOT}/quests/report"
mkdir -p "${REPORT_DIR}"
node "${REPO_ROOT}/scripts/surface-probe.mjs" \
  --out "${REPORT_DIR}/surface-probe.json" \
  --screens "${REPORT_DIR}/surface-screens" \
  "$@"
