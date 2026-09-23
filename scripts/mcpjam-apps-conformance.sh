#!/bin/sh
# MCP Apps conformance for the dual-host UI design. Run from the repo root
# after `npm run build` (it serves the freshly built dist over stdio).
#
# Two checks are INTENTIONALLY excluded, and must stay excluded (their
# failures are pinned to the skybridge reason, and a pass is an error too):
#   - ui-listed-resources-valid
#   - ui-resource-contents-valid
# Both require every ui:// resource to use text/html;profile=mcp-app. The
# per-tool `.html` twins and the legacy view aliases MUST serve
# text/html+skybridge instead: ChatGPT's Apps SDK fetches the outputTemplate
# URI and, handed any other mime, renders the HTML but never attaches its
# bridge — the widget sits on its idle placeholder with a clean console.
# "Fixing" those two checks would break ChatGPT widgets for real users.
# The behaviour is pinned by tests/ui-resource.test.ts ("Apps SDK (ChatGPT)
# support" and "legacy ui://nooticr/view pointer"), which fail if the twins
# ever change mime or leave resources/list (ChatGPT resolves its template
# pointer against the listing).
#
# Every other check is a gate, including any mcpjam adds later: this runs the
# whole suite and scripts/mcpjam-conformance-check.py judges the result, so
# the exclusion above is an exclusion, not an allowlist (#25). CI runs this
# same script.
set -eu
out="${TMPDIR:-/tmp}/nooticr-mcpjam-conformance.$$.json"
trap 'rm -f "$out"' EXIT
# Non-zero is expected: the two pinned checks always fail. The verdict is
# the checker's, below.
npx -y @mcpjam/cli@5 apps conformance --format json \
  --transport stdio --command node --args dist/index.js > "$out" || true
python3 scripts/mcpjam-conformance-check.py "$out"
