# Working in this repo

Read `README.md` first — it's the product surface (every tool, its price,
what it's for) and doubles as the contract this server promises hosts. This
file is what the README doesn't cover: the checklist a new or changed tool
must clear, and the invariants CI enforces that aren't obvious from reading
one file in isolation.

## Adding or changing a tool

A tool here is a thin passthrough: `registerXTools(server, makeClient)` in
`src/shared/*.ts` calls `client.callTool(name, args)` against the actual
nooticr-server backend. Because of that shape, one new tool touches several
files that don't obviously depend on each other, and CI's `Host contract` /
`Host compatibility` / `MCP Apps conformance` steps (`.github/workflows/ci.yml`)
will catch most of what you miss — but it's faster to get it right first:

- The registration file itself (`src/shared/*.ts`) — the tool's zod input
  schema, description, and the `client.callTool` call.
- `src/shared/output-schemas.ts` — the `OUTPUT_SCHEMAS` entry, if the tool
  returns structured content a host should be able to parse.
- `src/shared/tools-def.ts` — a stale-but-still-test-checked mirror of the
  tool list. If you skip it, a test fails, not silently.
- `tests/site.test.ts` — the `EXPECTED` array (and the `free` list, if the
  tool is uncosted).
- `tests/server-surface.test.ts` — `NOT_READ_ONLY` if the tool writes state,
  and check whether it lands in the `closed` (`openWorldHint: false`) set.
- `README.md` — a row in whichever table matches what the tool is for, with
  its real credit cost.
- `.github/workflows/ci.yml`'s `NO_APP` set (in the `Host contract` step) —
  every tool needs a UI view (`_meta`'s `ui/resourceUri`, matching
  `MCP_APPS_MIME`, with a `.html` ChatGPT twin) unless it genuinely has
  nothing to draw (a login tool, a pure state mutation with no meaningful
  view). Giving a new tool a real view is usually less work than justifying
  its absence — see the existing `NO_APP` comments for what counted as a
  legitimate exception and why.

`src/shared/tools.ts`'s `TOOL_NAMES` array and `MCP_SERVER_VERSION` are the
other two places a tool's name or the package version needs to agree —
CI's `The version is the same in every file that carries it` step gates on
`package.json`, `.claude-plugin/plugin.json`, and `MCP_SERVER_VERSION` all
matching; a hand-edit that bumps one and not the others fails immediately.

## The dual-mime UI contract

Every tool's view is served twice: `text/html;profile=mcp-app` for Claude
(and everything else that speaks the real MCP Apps spec) and
`text/html+skybridge` at a `.html`-suffixed sibling URI for ChatGPT, which
doesn't. This is a deliberate protocol mismatch, not a bug — CI's
`MCP Apps conformance` step pins the two checks that object to it
(`ui-listed-resources-valid`, `ui-resource-contents-valid`) and fails the
build if conformance objects to anything *else*, or if those two start
failing for a different reason than the dual-mime deviation. If you touch
`src/shared/ui-template.ts` or how a resource's mime type is chosen, expect
that pin to need re-verifying, not just the obvious tests.

## Untrusted content in tool output

Several tools hand a model text that came from the internet, not from
nooticr: post captions, comments, transcripts, search results. Frame that
content as data to reason over, not as instructions — `src/shared/evidence.ts`'s
shared `ownIt` closing line ("Reason over this yourself rather than asking
for an interpretation of it...") and `comment-review.ts`'s `reviewGuidance()`
are the existing pattern. A tool that surfaces third-party text without this
framing is a prompt-injection surface: anyone who can get a sentence into a
post caption or comment thread can plant it. When adding a tool that returns
fetched content, extend the shared framing rather than inventing new wording
per tool.

## Before you consider a change finished

1. `npx tsc --noEmit` (repo root) — CI's `Typecheck` step; `cloudflare/` has
   its own `tsconfig` and needs the same check run from that directory.
2. `npx vitest run` — CI's `Unit tests` step. `tests/server-surface.test.ts`
   and `tests/site.test.ts` are the ones most likely to catch a
   half-finished tool registration (see above).
3. `npm run conformance:mcpjam` (wraps `scripts/mcpjam-apps-conformance.sh`)
   if you touched anything UI-shaped — a resource mime type, `_meta`, or the
   dual-mime template. It's the same check CI's `MCP Apps conformance` job
   runs, so a local pass here is a real signal, not a guess.
4. `npx playwright test` needs a Chromium install
   (`npx playwright install --with-deps chromium`) this repo doesn't ship —
   if that's unavailable in your environment, say so rather than claiming
   the e2e suite passed.
5. Never hand-bump `package.json`'s version — the `version` job in CI owns
   that (it also updates `.claude-plugin/plugin.json` and
   `MCP_SERVER_VERSION` together, see its comments for why the three drifted
   before this existed). Land your change and let CI decide the version.
