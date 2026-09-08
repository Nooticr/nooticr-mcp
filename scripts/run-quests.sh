#!/usr/bin/env bash
# Boot a backend, then drive a real host through quests/quests.json and
# report which tool chains it actually walked.
#
# Defaults to the fixture backend (scripts/fixture-server.mjs) rather than a
# real nooticr-server, and that is the point rather than a convenience: a
# quest asks whether THIS repo's descriptions and guidance steer a host
# correctly, so the upstream responses want to be fixed and free. Set
# NOOTICR_E2E_BACKEND=real to run the same corpus against a real server
# (needs that repo's Rust/Postgres toolchain and DATABASE_URL — see
# scripts/e2e-server-lib.sh); the chains should not change, and if they do,
# something in the payload is steering the host, which is worth knowing.
#
# Every run is a real model call through the Claude Code CLI. There is no
# free tier of this: see docs/testing/tool-chaining-quests.md.
#
# Usage:
#   npm run test:quests                       # the whole corpus
#   npm run test:quests -- --filter show      # just the show_* loop
#   npm run test:quests -- --runs 1 --gate    # one run each, fail on a break
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export NOOTICR_E2E_BACKEND="${NOOTICR_E2E_BACKEND:-fixture}"
# shellcheck source=./e2e-server-lib.sh
source "${REPO_ROOT}/scripts/e2e-server-lib.sh"

if ! command -v claude >/dev/null 2>&1 && [[ -z "${QUEST_CLAUDE_BIN:-}" ]]; then
  e2e_say "==> skipping quests: no \`claude\` on PATH."
  e2e_say "    The driver is the Claude Code CLI, because the host under test should be"
  e2e_say "    a host someone actually runs — see docs/testing/tool-chaining-quests.md."
  e2e_say "    To check the harness's own logic with no model at all: npx vitest run tests/quests.test.ts"
  exit 0
fi

e2e_build_mcp
e2e_require_prereqs
e2e_start_server
trap e2e_stop_server EXIT
e2e_provision

e2e_say "==> node scripts/chain-map.mjs (what the server SAYS should chain)"
node "${REPO_ROOT}/scripts/chain-map.mjs" --json "${REPO_ROOT}/quests/report/chain-map.json" --quiet

e2e_say "==> node scripts/run-quests.mjs (what a real host ACTUALLY does)"
node "${REPO_ROOT}/scripts/run-quests.mjs" "$@"
