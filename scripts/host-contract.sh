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

# Portability problems are reported by the inspector itself — and now gated on,
# rather than printed and scrolled past. This step passed for a long time while
# the inspector was saying "0 errors, 1291 warnings across 64 tools", because
# only errors ever failed it; 1,286 of those warnings were one helper emitting
# `type` as an array, which strict clients reject or silently ignore. A check
# carrying 1,291 standing warnings is one nobody reads, and nothing turns red as
# the count climbs. See issue #26.
#
# The test is "did the strict pass say anything at all", not "does its output
# match a wording". A clean surface makes it completely silent — 0 bytes on
# stderr, verified — so grepping for `Warning:` would quietly stop catching
# anything the day the inspector rephrases itself. A future version that prints
# something benign here fails the build instead, which is the direction to be
# wrong in. The three $INSPECT calls above have already warmed the npx cache, so
# what lands in this file is the inspector's verdict rather than a download.
$INSPECT --method tools/list --strict > /dev/null 2> "$WORK/strict.txt"
if [ -s "$WORK/strict.txt" ]; then
  echo "FAIL: the inspector's strict pass reported portability findings:" >&2
  cat "$WORK/strict.txt" >&2
  printf '\ntests/output-schema-shape.test.ts names the offending schema paths.\n' >&2
  exit 1
fi

# Each family must read back on the mime its host requires.
$INSPECT --method resources/read --uri ui://nooticr/discover_social_posts      > "$WORK/claude-res.json"
$INSPECT --method resources/read --uri ui://nooticr/discover_social_posts.html > "$WORK/gpt-res.json"

exec python3 scripts/host-contract.py "$WORK"
