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
export const ownIt =
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
        "seen the visuals; if a judgement needs them, call analyze_post with",
        "mode 'evidence' yourself and look at the frames — do not ask anyone",
        "else to fetch them for you.",
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

/**
 * When the AI pass cannot deliver an analysis, and what to say about it.
 *
 * A user asked Claude to analyze a post, the tool came back with "AI service
 * not configured or request failed", and the model relayed that to the user
 * along with an instruction to call `get_post_frames` so it could look at the
 * images itself. Every ingredient of the better answer was already here: the
 * evidence plan above fetches exactly those frames and that transcript. The
 * tool should have run it rather than handing the user homework.
 *
 * So the AI path is now watched for failure, and failure has two shapes.
 */
export interface AiFailure {
  /** `error` when the call threw or the job errored; `degraded` when it returned without an analysis. */
  kind: "error" | "degraded";
  /** One line naming the signal, so the result can say what actually happened. */
  detail: string;
  /**
   * The `mcpCredits` note the failed call carried, when it carried one. Only a
   * degraded call has one: it completed, so the backend billed it.
   */
  charge?: Record<string, unknown> | null;
}

/**
 * The backend's own words when it has no model to call.
 *
 * Only a last resort. Every degraded payload measured against the live server
 * also carries a structural flag — `analyzed: false`, `degraded: true`, a
 * `provider` of stub/mock/unavailable — and those are checked first, because a
 * sentence is a thing someone rewrites without knowing it is load-bearing. The
 * one shape with no flag at all is the mock video-analysis stub in
 * `crates/server/src/ai/handlers.rs`, whose fields simply contain the words
 * "stub data (AI service not configured)". Hence the defensive match.
 */
const STUB_MARKER =
  /\bstub(?:bed)? data\b|\[stubbed\b|AI service not configured|AI service (?:is )?unavailable|analysis unavailable/i;

/** Providers that mean "nobody actually read the post". */
const NON_PROVIDERS = new Set(["stub", "mock", "unavailable", "degraded", "none"]);

/** Keys whose contents are bytes or rendered HTML — never worth scanning. */
const UNSCANNED = new Set(["data", "frames", "inlineImages", "_htmlCards", "_inlineImages", "thumbnailUrl"]);

function nonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

/** The structural signals, checked on one object. */
function flaggedFailure(o: Record<string, unknown>, where: string): AiFailure | null {
  const at = where ? `${where}.` : "";
  if (o.analyzed === false) {
    const why = nonEmptyString(o.warning) ? o.warning : nonEmptyString(o.error) ? o.error : nonEmptyString(o.reason) ? o.reason : "";
    return { kind: "degraded", detail: `${at}analyzed is false${why ? ` — ${why}` : ""}` };
  }
  if (o.degraded === true) {
    const why = nonEmptyString(o.degradedReason) ? o.degradedReason : nonEmptyString(o.error) ? o.error : "";
    return { kind: "degraded", detail: `${at}degraded is true${why ? ` — ${why}` : ""}` };
  }
  if (nonEmptyString(o.provider) && NON_PROVIDERS.has(o.provider.toLowerCase())) {
    return { kind: "degraded", detail: `${at}provider is "${o.provider}" — no model read this post` };
  }
  if (o.state === "error") {
    return { kind: "error", detail: `the analysis job ended in state "error"${nonEmptyString(o.error) ? ` — ${o.error}` : ""}` };
  }
  if (o.ok === false) {
    return { kind: "error", detail: `the analysis reported ok: false${nonEmptyString(o.error) ? ` — ${o.error}` : ""}` };
  }
  if (nonEmptyString(o.error)) {
    return { kind: "degraded", detail: `${at}error — ${o.error}` };
  }
  if (nonEmptyString(o.warning) && STUB_MARKER.test(o.warning)) {
    return { kind: "degraded", detail: `${at}warning — ${o.warning}` };
  }
  return null;
}

/** Bounded search for the stub's marker text, wherever the backend put it. */
function carriesStubText(value: unknown, depth = 0, budget = { chars: 20_000, nodes: 500 }): boolean {
  if (depth > 5 || budget.nodes-- <= 0 || budget.chars <= 0) return false;
  if (typeof value === "string") {
    budget.chars -= value.length;
    return STUB_MARKER.test(value);
  }
  if (Array.isArray(value)) return value.some((v) => carriesStubText(v, depth + 1, budget));
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([k, v]) => !UNSCANNED.has(k) && carriesStubText(v, depth + 1, budget),
    );
  }
  return false;
}

