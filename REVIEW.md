# Review guidance for nooticr-mcp

Claude Code Review reads this file. The PR pipeline blocks a merge on any
**Important** finding and ignores nits and pre-existing ones, so be strict
about the line between them. Mark something Important only when it is a
defect this diff introduces that a host, a user or their credits would feel.

## Important: report these

- **Untrusted text reaching a model unframed.** Post captions, comments,
  transcripts and search results come from the internet. A tool that returns
  them without the shared framing (`src/shared/evidence.ts`'s `ownIt`,
  `comment-review.ts`'s `reviewGuidance()`) is a prompt-injection surface.
  So is new per-tool wording that replaces the shared framing instead of
  extending it.
- **Credits.** A tool whose price its description no longer states. A tool
  whose price depends on an argument that skips `confirmSpend` in
  `src/shared/spend.ts`. A client path that stops sending the idempotency key
  (`src/idempotency.ts`), so a retried call is billed twice.
- **Auth.** `src/auth.ts`, `src/oauth.ts`, `src/shared/oauth.ts`,
  `src/shared/api-key.ts`, `src/shared/cimd.ts` and `cloudflare/src/oauth.ts`:
  a token accepted without its scope or expiry being checked, a redirect URI
  not matched exactly, or a credential logged or put in a tool result.
- **A guidance edge that only one channel carries.** Claude Code drops
  `content` text blocks when `structuredContent` is present; a host drawing
  the view does the reverse. Guidance or evidence that lives in only one of
  them never reaches some hosts (CLAUDE.md, "Whether a chain holds").
- **An argument the schema accepts and the guidance builder ignores.** A
  documented zod field (`focus`, `angle`, `tone`, `count`...) that changes
  nothing in what the tool returns.
- **A view that drops what the tool computed**, or one drawn outside the
  design system's `nt-*` classes and tokens.
- **A tool registered here with no backend.** Every `client.callTool(name)`
  must name a dispatch case in nooticr-server's `crates/server/src/mcp_tools.rs`.
- **Tests that stopped testing.** A test deleted, skipped, or rewritten to
  assert less, where the diff doesn't say why.

## Nits: at most three, and only if they matter

Wording in a tool description a model would misread, naming, a comment that
restates the code.

## Do not report

- Type errors, lint and unit-test failures, a missing `tools-def.ts` or
  `README.md` row, host-contract or conformance failures: CI and the
  nooticr-verify gate check all of them.
- `package.json` / `.claude-plugin/plugin.json` / `MCP_SERVER_VERSION`
  versions: CI's `version` job owns them.
- The inlined CSS line in `src/shared/ui-template.ts`, which `npm run build`
  regenerates, and the generated workflows (`.github/workflows/verify.yml`,
  `pr-pipeline.yml`, `issue-pipeline.yml`).
