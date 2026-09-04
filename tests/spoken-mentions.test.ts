/**
 * search_spoken_mentions — brand monitoring over what is *said*, not typed.
 *
 * Text monitoring finds a brand when someone writes its name. This tool finds
 * it when someone says it out loud, which is where the mentions that actually
 * hurt tend to live: a rant, a "things I regret buying", a comparison whose
 * caption reads "watch till the end".
 *
 * Two things can go badly wrong here and both are tested below. The first is
 * matching: a term that fires inside a longer word turns a monitoring feed into
 * noise, and "nike" inside "nikeisha" is the canonical way that happens. The
 * second is spend. Every other fan-out in this repo can price itself once a
 * cheap first call returns — the watchlist has a length, a feed has a post
 * count. A transcript search cannot: there is no way to know how many
 * candidates say the term without transcribing them, so the candidate count can
 * never set the price and the ceiling has to hold against whatever the caller
 * asks for.
 */
import { describe, expect, it } from "vitest";
import { matchExcerpts } from "../src/shared/jobs.js";
import { MAX_SPOKEN_HANDLE_CALLS, MAX_SPOKEN_TRANSCRIPTS } from "../src/shared/spend.js";

describe("matchExcerpts — where a term is actually said", () => {
  it("does not fire inside a longer word", () => {
    const { excerpts, matchCount } = matchExcerpts(
      "shout out to nikeisha for the recommendation, she never steered me wrong",
      "nike",
    );
    expect(matchCount).toBe(0);
    expect(excerpts).toEqual([]);
  });

  it("matches the whole word regardless of case", () => {
    const { matchCount } = matchExcerpts(
      "I bought the NIKE ones and honestly Nike has lost the plot, nike used to be better",
      "nike",
    );
    expect(matchCount).toBe(3);
  });

  it("treats regex metacharacters in the term as literal text", () => {
    // A term like "c++" or "node.js" must not be compiled as a pattern —
    // ".js" as a regex would match "ajs", "bjs", and any other three chars.
    const { matchCount } = matchExcerpts("we rewrote it in node.js last year", "node.js");
    expect(matchCount).toBe(1);
    expect(matchExcerpts("we rewrote it in nodexjs last year", "node.js").matchCount).toBe(0);
  });

  it("still matches a term that starts or ends on punctuation", () => {
    // `\b` only means something next to a word character, so applying it
    // unconditionally would make these terms unmatchable rather than strict.
    expect(matchExcerpts("shopping at H&M again", "H&M").matchCount).toBe(1);
  });

  it("counts every occurrence but only quotes the first few", () => {
    const transcript = Array.from({ length: 12 }, () => "the brand is everywhere").join(" ");
    const { excerpts, matchCount } = matchExcerpts(transcript, "brand", 3);
    expect(matchCount).toBe(12);
    expect(excerpts).toHaveLength(3);
    expect(excerpts.map((e) => e.occurrence)).toEqual([1, 2, 3]);
  });

  it("carries enough surrounding text to read tone from", () => {
    const transcript =
      "so I finally caved and bought it after all the hype and honestly the build quality on this " +
      "acme thing is the worst I have handled in years, do not waste your money on it";
    const { excerpts } = matchExcerpts(transcript, "acme");
    expect(excerpts).toHaveLength(1);
    // The quote has to include the verdict, not just the name.
    expect(excerpts[0].text).toContain("worst I have handled");
    expect(excerpts[0].text).toContain("do not waste your money");
  });

  it("marks a quote that was cut out of a longer transcript", () => {
    const long = `${"padding words ".repeat(40)}acme${" more padding".repeat(40)}`;
    const { excerpts } = matchExcerpts(long, "acme");
    expect(excerpts[0].text.startsWith("…")).toBe(true);
    expect(excerpts[0].text.endsWith("…")).toBe(true);
  });

  it("reports where in the transcript the term was said", () => {
    const transcript = "first sentence here. then they mention acme halfway through.";
    const { excerpts } = matchExcerpts(transcript, "acme");
    expect(excerpts[0].position).toBe(transcript.indexOf("acme"));
  });

  it("finds nothing in an empty transcript or for an empty term", () => {
    // A post whose transcript came back `available:false` is a normal outcome,
    // not an error — it must simply contribute no hits.
    expect(matchExcerpts("", "acme").matchCount).toBe(0);
    expect(matchExcerpts("plenty of words here", "").matchCount).toBe(0);
    expect(matchExcerpts("plenty of words here", "   ").matchCount).toBe(0);
  });

  it("terminates on a term that could match zero-width", () => {
    // Guards the lastIndex stall that would otherwise spin forever.
    expect(() => matchExcerpts("some transcript text", "*")).not.toThrow();
  });
});

describe("the ceilings that make the fan-out affordable", () => {
  it("caps transcripts and handle calls at a spend a caller cannot argue up", () => {
    expect(MAX_SPOKEN_TRANSCRIPTS).toBeGreaterThan(0);
    expect(MAX_SPOKEN_HANDLE_CALLS).toBeGreaterThan(0);
    // A transcript costs a credit each, so the worst case a single call can
    // reach has to stay in the range a user would recognise as a search rather
    // than a bill. If either ceiling is raised past this, the confirmation
    // copy and the pricing note in the tool description need revisiting too.
    expect(MAX_SPOKEN_TRANSCRIPTS).toBeLessThanOrEqual(25);
    expect(MAX_SPOKEN_HANDLE_CALLS).toBeLessThanOrEqual(10);
  });
});
