#!/bin/sh
# The host-contract check, runnable before you push rather than only in CI.
#
# Drives the built server over stdio with the official MCP Inspector, collects
# the four listings the contract is checked against, and hands them to
# host-contract.py. Run from the repo root after `npm run build` — it serves
# whatever is in dist/, so a stale build checks a stale surface.
#
# The inspector talks to a real server, so the backend URL is pointed at a
# closed port deliberately: every method used here (tools/list, resources/list,
# resources/read) is answered from the server's own registration and never
# reaches nooticr, and a closed port makes that guarantee visible rather than
# assumed. Nothing here spends a credit or needs an account.
set -eu

WORK="${TMPDIR:-/tmp}/nooticr-host-contract.$$"
mkdir -p "$WORK"
trap 'rm -rf "$WORK"' EXIT

INSPECT="npx -y @modelcontextprotocol/inspector@2 --cli node dist/index.js"
export NOOTICR_BASE_URL="${NOOTICR_BASE_URL:-http://127.0.0.1:9}"
export NOOTICR_ACCESS_TOKEN="${NOOTICR_ACCESS_TOKEN:-host-contract-check}"

$INSPECT --method tools/list --app-info > "$WORK/app-info.ndjson"
$INSPECT --method tools/list          > "$WORK/tools.json"
$INSPECT --method resources/list      > "$WORK/resources.json"

# Portability problems are reported by the inspector itself.
$INSPECT --method tools/list --strict > /dev/null

# Each family must read back on the mime its host requires.
$INSPECT --method resources/read --uri ui://nooticr/discover_social_posts      > "$WORK/claude-res.json"
$INSPECT --method resources/read --uri ui://nooticr/discover_social_posts.html > "$WORK/gpt-res.json"

exec python3 scripts/host-contract.py "$WORK"
