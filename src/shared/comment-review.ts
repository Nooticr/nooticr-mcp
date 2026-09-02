/**
 * Comment analysis done by the model that called us, rather than by Gemini.
 *
 * ## Why
 *
 * `analyze_comments` fetches a comment section, sends it to Gemini, and returns
 * Gemini's opinion. That costs 6 credits, takes a round trip to a third party,
 * and dies when that third party declines — measured: `Gemini text 403
 * Forbidden` while `get_post_comments` returned the same post's comments fine.
 *
 * The reasoning itself is not the hard part. It is text over text, and the
 * model already holding the conversation is better at it than Gemini Flash and
 * costs us nothing. What we are actually selling is the fetch: the upstream
 * call is where the money goes.
 *
 * So evidence mode returns the comments and gets out of the way. It is the
 * same upstream call `get_post_comments` makes, priced the same, with the
 * material laid out for analysis and an explicit account of what to produce.
 *
 * ## Why the caller is told what to produce
 *
 * A model asked to "analyse these comments" writes prose. Prose cannot be
 * rendered as chips, filtered, or counted. Naming the shape turns the answer
 * into something `show_comment_review` can draw and a person can sort — and it
 * makes two runs comparable, which free-form prose never is.
 *
 * ## Why this taxonomy
 *
 * Every category here is something a comment section actually contains and a
 * reader would act on differently: a bug report goes to engineering, a request
 * goes to the content calendar, a comparison goes to positioning. Categories
 * that would need information the comment does not carry — "churn risk",
 * "purchase intent" — are deliberately absent. This is the classification I
 * would not invent from keywords server-side, and the reason it is possible
 * now is that a model is reading the words rather than matching them.
 */

/** What a comment is doing, as opposed to how it feels. */
export const COMMENT_CATEGORIES = [
  "praise",
  "complaint",
  "bug_report",
  "question",
  "request",
  "comparison",
  "spam",
  "other",
] as const;

export const COMMENT_SENTIMENTS = ["positive", "neutral", "negative", "mixed"] as const;

export type CommentCategory = (typeof COMMENT_CATEGORIES)[number];
export type CommentSentiment = (typeof COMMENT_SENTIMENTS)[number];

/** One comment, laid out for reading rather than for rendering. */
export interface EvidenceComment {
  id: string;
  text: string;
  author: string;
  likes: number;
}

/**
 * A stable, addressable id per comment.
 *
 * The model's classification has to point back at a specific comment, and the
 * upstream payload carries no id of its own. Same shape `search_mentions`
 * mints, so anything downstream handles both the same way.
 */
export function commentId(url: string, index: number): string {
  return `comment:${postSlug(url)}:${index}`;
}

/**
 * The part of a URL that identifies the post.
 *
 * Not simply the last path segment: YouTube keeps the video id in `?v=`, so
 * every video on the platform reduced to "watch" and ids collided across
 * posts — `comment:watch:0` meant a different comment depending on which video
 * you had just fetched. Observed live before this existed.
 */
export function postSlug(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "post";
  }
  const v = parsed.searchParams.get("v");
  if (v) return v;
  const segments = parsed.pathname.split("/").filter(Boolean);
  // Reddit permalinks end in a title slug; the id sits one before it.
  const last = segments[segments.length - 1] || "";
  return last || segments[segments.length - 2] || parsed.hostname || "post";
}

/** Normalise whatever the backend returned into the evidence shape. */
export function toEvidence(url: string, comments: unknown): EvidenceComment[] {
  if (!Array.isArray(comments)) return [];
  return comments
    .map((raw, i) => {
      const c = (raw ?? {}) as Record<string, unknown>;
      const text = String(c.text ?? "").trim();
      if (!text) return null;
      return {
        id: commentId(url, i),
        text,
        author: String(c.author ?? c.username ?? "").replace(/^@/, ""),
        likes: Number(c.likes ?? 0) || 0,
      };
    })
    .filter((c): c is EvidenceComment => c !== null);
}

/**
 * What the caller is asked to produce.
 *
 * Written as an instruction to the reading model rather than as documentation,
 * because that is what it is — this text lands in the model's context as part
 * of a tool result and is the only steering it gets.
 */
export function reviewGuidance(url: string, count: number): string {
  return [
    `Here are ${count} comments from ${url}, unanalysed.`,
    "",
    "Read them and classify each one. For every comment give:",
    `  sentiment — one of: ${COMMENT_SENTIMENTS.join(", ")}`,
    `  category  — one of: ${COMMENT_CATEGORIES.join(", ")}`,
    "      praise: says something worked",
    "      complaint: unhappy, but nothing specific to fix",
    "      bug_report: names something broken, specifically enough to act on",
    "      question: asks something the creator could answer",
    "      request: asks for content, a feature, or a follow-up",
    "      comparison: weighs this against an alternative or competitor",
    "      spam: promotional, automated, or a coordinated repeat",
    "      other: none of the above",
    "",
    "Then summarise across all of them: the recurring themes, the questions",
    "worth answering, the objections raised, and what to make next.",
    "",
    "Judge only from what the comment says. If a comment is ambiguous, use",
    'sentiment "mixed" or category "other" rather than guessing — a confident',
    "wrong label is worse here than an honest vague one.",
    "",
    "To show the result in the conversation as a sortable, filterable view,",
    "call show_comment_review with your classifications. It costs nothing and",
    "makes no further requests.",
  ].join("\n");
}

/**
 * Which network a URL belongs to, for the platform mark on the rendered row.
 *
 * Deliberately small: this only labels a row the caller already gave us, so a
 * miss costs a grey badge, not a failed call. The real resolution lives in the
 * Rust importer, which is the thing that has to be right.
 */
export function platformFromUrl(url: string): string {
  const u = String(url || "").toLowerCase();
  const table: Array<[string, string]> = [
    ["tiktok.com", "tiktok"],
    ["instagram.com", "instagram"],
    ["youtube.com", "youtube"],
    ["youtu.be", "youtube"],
    ["reddit.com", "reddit"],
    ["redd.it", "reddit"],
    ["weibo.c", "weibo"],
    ["douyin.com", "douyin"],
    ["xiaohongshu.com", "xiaohongshu"],
    ["xhslink.com", "xiaohongshu"],
    ["bilibili.com", "bilibili"],
    ["b23.tv", "bilibili"],
    ["linkedin.com", "linkedin"],
    ["twitter.com", "twitter"],
    ["x.com", "twitter"],
  ];
  for (const [needle, platform] of table) if (u.includes(needle)) return platform;
  return "";
}
