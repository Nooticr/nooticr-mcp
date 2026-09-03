/**
 * Outperformance, measured against the creator's own baseline.
 *
 * ## Why a raw view count is not an answer
 *
 * "This post did 400,000 views" tells you about the account, not the post. An
 * account with two million followers does 400,000 views on a bad day; one with
 * eight thousand does it once a year. The only comparison that isolates the
 * post is against the same creator's other recent posts, because follower
 * count, niche, posting cadence and platform are held constant across them.
 *
 * So everything here is a ratio to the creator's own median, and the median
 * rather than the mean: a single breakout of ten million drags a mean above
 * every post that produced it, and the number a reader wants is "what happens
 * when this account posts normally". `get_user_posts` already returns the
 * stats, so this is arithmetic over material we have paid for once — no extra
 * call, and nothing here asks a model anything.
 *
 * ## Why the post being measured is excluded from its own baseline
 *
 * `get_user_posts` returns the recent window, and the post under examination
 * is usually in it. Leaving it in means measuring it partly against itself:
 * over twelve posts a genuine breakout pulls the median it is being judged
 * against upward, and the flop it is meant to expose looks less flat than it
 * is. `excluding` takes it back out.
 */

/** A number however the backend spelled it — strings and nulls both arrive. */
export function numberOf(value: unknown): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** The spread of a creator's recent posts, as a reader would describe it. */
export interface Distribution {
  /** How many posts the baseline is drawn from. */
  count: number;
  median: number;
  min: number;
  max: number;
  /** Quartiles, so "typical" has an actual width rather than being a point. */
  p25: number;
  p75: number;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The value at a fraction of the way through the sorted values, interpolated. */
function quantile(sorted: number[], fraction: number): number {
  if (!sorted.length) return 0;
  const at = (sorted.length - 1) * fraction;
  const low = Math.floor(at);
  const high = Math.ceil(at);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (at - low);
}

/**
 * A baseline, or null when there is nothing to be a baseline of.
 *
 * Fewer than three posts is not a distribution — it is two numbers, and
 * calling either of them "the median" invites a confident claim about an
 * account nobody has enough of. Returning null makes the caller say so.
 */
export const MIN_BASELINE_POSTS = 3;

export function distributionOf(values: number[]): Distribution | null {
  const usable = values.filter((v) => Number.isFinite(v));
  if (usable.length < MIN_BASELINE_POSTS) return null;
  const sorted = [...usable].sort((a, b) => a - b);
  return {
    count: sorted.length,
    median: median(sorted),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
  };
}

/**
 * Where one post sits against a baseline.
 *
 * `verdict` exists so two runs are comparable and a view can draw a badge.
 * The thresholds are deliberately coarse: scraped view counts move by tens of
 * percent between fetches of the same post, so a band narrower than these
 * would report noise as a finding.
 */
export const BREAKOUT_RATIO = 2;
export const ABOVE_RATIO = 1.25;
export const BELOW_RATIO = 0.75;
export const FLOP_RATIO = 0.4;

export type Verdict = "breakout" | "above_baseline" | "typical" | "below_baseline" | "flop" | "no_baseline";

export interface Standing {
  value: number;
  /** The creator's own median for this metric, or null when there is no baseline. */
  median: number | null;
  /** value / median, to two decimals. Null when the median is zero or missing. */
  ratio: number | null;
  /** Percentage of the baseline posts this one beat. Null without a baseline. */
  percentile: number | null;
  verdict: Verdict;
}

export function standing(value: number, baseline: number[]): Standing {
  const dist = distributionOf(baseline);
  if (!dist || dist.median === 0) {
    // A median of zero happens on accounts whose stats the platform withholds.
    // Dividing by it would produce Infinity and a "breakout" badge on a post
    // nobody can measure, which is worse than admitting there is no baseline.
    return { value, median: dist ? dist.median : null, ratio: null, percentile: null, verdict: "no_baseline" };
  }
  const ratio = Math.round((value / dist.median) * 100) / 100;
  const beaten = baseline.filter((v) => v < value).length;
  return {
    value,
    median: dist.median,
    ratio,
    percentile: Math.round((beaten / baseline.length) * 100),
    verdict:
      ratio >= BREAKOUT_RATIO
        ? "breakout"
        : ratio >= ABOVE_RATIO
          ? "above_baseline"
          : ratio > BELOW_RATIO
            ? "typical"
            : ratio > FLOP_RATIO
              ? "below_baseline"
              : "flop",
  };
}

/**
 * The same posts with one of them taken out, matched on whatever identifies it.
 *
 * Platforms return the permalink in `externalUrl` and an id in `id`, and which
 * of the two the caller holds depends on where they got the post from — a URL
 * the user pasted, or a row from an earlier feed. Matching on either is what
 * makes the exclusion reliable in both cases.
 */
export function excluding(
  posts: Array<Record<string, unknown>>,
  identity: { url?: string; id?: string },
): Array<Record<string, unknown>> {
  const url = normaliseUrl(identity.url);
  const id = String(identity.id ?? "");
  if (!url && !id) return posts;
  return posts.filter((p) => {
    const theirUrl = normaliseUrl(String(p.externalUrl ?? p.url ?? ""));
    const theirId = String(p.id ?? "");
    if (url && theirUrl && theirUrl === url) return false;
    if (id && theirId && theirId === id) return false;
    return true;
  });
}

/**
 * A URL reduced to the part two spellings of the same post agree on.
 *
 * The URL a user pastes carries a share tracker (`?is_from_webapp`, `?si=`)
 * and often a trailing slash; the one `get_user_posts` returns does not. A
 * string comparison of the two says they are different posts, which would
 * leave the post being measured inside its own baseline.
 */
function normaliseUrl(raw?: string): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  try {
    const u = new URL(value);
    // YouTube is the exception: the id lives in the query, so the query cannot
    // simply be dropped the way it can everywhere else.
    const v = u.searchParams.get("v");
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path}${v ? `?v=${v}` : ""}`.toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}
