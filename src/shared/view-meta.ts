/**
 * The `_meta` block that gives a tool its card, in one place.
 *
 * Every registrar module outside `tools.ts` needs these three keys and none of
 * them can import `tools.ts` to get them: `tools.ts` imports the registrars, so
 * reaching back for its `uiResource` closes a cycle. The answer up to now was a
 * local copy per module with a comment explaining why — which worked, and then
 * there were three of them, each a place the URI could drift from the resource
 * `tools.ts` actually registers under.
 *
 * Both halves of that contract are checked in CI's `Host contract` step: every
 * tool not in `NO_APP` must declare `ui/resourceUri` at the MCP Apps mime type
 * with a `.html` sibling for ChatGPT. A URI that drifts from the registered
 * resource fails there rather than at runtime, but only after a push — so the
 * cheaper fix is for there to be one string.
 */

/** The app resource a tool's card is served from. */
export function uiResourceUri(tool: string): string {
  return `ui://nooticr/${tool}`;
}

/**
 * A view for a tool, at the URIs both hosts read.
 *
 * `ui/resourceUri` is the MCP Apps spec key that Claude reads; the
 * `.html`-suffixed `openai/outputTemplate` is ChatGPT's, which does not speak
 * that spec. The duplicated `ui.resourceUri` is the pre-standard nesting some
 * hosts still look for. See `CLAUDE.md`'s dual-mime section for why serving
 * both is deliberate rather than a bug.
 */
export const viewMeta = (tool: string) => ({
  ui: { resourceUri: uiResourceUri(tool) },
  "ui/resourceUri": uiResourceUri(tool),
  "openai/outputTemplate": `${uiResourceUri(tool)}.html`,
});
