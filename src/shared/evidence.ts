/**
 * Evidence mode: hand the caller the material instead of a conclusion.
 *
 * ## The shape of the argument
 *
 * Every AI tool here does the same two things — fetch something from a
 * platform, then have Gemini read it. Only the first half is expensive to us
 * and hard to replicate; the second is text over text, which the model already
 * holding the conversation does better, steers itself, and costs us nothing.
 *
 * So each of these tools gains `mode: "evidence"`. It makes the same upstream
 * call the corresponding data tool makes — billed as that call, not as an AI
 * one — and returns the inputs with an explicit account of what to produce.
 *
 * `mode: "ai"` stays the default everywhere. Nothing existing changes.
 *
 * ## Visual tools are the interesting case
 *
 * `analyze_post` and `understand_social_post` were the one place a text model
 * genuinely could not substitute: you cannot reason about a video you have not
 * seen. But the caller *can* see — MCP carries images in a tool result and
 * hosts pass them to their model as real images. Measured on Claude Code
 * 2.1.258: a 1280x720 frame costs ~1,212 tokens, eight frames in one result
 * were read back correctly and in order, and the same bytes sent as text were
 * unreadable. Twenty frames is about 2.4% of a million-token context.
 *
 * So the visual tools return frames — actual image blocks — plus the
 * transcript. Frames and words together are what "watching it" decomposes
 * into, and both are things we already fetch.
 *
 * ## Why every result carries instructions
 *
 * A tool result is the only channel to the calling model — prompts are
 * user-controlled and cannot drive anything. So the guidance below is not
 * documentation; it is the steering, and it lands in the model's context.
 */

/** Which cheap call stands in for each AI tool's expensive one. */
export interface EvidencePlan {
  /** The backend tool that fetches the same material, at the data price. */
  via: string;
  /** Arguments to hand it, derived from the AI tool's own arguments. */
  args: (a: Record<string, unknown>) => Record<string, unknown>;
  /** A second fetch worth having, when one exists. Failure is not fatal. */
  also?: { via: string; args: (a: Record<string, unknown>) => Record<string, unknown> };
  /** Frames make sense only where there is something to look at. */
  frames?: boolean;
  /** What the caller should do with it. */
  guidance: (a: Record<string, unknown>) => string;
}

const url = (a: Record<string, unknown>) => String(a.url ?? "");

/** Closing line every guidance block shares. */
const ownIt =
  "Reason over this yourself rather than asking for an interpretation of it — " +
  "you can see everything the analysis would have been built from.";

