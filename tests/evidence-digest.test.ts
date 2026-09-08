import { describe, it, expect } from "vitest";
import { evidenceDigest, withEvidence } from "../src/shared/evidence-digest.js";

/**
 * The bug these pin: a text block that counts and describes material living
 * in the other channel. "Here are 4 comments ... classify each one" was a
 * false sentence in the channel it was written in, because a host rendering
 * the view keeps `structuredContent` for the widget (#59).
 */
describe("the evidence a text-only host receives", () => {
  it("renders the fields a post's guidance actually asks for", () => {
    const digest = evidenceDigest({
      posts: [
        {
          platform: "reddit",
          creatorHandle: "tired_poster",
          subreddit: "r/socialmedia",
          foundBy: "shared",
          caption: "Completely out of ideas\n\nI have been posting for eight months and run dry.",
          externalUrl: "https://www.reddit.com/r/socialmedia/comments/abc123/",
          views: 12345,
          likes: 42,
        },
      ],
    });

    // find_people_with_problem's guidance asks for the permalink "so they can
    // actually be replied to", and for `foundBy` to be read. A digest missing
    // either cannot answer the thing it was handed.
    expect(digest).toContain("https://www.reddit.com/r/socialmedia/comments/abc123/");
    expect(digest).toContain("found by: shared");
    expect(digest).toContain("@tired_poster");
    expect(digest).toContain("run dry");
    // Counts are readable rather than raw.
    expect(digest).toContain("12.3k views");
  });

  it("keeps the comment id, because the next call is keyed on it", () => {
    const digest = evidenceDigest({
      comments: [
        { id: "comment:123:0", author: "priya_makes", likes: 412, text: "this stopped working" },
      ],
    });
    // analyze_comments asks for a classification per comment and
    // show_comment_review takes those ids back. Rendering the text and
    // dropping the id would break the chain while looking fine.
    expect(digest).toContain("comment:123:0");
    expect(digest).toContain("this stopped working");
  });

  it("says how many it left out rather than truncating in silence", () => {
    const posts = Array.from({ length: 60 }, (_, i) => ({
      caption: `post number ${i}`,
      externalUrl: `https://example.test/${i}`,
    }));
    const digest = evidenceDigest({ posts });

    expect(digest).toMatch(/^\d+ of 60 posts/);
    expect(digest).toContain("the rest are in the structured payload");
    // A model reasoning over a subset has to know it has a subset — the
    // failure this prevents is a confident answer about "all 60".
    expect(digest).not.toContain("60 posts:");
  });

  it("stays inside a budget, so the guidance is not crowded out by its own evidence", () => {
    const comments = Array.from({ length: 200 }, (_, i) => ({
      id: `comment:1:${i}`,
      text: "x".repeat(2000),
    }));
    const digest = evidenceDigest({ comments });
    // 200 × 2000 characters is 400 KB of payload; the block a model reads is
    // a small multiple of the per-item cap, not that.
    expect(digest.length).toBeLessThan(20_000);
  });

  it("renders nothing for a result that carries no material", () => {
    // A verdict, a state change, a view the model itself authored: guidance
    // and nothing appended is correct, and an empty digest is how `withEvidence`
    // knows to append nothing at all.
    expect(evidenceDigest({ ok: true, mcpCredits: { cost: 0 } })).toBe("");
    expect(withEvidence("Just the guidance.", { ok: true })).toBe("Just the guidance.");
  });

  it("puts the guidance first and the material after it", () => {
    const out = withEvidence("Do this with what follows.", {
      posts: [{ caption: "a post", externalUrl: "https://example.test/1" }],
    });
    // Guidance first because it is the instruction: a model that reads the
    // material before knowing what it is for reads it twice.
    expect(out.indexOf("Do this with what follows.")).toBeLessThan(out.indexOf("a post"));
    expect(out).toContain("---");
  });

  it("survives rows that are missing the fields its shape expects", () => {
    // Upstream shapes differ per network and a mapper can hand back a row with
    // almost nothing on it. That is a thin line, never a crash.
    expect(() =>
      evidenceDigest({ posts: [{}, null, { caption: "only a caption" }] as unknown[] }),
    ).not.toThrow();
    const digest = evidenceDigest({ posts: [{}, { caption: "only a caption" }] });
    expect(digest).toContain("only a caption");
  });

  it("names each kind of material a payload carries", () => {
    const digest = evidenceDigest({
      posts: [{ caption: "a post" }],
      unavailable: [{ platform: "reddit", reason: "could not be searched" }],
    });
    expect(digest).toContain("1 post:");
    expect(digest).toContain("reddit");
    // A network that could not be searched is evidence too — an answer that
    // silently covers half of what was asked reads as a complete one.
    expect(digest).toContain("could not be searched");
  });

  it("renders the replies under a post, not just the post", () => {
    // The place #59 could come back without the chain-map gate noticing:
    // `posts` is rendered, so the check is satisfied, while the comment that
    // was paid for stays one level down in the payload only.
    const digest = evidenceDigest({
      posts: [
        {
          caption: "Completely out of ideas",
          externalUrl: "https://www.reddit.com/r/x/comments/1/",
          commentsRead: 2,
          commentSample: [
            { id: "c1", author: "sam", text: "same here, this is exactly my problem" },
            { id: "c2", author: "kim", text: "I gave up and hired someone" },
          ],
        },
      ],
    });
    expect(digest).toContain("same here, this is exactly my problem");
    expect(digest).toContain("@sam");
  });

  it("says a thread would not open rather than implying nobody replied", () => {
    const digest = evidenceDigest({
      posts: [{ caption: "a post", externalUrl: "https://example.test/1", commentsRead: 0 }],
    });
    expect(digest).toContain("would not open");
  });
});
