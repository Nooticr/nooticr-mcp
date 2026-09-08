/**
 * Putting two creators side by side (issue #30).
 *
 * The surface had a strong and correct stance on baselines, applied in one
 * direction only. `track_creator` scores each post against the median of
 * that creator's own window, "because a raw view count mostly measures
 * follower count — outperformance against themselves is the signal".
 * `why_did_this_underperform` does the same for a single post.
 *
 * Both were right, and both then discarded the comparison. A ratio to one's
 * own median is *exactly* the quantity that IS comparable across creators of
 * different sizes — a 300k-follower account beating its median by 2.1× and a
 * 4k-follower account doing the same are the same event — and no tool ever
 * placed two of them next to each other. So "is their hit rate better than
 * mine?" was unanswerable at any price, while every ingredient was computed on
 * every call and thrown away.
 *
 * The comparison itself stays the model's job, as everywhere else here. This
 * module normalises each creator to the same axis and reports how much window
 * it had to do it with; ranking them server-side would hide exactly the thing
 * that decides whether a ranking means anything.
 */
import {
  ABOVE_RATIO,
  BREAKOUT_RATIO,
  distributionOf,
  MIN_BASELINE_POSTS,
  numberOf,
  standing,
  type Distribution,
} from "./performance.js";

type Row = Record<string, unknown>;

export type CreatorStanding = {
  handle: string;
  platform: string;
  /** Posts actually scored — the denominator of everything below. */
  window: number;
  baseline: Distribution | null;
  /** Share of the window that beat their own median by ABOVE_RATIO or more. */
  hitRate: number | null;
  /** How hard they beat it when they did: the median ratio of the winners. */
  medianWinRatio: number | null;
  /** Every post's ratio to their own median, ascending, so spread is visible. */
  ratios: number[];
  best: Row | null;
  worst: Row | null;
  /** Set when the creator could not be scored, and why. */
  unavailable: string | null;
};

