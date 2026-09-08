import { describe, it, expect } from "vitest";
import { complaintCore } from "../src/shared/evidence.js";

/**
 * The bug: `find_people_with_problem` templated its query shapes onto the raw
 * argument, and the argument its own schema asks for is a full sentence with a
 * subject. So the documented input produced strings nobody has ever written,
 * and sent them to a keyword search three times (#60).
 */
describe("the searchable core of a complaint", () => {
  it("takes the speaker off the front so a template can be prefixed to it", () => {
    // The real user query that produced "is there a way to I have no idea
    // what to post next, I'm out of content ideas for my page".
    const core = complaintCore("I have no idea what to post next, I'm out of content ideas for my page");
    expect(core).toBe("no idea what to post next, out of content ideas");
    expect(`anyone else ${core}`).toBe(
      "anyone else no idea what to post next, out of content ideas",
    );
  });

  it("keeps a content verb, and only drops an auxiliary", () => {
    // This is the whole distinction. "I have no idea" is about a speaker, but
    // "waste" and "spend" are the searchable part of their sentences —
    // dropping them leaves "an hour a day checking", which is a worse query
    // than the one being fixed.
    expect(complaintCore("I waste an hour a day checking what competitors posted")).toBe(
      "waste an hour a day checking what competitors posted",
    );
    expect(complaintCore("I spend hours checking competitors by hand")).toBe(
      "spend hours checking competitors by hand",
    );
    expect(complaintCore("We keep losing track of what our competitors ship")).toBe(
      "keep losing track of what our competitors ship",
    );
  });

  it("never ends on a word pointing at one the cap removed", () => {
    const core = complaintCore(
      "I am completely out of ideas for the weekly video I make for my small business page",
    );
    expect(core).not.toMatch(/\b(for|my|the|a|an|of|to|and|or|with|in|on|at|by)$/);
  });

  it("caps length, because a long sentence matches on its commonest words", () => {
    // The tool's own no-results guidance has always said this. It just was not
    // taking its own advice.
    const long = complaintCore(
      "I really cannot work out what to post about next week or the week after or honestly any week this quarter at all",
    );
    expect(long.split(/\s+/).length).toBeLessThanOrEqual(12);
  });

  it("leaves a phrase that never had a speaker alone", () => {
    expect(complaintCore("out of content ideas")).toBe("out of content ideas");
    expect(complaintCore("competitor tracking is manual")).toBe("competitor tracking is manual");
  });

  it("never returns nothing, however little is left", () => {
    // A one-word problem, or a sentence that is only a subject, still has to
    // produce something searchable rather than an empty paid call.
    expect(complaintCore("I")).toBeTruthy();
    expect(complaintCore("burnout")).toBe("burnout");
  });
});
