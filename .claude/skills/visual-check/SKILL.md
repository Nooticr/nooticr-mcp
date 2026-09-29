---
name: visual-check
description: Render every dashboard surface and every MCP view in a real browser, check them against the Nooticr design system, and show the screenshots. Use after any UI change, when asked whether something "looks right", or before claiming a view was checked in the browser.
---

# /visual-check

"I checked it in the browser" is a claim the Stop hook verifies. This skill is
how you make it true.

1. Run the two visual rules (they regenerate their reports every time):

   ```bash
   python3 .claude/hooks/nooticr-verify.py run --tier stop --rule D.dashboard-conformance --rule A.surface-probe --rule D.mcp-view-conformance
   ```

   - `D.dashboard-conformance` walks landing, login, 404, the chat, every
     dialog, the palette and the mobile layout, in light and dark, and checks
     computed colours, type, radii, weights, contrast, uppercase, overflow and
     console errors against `nooticr-server/verify/vendor/design-system/tokens.json`.
     Screenshots: `nooticr-dashboard/test-results/verify-design/screens/`.
   - `A.surface-probe` / `D.mcp-view-conformance` call every nooticr-mcp tool
     against the fixture backend and draw each result in the real view
     template. Screenshots: `nooticr-mcp/quests/report/surface-screens/`.

2. Open the screenshots for the surfaces your change touched (Read the PNGs)
   and look at them: is the dialog actually open, is dark actually dark, is the
   thing you changed visible and right? A green rule over a blank page is still
   a blank page.

3. Send the relevant screenshots to the user, with one line each on what they
   show. Then report the findings the rules listed for the surfaces you touched.

A finding the design system itself contradicts (its generated files disagree
with its tokens.json) is reported by `D.ds-self-consistent`; the fix belongs in
the design system, via /design-sync.