/**
 * Did this payload actually come back with an analysis in it?
 *
 * Called on what the AI path returned rather than on what it threw — a thrown
 * error is unambiguous, while these payloads arrive as ordinary successes: the
 * backend deliberately returns degraded metadata instead of erroring, so the
 * tool used to hand a caller a stub and call it an answer.
 */
export function detectAiFailure(payload: unknown): AiFailure | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const top = payload as Record<string, unknown>;
  const flagged = flaggedFailure(top, "");
  if (flagged) return flagged;

  // The video-analysis job nests the whole thing one level down, so the flags
  // that matter sit inside `analysis` rather than beside it.
  const analysis = top.analysis;
  if (analysis && typeof analysis === "object" && !Array.isArray(analysis)) {
    const nested = flaggedFailure(analysis as Record<string, unknown>, "analysis");
    if (nested) return nested;
  } else if (analysis === null && "analysis" in top) {
    return { kind: "degraded", detail: "analysis is null — nothing was produced" };
  }
  // Same for the fields a report tool leaves empty when its model never ran.
  for (const key of ["profileReport", "comparison"] as const) {
    if (key in top && top[key] === null) {
      return { kind: "degraded", detail: `${key} is null — nothing was produced` };
    }
  }

  if (top.analyzed === true) return null;
  if (carriesStubText(top)) {
    return { kind: "degraded", detail: "the payload carries the backend's stub marker text" };
  }
  return null;
}

/**
 * What the calling model is told when the rescue fires.
 *
 * It lands beside the guidance because that is the one channel to the model,
 * and it is explicit about two things: that orchyn's own analysis is missing,
 * and that nobody is to be asked to fetch anything. The bug this fixes was a
 * model telling its user to call a tool the model itself could have called.
 */
export function fallbackNote(tool: string, failure: AiFailure): string {
  return [
    `orchyn's own analysis was unavailable for this ${tool} call (${failure.detail}).`,
    "This is the material that analysis is built from, returned instead of an error.",
    // The billing line is not decoration. A degraded call was charged before it
    // turned out to be empty, and a model that says "this cost you the fetch
    // only" would be telling the user something untrue about their money.
    billingNote(failure),
    "",
    "Answer the question that was actually asked, from what is here. Say plainly that",
    "orchyn's analysis was unavailable and that you read the material yourself — then",
    "do exactly that. Do not ask anyone to call another tool: nothing is missing that",
    "you cannot see below.",
    "",
  ].join("\n");
}

/**
 * What the fallback did to the balance, stated rather than implied.
 *
 * The two failure shapes are not billed alike, and the difference is real
 * money. `crates/server/src/mcp_tools.rs` debits before it calls the tool and
 * refunds when that call returns an error — so a thrown failure costs the
 * caller nothing and the fetch below is the only charge. A degraded payload is
 * a *successful* call as far as that code is concerned: it was billed, the
 * refund branch never runs, and nothing on this side can undo it. Saying so is
 * the only honest option available from here.
 */
export function billingNote(failure: AiFailure): string {
  if (failure.kind === "error") {
    return (
      "The AI call failed rather than returning, and the backend refunds an MCP tool call " +
      "that errors, so it left no charge behind."
    );
  }
  const cost = failure.charge && typeof failure.charge.cost === "number" ? failure.charge.cost : null;
  return (
    `The AI call completed and was billed${cost !== null ? ` (${cost} credit${cost === 1 ? "" : "s"})` : ""} ` +
    "before it turned out to carry no analysis — the backend only refunds calls that error, and " +
    "this server cannot refund one from here."
  );
}

/** The other half: what the material handed back in its place cost. */
export function fetchBillingNote(plan: EvidencePlan): string {
  const via = plan.also ? `${plan.via} and ${plan.also.via}` : plan.via;
  return (
    `The material below is billed as the fetch that produced it (${via}), at the data price ` +
    "rather than the analysis one. Retrying this exact call does not charge again: the " +
    "idempotency key is namespaced per tool, so a retry replays the same debits."
  );
}
