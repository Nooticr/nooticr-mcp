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

## Testing a tool or UI change: real client, real reasoning, real render

`tests/*.test.ts` and `npm run conformance:mcpjam` check protocol and
schema shape. Neither one boots this server, calls a tool for real, and
looks at what a host would actually see — which is exactly the failure
mode that matters most here: a guidance string that silently drops an
argument, a widget that never reads a field a tool computed, a button that
sends an argument shape the target tool rejects. `docs/testing/agentic-e2e-testing.md`
covers the automated CI tiers (fixture smoke, real-backend smoke, agentic
evals). This section is the manual discipline to follow on top of those
whenever you touch a tool's guidance text, a `show_*` view, or anything in
`ui-template.ts` — the method that found and fixed every bug in that doc's
"Bugs this exercise surfaced" section, plus later passes that caught
`understand_social_post`'s `focus` argument, `create_variants`' `count`/
`angle`, and `write_hooks`' `topic`/`count`/`tone` all being accepted by
the zod schema and silently dropped by the guidance builder, and
`track_creator`/`why_did_this_underperform` computing a real
ratio-to-baseline verdict per post that `postCard()` never rendered.

**The rule, stated plainly: never mock the reasoning step.** A tool whose
job is to hand guidance to a host LLM has to actually be driven by
something composing genuine content from that guidance — a hardcoded
"analysis: test test test" proves the plumbing works and nothing about
whether the guidance text is good or the view renders what a real answer
looks like. Before calling a paired `show_*` tool, write an actual
analysis, an actual set of hooks, an actual drafted reply — as if you were
the model that just got handed this tool's result.

### Reproducing it

1. Build once: `npm run build:ui && tsc` (or plain `npm run build`) —
   regenerates `src/shared/ui-template.ts`'s inlined Tailwind CSS as a side
   effect; see the git-checkout warning below before touching that file.
2. Start the fixture backend on a scratch port and log in:
   ```bash
   node scripts/fixture-server.mjs 8091 &
   WS=$(curl -s -X POST http://localhost:8091/graphql -H 'content-type: application/json' \
     -d '{"query":"mutation createWorkspace { createWorkspace }"}' | jq -r .data.createWorkspace.id)
   APP=$(curl -s -X POST http://localhost:8091/graphql -H 'content-type: application/json' \
     -d "{\"query\":\"mutation createApp { createApp }\",\"variables\":{\"workspaceId\":\"$WS\",\"name\":\"test\"}}" \
     | jq -r .data.createApp.id)
   TOKEN=$(curl -s -X POST http://localhost:8091/auth/dev-login -H 'content-type: application/json' \
     -d "{\"workspace_id\":\"$WS\"}" | jq -r .token)
   ```
   If the tool you're testing has no case in `scripts/fixture-server.mjs`'s
   `handleMcpCall()` switch yet, add one — don't test against the generic
   `default:` case, which returns empty `structuredContent` and proves
   nothing.
3. Connect a real MCP client to the real built CLI — not a stub, not an
   in-process call — and call the tool for real:
   ```js
   import { Client } from "@modelcontextprotocol/sdk/client/index.js";
   import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
   const transport = new StdioClientTransport({
     command: "node", args: ["dist/index.js"],
     env: { ...process.env, NOOTICR_BASE_URL: BASE_URL, NOOTICR_ACCESS_TOKEN: TOKEN, NOOTICR_TRANSPORT: "stdio" },
   });
   const client = new Client({ name: "verify", version: "0.0.0" }, { capabilities: {} });
   await client.connect(transport);
   const result = await client.callTool({ name: "analyze_post", arguments: { url: "..." } });
   ```
   Read the actual guidance text back. If the tool takes an optional
   argument (`focus`, `angle`, `tone`, `count`, ...), call it *with* that
   argument and confirm the guidance text actually changed — a documented
   zod field the guidance builder never reads is exactly the bug class
   this step exists to catch. A client with no `elicitation` capability
   declared (as above) is also the right way to confirm a confirm-gated
   tool (`create_brand_watch`, `catch_up_watchlist`) degrades gracefully
   instead of hanging.
4. Genuinely reason over what came back — see the rule above — and, where
   the guidance says to, call the paired `show_*` tool with real content.
