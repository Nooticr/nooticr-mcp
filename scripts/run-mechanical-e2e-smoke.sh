#!/usr/bin/env bash
# No-LLM end-to-end smoke test: boots a real, disposable nooticr-server in
# test mode, builds this repo's real CLI (dist/index.js), and drives it
# with the real MCP SDK Client (scripts/mcp-smoke-client.mjs) — no model,
# no API key, nothing non-deterministic. This is the plumbing check that
# scripts/run-agentic-evals.sh can't isolate on its own: does the real
# built CLI actually speak MCP correctly against a real test-mode server
# and get real answers back. See docs/testing/agentic-e2e-testing.md.
#
# Needs no secret at all, so — unlike run-agentic-evals.sh — this is safe
# to run on every push, not just workflow_dispatch.
#
# TEST ONLY. Never set these env vars against a real deployment: dev-login
# mints a session with no credentials, and E2E mode skips credit billing.
#
# Usage:
#   DATABASE_URL=postgres://nooticr:nooticr@localhost:5432/nooticr \
#     npm run test:e2e-smoke
#
#   # Or, with no Rust/Postgres/FFmpeg/ONNX toolchain available at all —
#   # validates this repo's MCP-protocol wiring against
#   # scripts/fixture-server.mjs instead of a real nooticr-server (see that
#   # file's header for exactly what that does and doesn't prove):
#   npm run test:e2e-smoke:fixture
#
# Env vars:
#   NOOTICR_E2E_BACKEND  "real" (default) or "fixture" — see above.
#   DATABASE_URL         required in "real" mode; Postgres nooticr-server
#                       should migrate into. This script does not start
#                       Postgres itself — see nooticr-server/AGENTS.md for
#                       the two ways (docker compose vs. pg_ctlcluster).
#   NOOTICR_SERVER_DIR  path to a nooticr-server checkout in "real" mode
#                       (default: sibling directory "../nooticr-server").
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=./e2e-server-lib.sh
source "${REPO_ROOT}/scripts/e2e-server-lib.sh"

e2e_build_mcp
e2e_require_prereqs
e2e_start_server
trap e2e_stop_server EXIT
e2e_provision

e2e_say "==> node scripts/mcp-smoke-client.mjs"
set +e
node "${REPO_ROOT}/scripts/mcp-smoke-client.mjs"
smoke_status=$?
set -e

if [[ ${smoke_status} -ne 0 ]]; then
  e2e_say "==> smoke test failed (exit ${smoke_status}). Server log:"
  tail -n 60 "${SERVER_LOG}" >&2
fi
exit ${smoke_status}
