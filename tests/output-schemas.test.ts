/**
 * These schemas are enforced, not documentation: the SDK throws on
 * structuredContent that fails one, so a schema that is wrong about the data
 * takes the tool down completely.
 *
 * Which is what happened. The first version typed each leaf from a sampled
 * response — duration a number, videoUrl a string — with `.optional()`, which
 * accepts `undefined` and rejects `null`. A slideshow post carries
 * `videoUrl: null`, `duration: null` and `slideCount: null`, so the first feed
 * containing one made discover_social_posts fail outright. It had been called
 * fifteen times against the live server before shipping and never once against
 * a feed with a slideshow in it.
 *
 * So the guard here is not "does the shape I sampled still parse". It is: can
 * any declared field be null, and can any object carry a key nobody has
 * invented yet. Those are the two ways the upstream moves, and neither may
 * break a call.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { OUTPUT_SCHEMAS } from "../src/shared/output-schemas.js";

const names = Object.keys(OUTPUT_SCHEMAS) as Array<keyof typeof OUTPUT_SCHEMAS>;

/** The declared top-level keys of a schema, whatever it wraps. */
function keysOf(schema: z.ZodTypeAny): string[] {
  const def = (schema as unknown as { _def?: { shape?: unknown } })._def;
  const shape = typeof def?.shape === "function" ? (def.shape as () => object)() : def?.shape;
  return shape ? Object.keys(shape as object) : [];
}

describe("output schemas", () => {
  it("declares one for every tool that returns structured content", () => {
    expect(names.length).toBeGreaterThanOrEqual(24);
  });

  // The bug, exactly: every field the backend can leave empty, left empty.
  it.each(names)("%s accepts null in every declared field", (name) => {
    const schema = OUTPUT_SCHEMAS[name] as z.ZodTypeAny;
    const allNull = Object.fromEntries(keysOf(schema).map((k) => [k, null]));
    const result = schema.safeParse(allNull);
    expect(
      result.success,
      `${name} rejects a null field: ${result.success ? "" : JSON.stringify(result.error.issues.slice(0, 3))}`,
    ).toBe(true);
  });

  it.each(names)("%s accepts a field nobody has invented yet", (name) => {
    const schema = OUTPUT_SCHEMAS[name] as z.ZodTypeAny;
    const result = schema.safeParse({ aFieldFromNextQuarter: { nested: [1, "two", null] } });
    expect(result.success).toBe(true);
  });

  it.each(names)("%s accepts an empty result", (name) => {
    expect((OUTPUT_SCHEMAS[name] as z.ZodTypeAny).safeParse({}).success).toBe(true);
  });

  // The real payload that broke it, reduced to the part that mattered: a feed
  // mixing a video post with two slideshows.
  it("accepts the mixed feed that broke discover_social_posts", () => {
    const feed = {
      platform: "tiktok",
      posts: [
        {
          id: "1", platform: "tiktok", contentType: "video", duration: 57,
          externalUrl: "https://www.tiktok.com/@a/video/1",
          videoUrl: "https://api.nooticr.com/media/files/a.mp4",
          views: 4963693, likes: 438800, slideCount: null,
        },
        {
          id: "2", platform: "tiktok", contentType: "slideshow",
          externalUrl: "https://www.tiktok.com/@b/video/2",
          // The three the schema used to reject.
          videoUrl: null, duration: null, slideCount: null,
          thumbnailUrl: "https://p16.tiktokcdn-us.com/x.jpg", views: 136029,
        },
      ],
      mcpCredits: { cost: 2, adminBypass: true },
    };
    const result = OUTPUT_SCHEMAS.discover_social_posts.safeParse(feed);
    expect(
      result.success,
      result.success ? "" : JSON.stringify(result.error.issues.slice(0, 5)),
    ).toBe(true);
  });

  // A list can be null, and so can something inside it.
  it("accepts a null entry inside a list", () => {
    const result = OUTPUT_SCHEMAS.discover_social_posts.safeParse({
      posts: [null, { id: "1" }],
    });
    expect(result.success).toBe(true);
  });

  // Types drift too: a count that arrives as a string must not break the call.
  it("accepts a number that arrives as a string", () => {
    const result = OUTPUT_SCHEMAS.discover_social_posts.safeParse({
      posts: [{ id: "1", views: "1.5M", duration: "57" }],
    });
    expect(result.success).toBe(true);
  });
});

/**
 * check_nooticr_credits ships the same list under two names.
 *
 * firstFreeRemaining has no reader anywhere — the credits card draws its pills
 * from firstFreeTools — but it was published in this schema, so removing it
 * would break a host that validates a response against the advertised output.
 * Both stay, which leaves one hazard: two names for one answer can start
 * giving two answers, and a caller that picked the undocumented one would then
 * be quietly wrong. These pin the alias to being a duplicate.
 */