5. Render the real result in a real browser and look at it:
   ```js
   import { chromium } from "playwright";
   import { NOOTICR_UI_TEMPLATE } from "./dist/shared/ui-template.js"; // compiled output, not the .ts source
   const page = await (await chromium.launch()).newPage({ viewport: { width: 900, height: 1400 } });
   await page.setContent(NOOTICR_UI_TEMPLATE, { waitUntil: "load" });
   await page.evaluate((sc) => window.postMessage(
     { method: "ui/notifications/tool-result", params: { structuredContent: sc } }, "*"
   ), result.structuredContent);
   await page.waitForTimeout(700);
   await page.screenshot({ path: "out.png", fullPage: true });
   ```
   A sandbox with no system Chromium needs
   `executablePath: "/opt/pw-browsers/chromium"` on `chromium.launch()` in a
   throwaway script like the one above — that part is sandbox-only, so don't
   commit it. `playwright.config.ts` no longer needs the same treatment: it
   falls back to `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, else that path, and only
   when the file actually exists, so `npx playwright test` runs in such a
   sandbox unedited. That fallback is committed and deliberate — it is not
   leftover debris to revert.
6. Don't leave what you found verified only by a throwaway script: add or
   extend a real test in `tests/e2e/ui-template.e2e.ts` (a synthetic-payload
   render + click assertion — fast, no fixture server needed) or
   `tests/e2e/agentic-visual-full-app.e2e.ts` (the real
   fixture-server → real CLI → real render path) so the next change can't
   silently regress it. Then run `npx playwright test` — the *whole* suite,
   not a filtered run: `postCard()` and the media player are shared by
   nearly every view, so a change there needs everything re-checked, not
   just the view you touched.
7. Clean up before you're done: kill the fixture server, delete any
   scratch scripts, `rm -rf dist test-results`, and confirm
   `git status --short` shows only the files you actually meant to change.
   (`playwright.config.ts` needs no reverting — see step 5.)

**Never `git checkout -- src/shared/ui-template.ts`** to discard the
Tailwind-CSS-regeneration diff `npm run build` leaves behind. It's a
whole-file revert and will just as happily discard real, uncommitted logic
changes in the same file — this has happened, more than once, to whoever
wrote this section. If you need to drop only the regenerated CSS line, do
it by line, never by reverting the file.

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

## Whether a chain holds is its own question

Everything in the section above tests one call. The failure that is invisible
to all of it lives *between* two calls: a tool's guidance says "when you are
done, call `show_analysis`", the host writes a good analysis, never calls it,
and every test stays green because every individual call worked.

`npm run test:quests` is that layer — a real host (`claude -p`) driven through
plain-language requests against the fixture backend, asserting on the chain of
tools it actually walked. `node scripts/chain-map.mjs` is its deterministic
half: it calls every tool for real and reads back which other tools the
guidance names, so a stale pointer or an orphaned `show_*` shows up without
spending on a model.

Two things to know before adding a quest, both learned the expensive way and
written up in `docs/testing/tool-chaining-quests.md`:

- **Guidance in a `content` text block does not reach Claude Code** when the
  result also carries `structuredContent` — which is every tool here. Measured:
  0 of 59 quest runs, across 175 tool results, contained a single guidance
  phrase. Prose inside `structuredContent` does arrive (see
  `who_should_i_work_with`'s `rubric`); a sentence added to a `guidance()`
  builder expecting it to steer a Claude host is dead text today.
- **What decides whether a chain holds is retrieval, not wording.** With this
  many tools every one sits behind a ToolSearch: over the 36 runs whose chain ends
  in a `show_*` tool, it was called 0/18 times when ToolSearch never returned
  it and 14/18 when it did. The 3/3 case (`repurpose_post ->
  show_repurposed_post`) was decided by the model's FIRST query naming both —
  a shared name stem — before any description was in context. So a `show_X`
  nobody searches for steers nothing, however well its description reads.
- **A fixture a model can tell is a fixture measures itself.** A caption
  saying "not real content" makes the model stop and say so, which reads in a
  chaining report as a broken chain. `FIXTURE_POST` in
  `scripts/fixture-server.mjs` is plausible on purpose.

## Finding the bugs no single test can see

Six defects in one sitting turned out to be one shape: a contract between two
artifacts, with no test spanning them. `search_creators` advertised YouTube its
own enum rejected. `get_post_comments` served Reddit and Weibo and named
neither. `get_post_transcript` claimed a TikTok/YouTube ceiling it does not
have. X posts lost their video between the search path and the detail path. The
brand-sweep view drew comments over a blank header while the thread carried a
thumbnail and a video the whole time. Nothing crashed in any of them; each side
was locally correct and the suite was green.

Four checks exist for that class. They are deliberately not in `npm run verify`
— two of them run the suite many times over — so use `npm run verify:deep`
before anything that changes a contract, and the individual ones while working.

**Contract** — `npm run contract:manifest`. `vendor/platform-capabilities.json`
is generated by nooticr-server from the constants beside its dispatchers; this
compares the vendored copy against it and names the drift in both directions
(the server gained a platform nothing here mentions; this repo still claims one
the server dropped). Exits 2, never 0, when it cannot reach the upstream: a
check that passes because it could not look is worse than no check.

**Metamorphic** — in nooticr-server, `the_envelope_never_changes_the_post`. Not
an expected value, a relation: for the same item, every envelope the upstream
wraps it in must map to the same post. That is why it finds what no fixture
does — nobody writes a fixture for "a tweet, but nested one level deeper", and
that is exactly where X lost its video. It caught that bug without naming
Twitter or `media`. Adding a platform is one line; adding an envelope shape is
one line and covers every platform.

**Mutation** — `npm run test:mutation`. Every guard here was hand-checked once
by reintroducing the bug and confirming the failure, then never again. This
runs that check on every mutation, every time, and a SURVIVING mutation is the
finding. It refuses to trust a catcher that does not pass on a clean tree
first: a mistyped command fails under mutation too, which reads as "caught" for
everything and turns the harness into a green light. That happened on its first
run here, from a `--silent` flag that swallowed its filename argument.

**LLM propose/verify** — `npm run test:invariants`, prompt at
`node scripts/invariant-guard.mjs --print-prompt`. This repo states its
invariants in prose ("Advertising a platform that cannot work just spends a
paid call to fail"), which a model can read and propose as executable checks.
The model is never trusted. Each candidate must pass on the clean tree AND fail
on the mutant it supplies; anything else is discarded, and the rejection reason
is printed. Both failure modes are worth acting on: "fails on clean tree" is a
broken check or a real finding, and "mutant survives" is a genuine coverage gap
— the first run found that nothing catches a paid tool dropping its price from
its description.

The proposing step is a seam, not a dependency: candidates are JSON, so any
model or a human can write `invariants/candidates.json`. Only
`invariants/earned.json` means anything, and only the verifier writes it.
