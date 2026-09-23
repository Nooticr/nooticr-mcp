/**
 * A compact rendering of a payload's evidence, for the channel that gets the
 * text blocks.
 *
 * ## Why this exists
 *
 * There are two channels out of a tool call and no host delivers both to the
 * model:
 *
 * | | `content` text blocks | `structuredContent` |
 * |---|---|---|
 * | Claude Code | dropped when `structuredContent` is present | delivered, serialised |
 * | Claude.ai, tool with a UI view | delivered | routed to the widget |
 *
 * #44 found the first column and #51 fixed it, by writing the guidance into
 * both channels. The evidence never got the same treatment, so it survived
 * Claude Code and vanished on Claude.ai — where a real session received
 * "3 posts that might be someone describing ...", instructions to quote lines
 * from them and report their permalinks, and not one post (#59).
 *
 * The tools most affected were the composed ones, which replace the backend's
 * text block with their own guidance. That guidance is deictic — "Here are 4
 * comments", "2 creators", "8 runs" — so it counts and describes material that
 * is somewhere else. "Here are 4 comments" is a false sentence in the channel
 * it is written in.
 *
 * So: each channel has to be self-sufficient. This renders the evidence for
 * the text one.
 *
 * ## What it is not
 *
 * Not the serialised payload. A model asked to judge posts needs the caption,
 * the handle and the link; it does not need `engagementRate` to four decimal
 * places, and 14 KB of JSON in a text block crowds out the guidance that says
 * what to do with it. Each shape below renders the fields its guidance
 * actually names.
 */

/** Per-item text budget. Long enough for a real Reddit complaint, short enough that twenty fit. */
const ITEM_CHARS = 600;

/**
 * Whole-digest budget.
 *
 * `answer_my_audience` can carry 14 KB of payload. The cap is what keeps a
 * text block readable rather than a second serialisation of it — and when it
 * bites, the digest says so, because a model reasoning over 20 of 60 comments
 * has to know it has 20.
 */
const DIGEST_CHARS = 6000;

/** How many items of one kind are worth rendering before the count matters more than the detail. */
const MAX_ITEMS = 25;

type Row = Record<string, unknown>;

/**
 * What one rendering may spend, and whether it had to clip anything.
 *
 * The caps above are right for most calls and wrong for one: a user who asked
 * for "what people actually said, verbatim" got ellipses on text they paid to
 * fetch (#98). `verbatim` lifts every cap for that call instead of raising
 * them for all, and `clipped` is what lets the digest say so when it did cut.
 */
interface Budget {
  item: number;
  reply: number;
  replies: number;
  field: number;
  digest: number;
  items: number;
  clipped: boolean;
}

function budget(verbatim: boolean): Budget {
  return verbatim
    ? { item: 20_000, reply: 20_000, replies: 1_000, field: 4_000, digest: 200_000, items: 500, clipped: false }
    : { item: ITEM_CHARS, reply: 240, replies: 4, field: 160, digest: DIGEST_CHARS, items: MAX_ITEMS, clipped: false };
}

export interface DigestOptions {
  /** Render every row whole, for quoting. Longer, and only when asked for. */
  verbatim?: boolean;
  /**
   * How to get what the digest left out, e.g. `call analyze_comments again with
   * verbatim: true`. Named in every truncation note, because "(3 more)" that
   * points nowhere is a dead end for the model reading it.
   */
  recover?: string;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function clamp(text: string, max: number, b?: Budget): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  if (b) b.clipped = true;
  return `${flat.slice(0, max - 1)}…`;
}

/**
 * The picture to embed beside a row, proxied where one exists (#91).
 *
 * A report writer on a host that renders the view gets only this text block,
 * so without it the model had the review text and the price and no picture
 * to put next to them. The proxy URL comes first for the reason
 * `normaliseProducts` gives: the raw CDN link is signed, short-lived and
 * Referer-gated, so pasted into a document it dies within the hour.
 */
function media(row: Row): string {
  for (const k of ["thumbnailProxyUrl", "imageProxyUrl", "image", "coverProxyUrl", "thumbnailUrl", "coverUrl"]) {
    const v = row[k];
    if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
  }
  return "";
}

/** `12.3k`, because a raw 12345 beside four other numbers is harder to read than it looks. */
function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function stats(row: Row): string {
  const parts: string[] = [];
  const views = num(row.views);
  const likes = num(row.likes);
  const comments = num(row.comments);
  if (views) parts.push(`${compactCount(views)} views`);
  if (likes) parts.push(`${compactCount(likes)} likes`);
  if (comments) parts.push(`${compactCount(comments)} comments`);
  return parts.join(", ");
}

/**
 * One post, as a line a model can cite.
 *
 * `externalUrl` is not decoration: `find_people_with_problem`'s guidance asks
 * for qualifying posts to be reported "with their permalink, so they can
 * actually be replied to". A digest without links cannot answer that.
 */