describe("check_nooticr_credits free-tool aliases", () => {
  const credits = OUTPUT_SCHEMAS.check_nooticr_credits;
  const shape = credits.shape;

  /** The invariant, stated once: while both ship, they are one list. */
  function agrees(payload: Record<string, unknown>): boolean {
    const { firstFreeTools: tools, firstFreeRemaining: alias } = payload;
    if (tools === undefined || alias === undefined) return true;
    return JSON.stringify(alias) === JSON.stringify(tools);
  }

  it("still declares both names", () => {
    expect(keysOf(credits)).toEqual(
      expect.arrayContaining(["firstFreeTools", "firstFreeRemaining"]),
    );
  });

  // The description is what a client actually sees — it is carried through to
  // the JSON Schema in tools/list — so losing it is losing the only signpost
  // off the dead field.
  it("tells a client which name to read", () => {
    expect(shape.firstFreeRemaining.description).toContain("firstFreeTools");
    expect(shape.firstFreeTools.description).toBeTruthy();
  });

  it.each([
    ["neither present", {}],
    ["only firstFreeTools", { firstFreeTools: ["analyze_comments"] }],
    ["only firstFreeRemaining", { firstFreeRemaining: ["analyze_comments"] }],
    ["both, agreeing", {
      firstFreeTools: ["analyze_comments", "get_post_transcript"],
      firstFreeRemaining: ["analyze_comments", "get_post_transcript"],
    }],
    ["both empty", { firstFreeTools: [], firstFreeRemaining: [] }],
    ["both null", { firstFreeTools: null, firstFreeRemaining: null }],
  ])("holds when %s", (_label, payload) => {
    expect(agrees(payload)).toBe(true);
    expect(credits.safeParse(payload).success).toBe(true);
  });

  // Without this the check above would pass on any payload at all, including
  // the drift it exists to catch.
  it.each([
    ["the lists differ", {
      firstFreeTools: ["analyze_comments"],
      firstFreeRemaining: ["get_post_transcript"],
    }],
    ["one has been spent and the other has not", {
      firstFreeTools: [],
      firstFreeRemaining: ["analyze_comments"],
    }],
    ["the order differs", {
      firstFreeTools: ["a", "b"],
      firstFreeRemaining: ["b", "a"],
    }],
  ])("catches disagreement when %s", (_label, payload) => {
    expect(agrees(payload)).toBe(false);
  });

  // Deliberately a test and not a `.refine`. The SDK throws on structuredContent
  // that fails its schema, so enforcing this in the schema would turn a backend
  // that drifted into a credits tool that returns nothing at all — the exact
  // failure the null-handling above was written to stop.
  it("does not fail the call when they disagree", () => {
    const drifted = {
      balance: 18,
      firstFreeTools: ["analyze_comments"],
      firstFreeRemaining: ["get_post_transcript"],
    };
    expect(agrees(drifted)).toBe(false);
    expect(credits.safeParse(drifted).success).toBe(true);
  });
});

/**
 * Where the data actually is, pinned against the backend that sends it.
 *
 * The guards above ask whether a payload *parses*. That is not the same
 * question as whether the schema describes the right shape, and the gap
 * between the two is where these three shipped broken:
 *
 *  - generate_content_plan declared `plan` as the per-influencer array. The
 *    backend sends the whole ContentPlan object and nests that array one
 *    level down, so every real call failed output validation outright —
 *    after the generation had already been billed.
 *  - draft_post and generate_captions each declared fields the backend has
 *    never sent (`title`/`script` at the top level; `captions`). Those
 *    parsed fine, because everything here is nullish and passthrough, and
 *    were simply always undefined to a caller reading them.
 *
 * So these assert on the values, not on `success`: a schema that moves the
 * data somewhere the backend does not put it fails here even when it parses.
 * Payloads are transcribed from the handlers named beside each one.
 */
describe("declared shapes match what the backend sends", () => {
  // crates/server/src/ai/growth.rs — `content_plan`, returning `struct ContentPlan`.
  it("generate_content_plan finds the influencer array nested under plan", () => {
    const parsed = OUTPUT_SCHEMAS.generate_content_plan.parse({
      ok: true,
      plan: {
        weekStart: "2026-09-07",
        grounding: { topHooks: ["a"] },
        plan: [{ influencerId: 3, influencerName: "Zoe", posts: [{ day: "2026-09-07", hook: "h" }] }],
      },
      grounding: { totalPosts: 12 },
      provider: "gemini",
    }) as { plan?: { plan?: Array<{ influencerName?: unknown }> } };
    expect(parsed.plan?.plan?.[0]?.influencerName).toBe("Zoe");
  });

  // These two cannot be pinned by parsing a payload, and that is the point.
  // `open()` is passthrough, so a payload keeps every key it arrived with
  // whatever the schema declares — reading `parsed.draft.title` succeeds even
  // against a schema that declares `title` at the top level and has never
  // heard of `draft`. The mis-declaration is invisible to a value assertion,
  // so these assert on the declaration itself.

  // crates/server/src/ai/extra_handlers.rs — `draft_post` answers
  // `{ ok, draft: {...}, provider }`.
  it("draft_post declares the copy under draft, not at the top level", () => {
    const keys = keysOf(OUTPUT_SCHEMAS.draft_post as z.ZodTypeAny);
    expect(keys).toContain("draft");
    // `script` was never a field the generator emits at all — a slideshow's
    // per-slide copy comes back inside `draft.slides`.
    expect(keys).not.toContain("script");
    expect(keys).not.toContain("title");
  });

  // crates/server/src/ai/handlers.rs — `generate_captions` answers
  // `{ ok, provider, cost, transcript, cues: [{ text, start_sec, end_sec }] }`.
  it("generate_captions declares cues, not captions", () => {
    const keys = keysOf(OUTPUT_SCHEMAS.generate_captions as z.ZodTypeAny);
    expect(keys).toContain("cues");
    expect(keys).toContain("transcript");
    expect(keys).not.toContain("captions");
  });
});
