import { describe, expect, it } from "vitest";
import { categoryGuidance } from "../src/shared/amazon.js";

/**
 * Phase 2 of the marketplace store serves a scan back from nooticr's own
 * database instead of visiting the site again. That is invisible to a model
 * unless something says so — and a model handed a price with nothing marking it
 * as stored will state it as current, which is the one failure the whole
 * freshness apparatus exists to prevent.
 *
 * The sentence lives in two places on purpose. Claude Code discards every
 * `content` text block when a result also carries `structuredContent`, and a
 * host rendering the UI view does the reverse: the widget gets the structured
 * payload and the model gets the text. Putting the warning in one channel means
 * half the hosts never show it.
 */
describe("a stored answer says it is stored", () => {
 const base = {
  label: "running shoes",
  products: 3,
  reviews: 12,
  ratingsRepresented: 5000,
  brands: ["Nike"],
  complete: true,
  scanId: "scan_1",
  pending: 0,
  site: "Otto",
  statusTool: "marketplace_scan_status",
  insightsTool: null,
 };

 it("carries the server's freshness line into the guidance", () => {
  const line = "These figures were collected 9 hours ago, not just now.";
  expect(categoryGuidance({ ...base, freshness: line })).toContain(line);
 });

 /**
  * A live scan must not gain a caveat it has no reason to carry — a model told
  * that fresh figures might be stale will hedge a reading that did not need it.
  */
 it("says nothing about freshness when the answer came from the site", () => {
  const line = "These figures were collected 9 hours ago, not just now.";
  const live = categoryGuidance(base);
  const stored = categoryGuidance({ ...base, freshness: line });
  expect(live).not.toContain(line);
  // And the two differ by exactly that sentence: a live read must not pick up
  // any other hedging on the way past.
  expect(stored.replace(`${line}\n`, "")).toBe(live);
 });

 /**
  * Ahead of the "still running" line and the analysis prompt. A model that has
  * already begun composing a read is past the point where a caveat changes
  * what it writes.
  */
 it("puts the caveat before the instructions it qualifies", () => {
  const line = "These figures were collected 9 hours ago, not just now.";
  const guidance = categoryGuidance({
   ...base,
   complete: false,
   pending: 4,
   freshness: line,
  });
  // Before the instructions for the read. Only the "not finished" stop line
  // comes earlier, on purpose: while a scan runs, the first thing a model
  // reads must be that its next step is a poll, not an answer.
  expect(guidance.indexOf(line)).toBeLessThan(guidance.indexOf("read the reviews"));
  expect(guidance.indexOf("NOT FINISHED")).toBe(0);
 });
});