function postLine(row: Row, b: Budget): string {
  const head = [
    str(row.platform) || null,
    str(row.creatorHandle) ? `@${str(row.creatorHandle)}` : null,
    str(row.subreddit) || null,
    str(row.foundBy) ? `found by: ${str(row.foundBy)}` : null,
    stats(row) || null,
  ]
    .filter(Boolean)
    .join(" · ");
  const text = clamp(str(row.caption) || str(row.title) || str(row.text), b.item, b);
  const url = str(row.externalUrl) || str(row.url);
  const picture = media(row);
  // Replies under the post, when something opened it. Nested one level down,
  // which is exactly where #59 could come back without the chain-map gate
  // noticing: `posts` is rendered, so the check is satisfied while the thing
  // that was paid for — the comment that says "same here, this is my problem"
  // — stays in the payload only.
  const replies = Array.isArray(row.commentSample) ? (row.commentSample as Row[]) : [];
  const shown = replies.slice(0, b.replies).map((c) => `    - ${clamp(commentLine(c, b), b.reply, b)}`);
  if (replies.length > shown.length) {
    b.clipped = true;
    shown.push(`    - (${replies.length - shown.length} more under this post)`);
  }
  const readNothing =
    row.commentsRead === 0 ? "    - (this thread would not open — not that nobody replied)" : "";
  return [head && `[${head}]`, text, url, picture && `image: ${picture}`, ...shown, readNothing]
    .filter(Boolean)
    .join("\n  ");
}

/**
 * One comment, with its id.
 *
 * The id is the load-bearing field: `analyze_comments` asks for a
 * classification per comment and `show_comment_review` takes those ids back.
 * A digest that renders the text and drops the id breaks the next call.
 */
function commentLine(row: Row, b: Budget): string {
  const id = str(row.id);
  const who = str(row.author) || str(row.username);
  const likes = num(row.likes);
  const head = [id || null, who ? `@${who}` : null, likes ? `${compactCount(likes)} likes` : null]
    .filter(Boolean)
    .join(" · ");
  return [head && `[${head}]`, clamp(str(row.text) || str(row.comment), b.item, b)].filter(Boolean).join("\n  ");
}