/** Median of an already-sorted list. */
function mid(sorted: number[]): number | null {
  if (!sorted.length) return null;
  const i = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One creator, reduced to the axis every creator shares.
 *
 * `hitRate` is a share of a window and not a rate — over six posts it is one
 * post either way — which is why `window` travels beside it everywhere rather
 * than being folded into a score. A caller that cannot see the denominator
 * cannot know the number is noise, and the guidance below leans on it.
 */
export function creatorStanding(
  handle: string,
  platform: string,
  posts: readonly Row[],
  metric: string,
  pick: (post: Row) => number,
): CreatorStanding {
  const values = posts.map(pick);
  const baseline = distributionOf(values);
  const empty = {
    handle,
    platform,
    window: posts.length,
    baseline,
    hitRate: null,
    medianWinRatio: null,
    ratios: [],
    best: null,
    worst: null,
  };
  if (!posts.length) {
    return { ...empty, unavailable: "no posts came back for this handle" };
  }
  if (!baseline) {
    // Fewer than MIN_BASELINE_POSTS is not a baseline, and inventing one would
    // put a confident ratio on an account nobody has enough of. The same
    // refusal `distributionOf` already makes for a single post.
    return {
      ...empty,
      unavailable: `only ${posts.length} post${posts.length === 1 ? "" : "s"} in the window — ` +
        `${MIN_BASELINE_POSTS} is the fewest that make a baseline`,
    };
  }
  const scored = posts.map((post) => ({ post, standing: standing(pick(post), values) }));
  const ratios = scored.map((s) => numberOf(s.standing.ratio)).filter((r) => Number.isFinite(r));
  const winners = ratios.filter((r) => r >= ABOVE_RATIO);
  const byRatio = [...scored].sort(
    (a, b) => numberOf(b.standing.ratio) - numberOf(a.standing.ratio),
  );
  return {
    handle,
    platform,
    window: posts.length,
    baseline,
    hitRate: round2(winners.length / posts.length),
    medianWinRatio: winners.length ? round2(mid([...winners].sort((a, b) => a - b)) ?? 0) : null,
    ratios: [...ratios].sort((a, b) => a - b).map(round2),
    best: { ...byRatio[0].post, standing: byRatio[0].standing, metric },
    worst: { ...byRatio[byRatio.length - 1].post, standing: byRatio[byRatio.length - 1].standing, metric },
    unavailable: null,
  };
}

/**
 * The window below which a hit rate should not be quoted as one.
 *
 * Not a hard floor — the row is still returned, because "we only have 5 posts"
 * is itself the answer to "who is accelerating?" and hiding it would leave the
 * model guessing. It is the number the guidance names so the model says "too
 * few posts to call this" instead of ranking confidently, the same discipline
 * `find_hook_pattern` applies with "a template that fits one post is not a
 * pattern".
 */
export const THIN_WINDOW = 8;

/**
 * What to do with a set of standings.
 *
 * Written to be read by the model that just received them, in the voice
 * `evidence.ts` sets: say what the material is, what is comparable about it,
 * and what would be a mistake to conclude.
 */
export function standingsGuidance(a: {
  rows: readonly CreatorStanding[];
  metric: string;
  source: "handles" | "watchlist";
}): string {
  const scored = a.rows.filter((r) => !r.unavailable);
  const thin = scored.filter((r) => r.window < THIN_WINDOW);
  const lines: string[] = [];

  lines.push(
    `${a.rows.length} creator${a.rows.length === 1 ? "" : "s"}` +
      (a.source === "watchlist" ? " from your watchlist" : "") +
      `, each scored against their OWN recent median ${a.metric} — never against each other's raw ` +
      "numbers, because a raw count mostly measures follower count. The ratio is what compares: " +
      "a large account beating its median by 2× and a small one doing the same have done the same " +
      "thing.",
  );

  if (!scored.length) {
    lines.push(
      "",
      "None of them could be scored — see `unavailable` on each row. That is a gap in what came " +
        "back, not a finding about the creators, so say which ones and why rather than reporting " +
        "an empty comparison.",
    );
    return lines.join("\n");
  }

  lines.push(
    "",
    "Per creator: `window` is how many posts were scored, `baseline.median` is the middle of " +
      `their own window, \`hitRate\` is the share of it at or above ${ABOVE_RATIO}× that median, ` +
      "`medianWinRatio` is how hard they beat it when they did, and `ratios` is every post's " +
      "ratio ascending so the spread is visible. `best` and `worst` carry the posts themselves.",
    "",
    "Two different questions live in those numbers and they usually disagree: how OFTEN someone " +
      "lands one (`hitRate`) and how BIG it is when they do (`medianWinRatio`). A creator with a " +
      "low hit rate and a high win ratio is swinging; the reverse is consistent and capped. Say " +
      "which of the two you are ranking on, because 'who is doing better' has no single answer.",
  );

  if (thin.length) {
    lines.push(
      "",
      `Do not rank ${thin.map((r) => `@${r.handle} (${r.window} posts)`).join(", ")} confidently. ` +
        `A hit rate over fewer than ${THIN_WINDOW} posts is one post either way, and a median over ` +
        "a window that small moves with the window. Say the sample is too thin to call rather " +
        "than putting them in an order.",
    );
  }

  const unavailable = a.rows.filter((r) => r.unavailable);
  if (unavailable.length) {
    lines.push(
      "",
      `Not scored: ${unavailable.map((r) => `@${r.handle} — ${r.unavailable}`).join("; ")}. ` +
        "Missing from the comparison is not the same as bottom of it.",
    );
  }

  lines.push(
    "",
    `Every ratio here is against a window measured now. It cannot tell you whether anyone's ` +
      "baseline is itself moving — that needs a second point in time, which nothing stores yet " +
      "(issue #28). So do not read a high hit rate as 'improving'; it is 'consistent within this " +
      "window' and nothing more.",
    "",
    "When you have decided what the numbers say, call show_standings with the rows and the axis " +
      "you ranked on. Free, and it is the one place the ranking is attributed to you rather than " +
      "presented as a nooticr score — it also draws a creator with too thin a window as unranked " +
      "rather than last, which is the mistake a plain table makes on your behalf.",
  );
  return lines.join("\n");
}

/** Threshold re-exported so the tools and the view agree on the badge. */
export { ABOVE_RATIO, BREAKOUT_RATIO };
