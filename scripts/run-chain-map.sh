#!/usr/bin/env bash
# The deterministic half of the quest suite: no model, no spend, no flake.
#
# `npm run test:quests` needs a real host and real model calls, so it is not in
# `npm run verify` and never will be. But most of what it proves about the
# CHAIN is decidable without a model at all: call every tool for real, read
# which other tools each result names, and check the two things that are never
# acceptable — a guidance edge that lives only in a `content` text block (a
# host rendering structuredContent drops those, so no model ever reads it), and
# a `show_*` view no tool's guidance names (nothing will ever steer a host to
# it, however well its description reads).
#
# Both of those shipped once, in the same week, past a green suite. See
# docs/testing/tool-chaining-quests.md.
#
# Usage:
#   npm run chain:map              # boot the fixture backend, map, gate
#   NOOTICR_E2E_BACKEND=real ...   # same corpus against a real nooticr-server
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export NOOTICR_E2E_BACKEND="${NOOTICR_E2E_BACKEND:-fixture}"
# shellcheck source=./e2e-server-lib.sh
source "${REPO_ROOT}/scripts/e2e-server-lib.sh"

e2e_build_mcp
e2e_require_prereqs
e2e_start_server
trap e2e_stop_server EXIT
e2e_provision

mkdir -p "${REPO_ROOT}/quests/report"
node "${REPO_ROOT}/scripts/chain-map.mjs" \
  --json "${REPO_ROOT}/quests/report/chain-map.json" \
  --gate "$@"
