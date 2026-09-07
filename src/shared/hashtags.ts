/**
 * Trending hashtags for the nine networks that have no trend board.
 *
 * `discover_hashtags` reads TikTok's Creative Center, which is a real trend
 * board: it knows post counts, view counts, and whether a tag is rising,
 * cooling or steady. Nothing equivalent exists upstream for the other nine
 * networks, so "what should I tag this?" was answerable on one network out of
 * ten — while `repurpose_post` exists precisely to move a post between
 * networks, and tagging is part of the conventions it cannot inform (issue #32).
 *
 * What is available is a niche sweep the caller is often paying for anyway.
 * Counting tags across the captions it returns is a current, per-network answer
 * drawn from real posts. It is weaker than a trend board and weaker in a
 * specific way — a sample of one search has no rising/cooling signal, because
 * there is no earlier sample to compare against — so the result says which
 * source it came from rather than presenting the two as the same measurement.
 * Same idea as `get_post_transcript` marking `source: "speech-to-text"`.
 */

/** A post as the sweep returns it — only the two fields this reads. */
export type SweptPost = {
  hashtags?: unknown;
  caption?: unknown;
  title?: unknown;
  views?: unknown;
  externalUrl?: unknown;
};

export type DerivedHashtag = {
  hashtag: string;
  /** How many of the swept posts carried it. */
  posts: number;
  /** Total views across those posts, when the network reports views. */
  views: number | null;
  /** Views of the median post carrying it — less skewed by one outlier. */
  medianViews: number | null;
  /** A post using it, so a claim about the tag can be checked against one. */
  example: string | null;
};

const NUM = /^-?\d+(\.\d+)?$/;
function views(post: SweptPost): number | null {
  const raw = post.views;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && NUM.test(raw.trim())) return Number(raw.trim());
  return null;
}

/**
 * Tags in one post: the `hashtags` array when the network fills it, plus any
 * `#tag` written in the caption.
 *
 * Both, not either. Instagram and TikTok populate `hashtags`; X, Reddit and
 * LinkedIn frequently leave it empty while the caption is full of them, and a
 * tally that trusted only the array returned nothing for exactly the networks
 * this exists to serve.
 */
/**
 * Scripts where two characters is a word, not an abbreviation.
 *
 * The length floor below exists to keep "#1" and "#ad" off the top of a
 * frequency count, and a flat "three or more" is the wrong way to spell that:
 * 护肤 is "skincare", スキンケア's stem is two kana, and both are exactly the
 * networks this widening was for. The first version of this dropped them
 * silently — an empty answer for Weibo and Xiaohongshu that would have read as
 * "this niche has no tags".
 */
const IDEOGRAPHIC = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** Noise at the top of a frequency count, rather than an answer. */
function isNoise(tag: string): boolean {
  if (/\s/.test(tag) || !tag) return true;
  // A bare number is never the tag someone searched for.
  if (/^\p{N}+$/u.test(tag)) return true;
  return tag.length < (IDEOGRAPHIC.test(tag) ? 2 : 3);
}

export function tagsIn(post: SweptPost): string[] {
  const out = new Set<string>();
  const add = (raw: unknown) => {
    const clean = String(raw ?? "")
      .replace(/^#/, "")
      .trim()
      .toLowerCase();
    if (!isNoise(clean)) out.add(clean);
  };
  if (Array.isArray(post.hashtags)) for (const tag of post.hashtags) add(tag);
  for (const field of [post.caption, post.title]) {
    // Unicode letters and marks, so a Weibo or Xiaohongshu tag is not dropped.
    // The floor is applied in `add`, not here, so one rule decides it.
    for (const m of String(field ?? "").matchAll(/#([\p{L}\p{M}\p{N}_]{2,})/gu)) add(m[1]);
  }
  return [...out];
}

/** The median of a list, or null when there is nothing to take one of. */
function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Rank the tags in a swept feed by how many posts carry them.
 *
 * Ties break on median views rather than total, so one viral post carrying a
 * tag nobody else uses does not outrank a tag five posts share. `count` caps
 * the output; a tag used by exactly one post is dropped, because a tag that
 * appears once is that post's tag and not the niche's — the same reasoning
 * `find_hook_pattern` applies to a template that fits one post.
 */
export function deriveHashtags(posts: readonly SweptPost[], count = 20): DerivedHashtag[] {
  const seen = new Map<string, { posts: number; views: number[]; example: string | null }>();
  for (const post of posts) {
    const v = views(post);
    const url = typeof post.externalUrl === "string" ? post.externalUrl : null;
    for (const tag of tagsIn(post)) {
      const row = seen.get(tag) ?? { posts: 0, views: [], example: null };
      row.posts += 1;
      if (v !== null) row.views.push(v);
      row.example ??= url;
      seen.set(tag, row);
    }
  }
  return [...seen.entries()]
    .filter(([, row]) => row.posts > 1)
    .map(([hashtag, row]) => ({
      hashtag,
      posts: row.posts,
      views: row.views.length ? row.views.reduce((a, b) => a + b, 0) : null,
      medianViews: median(row.views),
      example: row.example,
    }))
    .sort((a, b) => b.posts - a.posts || (b.medianViews ?? -1) - (a.medianViews ?? -1))
    .slice(0, Math.max(1, count));
}

/**
 * What the derived result says about itself.
 *
 * A caller handed a ranked list of tags will otherwise read it as a trend
 * board, and act on a "rising" signal that was never measured. Naming the
 * sample size is the honest version: five posts do not establish that a tag is
 * popular, and the model is the one that has to decide whether to say so.
 */
export function derivedNote(niche: string, platform: string, swept: number, found: number): string {
  if (!swept) {
    return (
      `No posts came back for "${niche}" on ${platform}, so there is nothing to count tags in. ` +
      "That is a coverage gap here, not evidence the niche is untagged — say so rather than " +
      "reporting an empty answer as a finding."
    );
  }
  return (
    `Counted across ${swept} recent ${platform} post${swept === 1 ? "" : "s"} matching "${niche}" — ` +
    `${found} tag${found === 1 ? "" : "s"} used by more than one of them, ranked by how many posts ` +
    "carry each. " +
    "This is a sample of one search, not a trend board: there is no rising/cooling signal here " +
    "because there is no earlier sample to compare against, and only TikTok has a real one. " +
    `With ${swept} posts, treat the tail of this list as noise, and say so instead of ranking it ` +
    "confidently. The `example` on each tag is a post that used it, so any claim you make about a " +
    "tag can be checked against a real post rather than taken from the count."
  );
}