function creatorLine(row: Row, b: Budget): string {
  const head = [
    str(row.username) ? `@${str(row.username)}` : str(row.handle) ? `@${str(row.handle)}` : null,
    str(row.platform) || null,
    num(row.followers) ? `${compactCount(num(row.followers) as number)} followers` : null,
    str(row.foundBy) ? `found by: ${str(row.foundBy)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const why = clamp(str(row.why) || str(row.bio) || str(row.verdict), b.item, b);
  const links = Array.isArray(row.links)
    ? (row.links as Row[])
        .map((l) => str(l.url))
        .filter(Boolean)
        .slice(0, 3)
        .join(" ")
    : "";
  return [head && `[${head}]`, why, links].filter(Boolean).join("\n  ");
}

function runLine(row: Row): string {
  const when = str(row.ranAt).slice(0, 10);
  const found = num(row.found);
  const reported = num(row.reported);
  return `${when || "(undated)"} · found ${found ?? "?"} · reported ${reported ?? "?"}`;
}

/**
 * One marketplace listing, with its picture (#91).
 *
 * Products used to fall to `genericLine`, whose first eight scalar fields ran
 * out before `image` — so the one listing field a report most wants to embed
 * never reached the model.
 */
function productLine(row: Row, b: Budget): string {
  const rating = num(row.rating);
  const count = num(row.ratingCount);
  const head = [
    str(row.asin) || null,
    str(row.brand) || null,
    str(row.price) || null,
    rating != null ? `${rating}★${count ? ` from ${compactCount(count)} ratings` : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const picture = media(row);
  return [head && `[${head}]`, clamp(str(row.title), b.item, b), str(row.url), picture && `image: ${picture}`]
    .filter(Boolean)
    .join("\n  ");
}

/** Everything with no shape of its own: the short scalar fields, in order. */
function genericLine(row: Row, b: Budget): string {
  const pairs = Object.entries(row)
    .filter(([, v]) => typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    .map(([k, v]) => `${k}: ${clamp(String(v), b.field, b)}`)
    .slice(0, 8);
  return pairs.join(" · ");
}

/**
 * The evidence keys worth rendering, and how.
 *
 * Ordered: when a payload carries several, the first is the one the guidance
 * is most likely to be about.
 */
const SHAPES: Array<{ key: string; label: string; line: (row: Row, b: Budget) => string }> = [
  { key: "posts", label: "post", line: postLine },
  { key: "products", label: "listing", line: productLine },
  // The baseline a post is scored against, and the asks a niche sweep found.
  // Both are posts in all but name, and both are the material their tool's
  // guidance reasons over — `why_did_this_underperform` cannot say "this is an
  // ordinary result" without the distribution it is ordinary against.
  { key: "window", label: "post in the baseline window", line: postLine },
  { key: "demand", label: "thing the audience asked for", line: postLine },
  { key: "supply", label: "post already serving it", line: postLine },
  { key: "comments", label: "comment", line: commentLine },
  { key: "replies", label: "reply", line: commentLine },
  { key: "mentions", label: "mention", line: commentLine },
  { key: "creators", label: "creator", line: creatorLine },
  { key: "candidates", label: "candidate", line: creatorLine },
  { key: "runs", label: "run", line: runLine },
  { key: "cues", label: "line", line: genericLine },
  { key: "segments", label: "segment", line: genericLine },
  { key: "hashtags", label: "hashtag", line: genericLine },
  { key: "sounds", label: "sound", line: genericLine },
  { key: "watches", label: "watch", line: genericLine },
  { key: "apps", label: "app", line: genericLine },
  { key: "connections", label: "connection", line: genericLine },
  { key: "unavailable", label: "network that could not be searched", line: genericLine },
];

/**
 * Render whatever evidence a payload carries, or "" when it carries none.
 *
 * Returning "" rather than a placeholder matters: a tool whose result is a
 * verdict rather than material (`show_*`, a state mutation) should get its
 * guidance and nothing appended.
 */
/** Fields that identify a row — the ones a caller would cite it by. */
const IDENTIFYING = [
  "id",
  "externalUrl",
  "url",
  "permalink",
  "caption",
  "text",
  "title",
  "username",
  "handle",
  "creatorHandle",
  "name",
  "term",
  "appId",
  "ranAt",
  "tag",
];

/**
 * Any array of objects the named shapes did not claim.
 *
 * A hand-maintained list of keys is exactly the artefact that drifts — a tool
 * adds `window` or `demand`, nobody updates the list, and the material goes
 * missing again with every test still green. So anything that looks like a row
 * with an identity gets rendered, well or plainly, rather than dropped.
 */
function unclaimedShapes(payload: Record<string, unknown>) {
  const named = new Set(SHAPES.map((s) => s.key));
  return Object.entries(payload)
    .filter(([key, rows]) => {
      if (named.has(key) || !Array.isArray(rows) || rows.length === 0) return false;
      const first = rows.find((r) => r && typeof r === "object");
      if (!first) return false;
      return IDENTIFYING.some((f) => {
        const v = (first as Row)[f];
        return typeof v === "string" || typeof v === "number";
      });
    })
    .map(([key]) => ({ key, label: key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase(), line: genericLine }));
}

export function evidenceDigest(payload: Record<string, unknown>, opts: DigestOptions = {}): string {
  const blocks: string[] = [];
  let spent = 0;
  const b = budget(opts.verbatim === true);
  const elsewhere = opts.recover
    ? `the rest are in the structured payload and in the view; to read them here, ${opts.recover}`
    : "the rest are in the structured payload and in the view";

  for (const shape of [...SHAPES, ...unclaimedShapes(payload)]) {
    const rows = payload[shape.key];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    if (spent >= b.digest) break;

    const shown: string[] = [];
    for (const row of rows.slice(0, b.items)) {
      if (spent >= b.digest) break;
      const line = shape.line((row ?? {}) as Row, b);
      if (!line.trim()) continue;
      shown.push(line);
      spent += line.length;
    }
    if (!shown.length) continue;

    // Say what was left out. A model reasoning over 20 of 60 has to know it
    // has 20 — a digest that silently truncates turns "here is everything" into
    // a claim the caller cannot check.
    const total = rows.length;
    const plural =
      total === 1 || shape.label.endsWith("s") ? shape.label : `${shape.label}s`;
    const header =
      shown.length < total
        ? `${shown.length} of ${total} ${plural} (${elsewhere}):`
        : `${total} ${plural}:`;
    blocks.push([header, ...shown.map((l, i) => `${i + 1}. ${l}`)].join("\n"));
  }

  // A clipped item ends in "…", which a model can miss and then quote as if
  // whole. Said once, with the way to get the full text when there is one.
  if (b.clipped && blocks.length) {
    blocks.push(
      opts.recover
        ? `Some text above was shortened (it ends in "…"). Do not quote a shortened line as complete; to get every item whole, ${opts.recover}.`
        : `Some text above was shortened (it ends in "…"). Do not quote a shortened line as complete.`,
    );
  }

  return blocks.join("\n\n");
}

/**
 * Guidance and evidence in one text block, in the order a reader needs them.
 *
 * Guidance first: it is the instruction, and a model that reads the material
 * before knowing what it is for reads it twice.
 */
export function withEvidence(guidance: string, payload: Record<string, unknown>, opts: DigestOptions = {}): string {
  const digest = evidenceDigest(payload, opts);
  return digest ? `${guidance}\n\n---\n\n${digest}` : guidance;
}
