#!/bin/sh
# MCP Apps conformance for the dual-host UI design. Run from the repo root
# after `npm run build` (it serves the freshly built dist over stdio).
#
# Two checks are INTENTIONALLY excluded, and must stay excluded:
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
set -eu
exec npx -y @mcpjam/cli apps conformance \
  --transport stdio --command node --args dist/index.js \
  --check-id ui-tools-present \
  --check-id ui-tool-metadata-valid \
  --check-id ui-tool-input-schema-valid \
  --check-id ui-resources-readable \
  --check-id ui-resource-meta-valid
