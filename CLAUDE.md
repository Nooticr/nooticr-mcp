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

`npm run verify` runs all of the below, in this order, and stops at the first
failure. Run that rather than picking steps by hand — the steps that get
skipped when they are a list are the ones that catch a half-finished tool
registration. The individual commands are worth knowing for when you want to
re-run just one:

1. `npx tsc --noEmit` (repo root) — CI's `Typecheck` step; `cloudflare/` has
   its own `tsconfig` and needs the same check run from that directory.
2. `npx vitest run` — CI's `Unit tests` step. `tests/server-surface.test.ts`
   and `tests/site.test.ts` are the ones most likely to catch a
   half-finished tool registration (see above).
3. `npm run contract:host` — the host contract: every tool outside the
   `NO_APP` set in `scripts/host-contract.py` must declare a view at
   `text/html;profile=mcp-app` with a `.html` twin that actually resolves.
   CI runs this same script, so a local pass is the real thing rather than an
   approximation of it. Needs a `npm run build` first: it checks `dist/`, so a
   stale build checks a stale surface.
4. `npm run conformance:mcpjam` (wraps `scripts/mcpjam-apps-conformance.sh`)
   if you touched anything UI-shaped — a resource mime type, `_meta`, or the
   dual-mime template. Same check CI's `MCP Apps conformance` job runs.
5. `npx playwright test` — browser E2E for the view template. CI installs its
   own browser; `playwright.config.ts` also falls back to a preinstalled
   Chromium (`PLAYWRIGHT_CHROMIUM_EXECUTABLE`, else `/opt/pw-browsers/chromium`)
   for sandboxes that block `cdn.playwright.dev`, so the suite usually runs
   even where `npx playwright install` 403s. If it genuinely cannot launch a
   browser, say so rather than claiming the e2e suite passed.
6. Never hand-bump `package.json`'s version — the `version` job in CI owns
   that (it also updates `.claude-plugin/plugin.json` and
   `MCP_SERVER_VERSION` together, see its comments for why the three drifted
   before this existed). Land your change and let CI decide the version.

A note on what these check that the unit tests do not: steps 3 and 4 drive the
**built** server over stdio as a host would. `tools/list` returning a tool the
template cannot draw, a `.html` twin that 404s, a resource on the wrong mime —
none of that is visible to vitest, and all of it is visible to a user.