export const EVIDENCE_PLANS: Record<string, EvidencePlan> = {
  analyze_post: {
    via: "get_post_frames",
    args: (a) => ({ url: url(a), count: Number(a.frames ?? 8) }),
    also: { via: "get_post_transcript", args: (a) => ({ url: url(a) }) },
    frames: true,
    guidance: () =>
      [
        "Frames sampled evenly across this post, plus its transcript and stats.",
        "",
        "Look at the frames and read the words, then work out: what the hook is",
        "and why it holds, how the piece is structured beat by beat, what the",
        "visual style is doing, where the call to action lands, and who this is",
        "aimed at. Say which frame or line you are drawing each claim from.",
        "",
        "The frames are samples, not the whole video — if something you need",
        "happens between them, say so rather than filling the gap.",
        ownIt,
      ].join("\n"),
  },

  understand_social_post: {
    via: "get_post_frames",
    args: (a) => ({ url: url(a), count: Number(a.frames ?? 8) }),
    also: { via: "get_post_transcript", args: (a) => ({ url: url(a) }) },
    frames: true,
    guidance: () =>
      [
        "Frames sampled evenly across this post, plus its transcript.",
        "",
        "Describe what physically happens on screen, in order — the events, not",
        "the strategy. Anchor each observation to a frame. Where the frames do",
        "not show something, say the sampling does not cover it.",
        ownIt,
      ].join("\n"),
  },

  analyze_post_fast: {
    via: "get_social_media",
    args: (a) => ({ url: url(a) }),
    also: { via: "get_post_transcript", args: (a) => ({ url: url(a) }) },
    guidance: () =>
      [
        "This post's transcript, caption and stats — no frames, which is what",
        "makes this the cheap read.",
        "",
        "Work out the hook, the script structure, the call to action and the",
        "audience from the words and the numbers. Be explicit that you have not",
        "seen the visuals; if a judgement needs them, say so and suggest",
        "analyze_post with mode 'evidence' to get frames.",
        ownIt,
      ].join("\n"),
  },

  compare_posts: {
    via: "get_social_media",
    args: (a) => ({ url: String((a.urls as string[])?.[0] ?? "") }),
    guidance: (a) =>
      [
        `The first of ${(a.urls as string[])?.length ?? 0} posts to compare.`,
        "Call get_social_media on each remaining URL, and get_post_transcript",
        "where you need the words, then compare them yourself:",
        "which performed better, what actually differed, and the single test",
        "worth running next. Ground every difference in a number or a quote.",
        ownIt,
      ].join("\n"),
  },

  analyze_creator_profile: {
    via: "get_user_posts",
    args: (a) => ({
      username: String(a.username ?? ""),
      platform: a.platform,
      limit: Number(a.limit ?? 12),
    }),
    guidance: (a) =>
      [
        `Recent posts by ${a.username}, with their stats.`,
        "",
        "Work out this creator's niche, recurring themes, hook formula, what",
        "over- and under-performs for them, and who their audience is. Use the",
        "spread of the numbers, not just the best post. Name the posts you are",
        "reasoning from.",
        ownIt,
      ].join("\n"),
  },

  find_hook_pattern: {
    via: "get_user_posts",
    args: (a) => ({
      username: String(a.username ?? ""),
      platform: a.platform,
      limit: Number(a.limit ?? 12),
    }),
    guidance: (a) =>
      [
        `Recent posts by ${a.username}. Their opening lines are the material.`,
        "",
        "Extract the repeatable formula: the devices they reuse, as",
        "fill-in-the-blank templates someone could apply to another topic.",
        "A template that only fits one post is not a pattern — say how many",
        "posts each one is drawn from.",
        ownIt,
      ].join("\n"),
  },

  niche_report: {
    via: "discover_social_posts",
    args: (a) => ({
      niche: String(a.niche ?? ""),
      platform: a.platform,
      limit: Number(a.count ?? 12),
    }),
    guidance: (a) =>
      [
        `Recent posts in the "${a.niche}" niche, with their stats.`,
        "",
        "Work out what is working right now: dominant formats, hook patterns,",
        "what over- and under-performs, and the gaps nobody is filling. The",
        "gaps are the valuable part and the easiest to invent — only name one",
        "if its absence is visible in this set.",
        ownIt,
      ].join("\n"),
  },

  write_hooks: {
    via: "get_social_media",
    args: (a) => ({ url: url(a) }),
    also: { via: "get_post_transcript", args: (a) => ({ url: url(a) }) },
    guidance: (a) =>
      [
        a.url ? "The source post, its transcript and its stats." : "No source post given.",
        "",
        "Write alternative opening lines grounded in this material. For each,",
        "name the device it uses and who it stops. A hook that could open any",
        "video in the niche is not grounded in this one.",
        ownIt,
      ].join("\n"),
  },

  create_variants: {
    via: "get_social_media",
    args: (a) => ({ url: url(a) }),
    also: { via: "get_post_transcript", args: (a) => ({ url: url(a) }) },
    guidance: () =>
      [
        "The post that worked, its transcript and its stats.",
        "",
        "Propose variants worth filming next: for each, the hook, the one angle",
        "that changes, the shot beats in order, and the call to action. Keep",
        "whatever made the original work and say what that was.",
        ownIt,
      ].join("\n"),
  },

  repurpose_post: {
    via: "get_social_media",
    args: (a) => ({ url: url(a) }),
    also: { via: "get_post_transcript", args: (a) => ({ url: url(a) }) },
    guidance: (a) => {
      const targets = (a.targets as string[]) ?? [];
      return [
        "The source post, its transcript and its stats.",
        "",
        `Rewrite it for ${targets.length ? targets.join(", ") : "the surfaces you are asked for"}.`,
        "Each surface has its own length, register and conventions — a copy of",
        "the same paragraph with different line breaks is not a repurposing.",
        ownIt,
      ].join("\n");
    },
  },
};

/**
 * `score_draft` is deliberately absent.
 *
 * It reviews text the user already supplied, so there is nothing to fetch —
 * an evidence mode would be a paid call that returned the caller's own input.
 * A caller that wants to judge a draft itself should simply judge it.
 */
export const NO_EVIDENCE_MODE = ["score_draft"] as const;

/** Frames as MCP image blocks, which is how they reach the model as pixels. */
export interface FrameBlock {
  type: "image";
  data: string;
  mimeType: string;
}

export function framesToBlocks(frames: unknown): FrameBlock[] {
  if (!Array.isArray(frames)) return [];
  return frames
    .map((f) => {
      const frame = (f ?? {}) as Record<string, unknown>;
      const data = String(frame.data ?? "");
      if (!data) return null;
      return {
        type: "image" as const,
        data,
        mimeType: String(frame.mimeType ?? "image/jpeg"),
      };
    })
    .filter((f): f is FrameBlock => f !== null);
}

/** Where each frame sits in the video, so the caller can cite one. */
export function frameIndex(frames: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(frames)) return [];
  return frames.map((f, i) => {
    const frame = (f ?? {}) as Record<string, unknown>;
    return {
      frame: i + 1,
      atSeconds: frame.atSeconds ?? null,
      atFraction: frame.atFraction ?? null,
    };
  });
}
