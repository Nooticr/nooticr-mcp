/**
 * Output schemas — what a caller gets back, declared.
 *
 * Every tool here already returns structuredContent and none of them said what
 * shape it was, so anything chaining two Nooticr tools had to call one, look at
 * the result, and guess. Declaring the shape is what lets a host validate it
 * and an agent plan against it.
 *
 * These describe rather than constrain, deliberately. The payloads come from
 * the nooticr backend, not from this repo: a field it adds tomorrow must not
 * turn a working call into a hard failure, because the SDK throws on a
 * structuredContent that fails its schema and the user would see a tool that
 * simply stopped working. So every field is optional and every object passes
 * unknown keys through. What is written down is what was measured against the
 * live server — shapes taken from real responses, and from the fields the view
 * itself reads — not what would be tidy.
 */
import { z } from "zod";

/** Loose by construction: see the note above. */
const open = <T extends z.ZodRawShape>(shape: T) => z.object(shape).passthrough();

/**
 * A union branch that renders as its own `type`, instead of being folded into
 * a `type` array with its siblings.
 *
 * `z.union([z.string(), z.number(), z.boolean()])` renders as
 * `{ type: ["string", "number", "boolean"] }`. That is legal JSON Schema and
 * the wrong thing to send: a client that reads `type` as a single string
 * either rejects the tool or drops the constraint, and both failures are
 * invisible from here — a rejected tool just stops appearing in `tools/list`,
 * with no error this repo would ever see. The whole surface emitted 1,286 of
 * them, from this helper and `listOf` alone.
 *
 * The fold happens in zod-to-json-schema's union parser, which collapses a
 * union whose every member is a bare primitive carrying no checks. There are
 * only two ways out, and only one of them is free:
 *
 *   - Give a member a check. `z.number().finite()` renders as plain
 *     `{ type: "number" }` and defeats the fold, but it also stops accepting
 *     `Infinity` — which a ratio-to-baseline division by a zero median really
 *     does produce, and which this file exists to keep from turning a working
 *     call into a hard failure. Rejected for that reason, not on taste.
 *   - Give a member a wrapper whose type name is not a primitive.
 *     `.readonly()` is the one that costs nothing: on a primitive it is a
 *     runtime no-op (`Object.freeze` of a string is that string), the parsed
 *     value is discarded by the SDK's output validation anyway, and
 *     `Readonly<string>` is `string`, so nothing downstream sees a new type.
 *     It also happens to be true — these are output schemas.
 *
 * So the wrapper is load-bearing and is not about readonly-ness. Removing it
 * silently reintroduces all 1,286, which is what
 * `tests/output-schema-shape.test.ts` is there to catch.
 */
const oneType = <T extends z.ZodTypeAny>(branch: T) => branch.readonly();

/**
 * "This type, or null" — as `anyOf`, not as a two-element `type` array.
 *
 * `z.number().nullish()` renders as `{ type: ["number", "null"] }`, which is
 * the same portability problem as `scalar()` in miniature. The three inline
 * output schemas in `watchlist.ts` contributed 5 of the 1,286 this way, and
 * they are the reason this is exported rather than kept private: a tool that
 * declares its schema inline should not have to re-derive why.
 */
export const orNull = <T extends z.ZodTypeAny>(inner: T) =>
  z.union([oneType(inner), z.null()]).optional();

/**
 * One scalar type for every leaf, and it accepts null.
 *
 * The first version of this file typed each leaf from a sampled response —
 * duration a number, videoUrl a string — with `.optional()`, which accepts
 * `undefined` and rejects `null`. A slideshow post carries `videoUrl: null` and
 * no duration, so discover_social_posts started failing outright the moment a
 * feed contained one. Not "returned less": the SDK throws on a structuredContent
 * that fails its schema, so the whole call errored.
 *
 * The lesson is not "add null" — it is that asserting a wire type for a field
 * scraped from eight platforms is a liability that buys almost nothing. What an
 * agent needs from this file is which keys exist and what they mean. So the
 * keys and their descriptions are the contract, and the types are deliberately
 * as wide as the data can be.
 *
 * Which is why the branches are wrapped in `oneType()` and null is a member of
 * the union rather than a `.nullish()` around it. Both exist to control the
 * JSON Schema this renders as, and neither changes what the schema accepts —
 * see `oneType` below.
 */
const scalar = () => z.union([oneType(z.string()), oneType(z.number()), oneType(z.boolean()), z.null()]).optional();
/** Same reasoning for lists: a null list, and a null element, must both pass. */
const listOf = <T extends z.ZodTypeAny>(item: T) => z.array(z.union([oneType(item), z.null()])).nullish();
/**
 * A list whose elements are not one shape — themes, fixes, failures.
 *
 * Not `anyList()`. Zod is only half of this: the server validates
 * with Zod, but the client validates against the JSON Schema generated from
 * it, and `z.unknown()` inside a union serialises to an empty schema that the
 * converter drops — leaving `anyOf: [{ type: "null" }]`, an items rule that
 * accepts null and nothing else. Every call carrying a real theme then failed
 * on the client while passing every server-side test. `z.any()` renders as an
 * empty schema in item position, which accepts anything, which is the point.
 */
const anyList = () => z.array(z.any()).nullish();

/**
 * "An object whose contents we are not constraining" — for input schemas.
 *
 * Exported from a file about output schemas because the concern is the same
 * one documented above: what a zod type renders as on the wire. The natural
 * spelling, `z.record(z.unknown())`, renders as
 * `{ type: "object", additionalProperties: {} }`, and that `{}` carries no
 * validation keyword at all — the object-literal spelling of a bare `true`,
 * which reads to a strict client as an unvalidated schema rather than a
 * deliberately open one. `z.object({}).passthrough()` accepts exactly the same
 * values and says `additionalProperties: true`, which is the same permission
 * stated in a keyword rather than by omission.
 *
 * The array counterpart needs no helper: `z.array(z.unknown())` emits
 * `items: {}` for the same reason, and `z.array(z.any())` simply omits `items`.
 */
export const anyObject = () => z.object({}).passthrough();

/** Every paid tool reports what it charged. */
const mcpCredits = open({
  cost: scalar().describe("Credits this call consumed."),
  adminBypass: scalar(),
  balance: scalar(),
}).nullish();

/** The post object every feed, comparison and single-post tool returns. */
const post = open({
  id: scalar(),
  // The goal tools in jobs.ts attach an addressable id beside the platform's
  // own rather than over it, so a caller keeps the value it needs to dedupe
  // against its own records. Absent on the tools that do not address posts,
  // which is why it is documented here rather than made required.
  postId: scalar().describe("Addressable — `post:<platform>:<slug>`. Quote this one back."),
  platform: scalar(),
  contentType: scalar().describe("video, image, carousel or slideshow."),
  detectedFormat: scalar(),
  title: scalar(),
  caption: scalar(),
  creatorHandle: scalar(),
  externalUrl: scalar().describe("Permalink — the URL to feed back into another tool."),
  embedUrl: scalar(),
  duration: scalar(),
  views: scalar(),
  likes: scalar(),
  comments: scalar(),
  shares: scalar(),
  engagementRate: scalar(),
  hashtags: listOf(z.string()),
  // Media comes in threes: the platform URL, an nooticr proxy, and a resolver
  // that re-fetches when a signed link has expired.
  videoUrl: scalar(),
  videoProxyUrl: scalar(),
  videoFallbackUrl: scalar(),
  thumbnailUrl: scalar(),
  thumbnailProxyUrl: scalar(),
  thumbnailFallbackUrl: scalar(),
  musicUrl: scalar(),
  musicProxyUrl: scalar(),
  musicFallbackUrl: scalar(),
  musicTitle: scalar(),
  musicAuthor: scalar(),
  mediaItems: listOf(open({})),
});

/**
 * One link found in a creator's bio, typed so a host knows what opening it buys.
 *
 * `opaque` is the one a caller must not ignore: a shortener's destination is
 * unknowable from the URL and changeable after we read it.
 */
const bioLink = open({
  url: scalar(),
  host: scalar(),
  kind: scalar().describe("code, video, social, writing, shop, link_hub, shortener or website."),
  readable: scalar().describe("What opening it will actually tell you."),
  opaque: scalar().describe("True when the destination cannot be known from the URL."),
});

const creator = open({
  username: scalar(),
  nickname: scalar(),
  platform: scalar(),
  followers: scalar(),
  signature: scalar(),
  verified: scalar(),
  avatarUrl: scalar(),
  externalUrl: scalar(),
});

/** The prose blocks an AI tool returns; keys vary by tool, so keep it open. */
const analysis = open({
  summary: scalar(),
  hookStrength: scalar(),
  whyItWorks: scalar(),
  viralTriggers: listOf(z.string()),
  keyQuotes: listOf(z.string()),
  variationIdeas: listOf(z.string()),
  suggestedHook: scalar(),
  suggestedHashtags: listOf(z.string()),
  niche: scalar(),
}).nullish();

/**
 * What every tool that returns material rather than a conclusion adds: the
 * marker, what it fetched, and where it came from. Optional throughout,
 * because the shape of the material itself differs per tool.
 */
/**
 * What to do with the material, carried where a host will actually deliver it.
 *
 * Every tool that returns guidance puts the same string in a `content` text
 * block too. That block is the one the MCP spec points at and the one hosts
 * drop: a host rendering `structuredContent` replaces the text blocks with the
 * serialised JSON, so the text copy reaches no model. Declared here rather than
 * left to `passthrough()` because a host reading the schema should be able to
 * see that the field exists.
 */
const guidance = scalar().describe(
  "What to do with this payload, in prose. Read it: it is the instruction, not a summary.",
);

const evidence = {
  guidance,
  mode: scalar().describe('Always "evidence": this payload is material you have still to read.'),
  tool: scalar(),
  evidenceFrom: listOf(z.string()).describe("The cheap calls this was assembled from."),
  frameIndex: anyList().describe("Where each returned frame sits in the video."),
  get_post_transcript: open({}).nullish(),
  get_social_media: open({}).nullish(),
};

const feed = { platform: scalar(), posts: listOf(post), mcpCredits };
const singlePost = { post: post.nullish(), platform: scalar(), url: scalar(), mcpCredits };
const analyzed = { ...singlePost, analysis, analyzed: scalar() };

/**
 * One entry per tool. A tool missing from here declares nothing, which is the
 * honest option when the shape has not been checked against a real response.
 */
/**
 * One Amazon listing, as the scan hands it over.
 *
 * `aspects` and `reviewSummary` are Amazon's own, not ours, and they are the
 * half of a listing that survives the sign-in gate which withholds review
 * bodies — so they are declared beside `reviews` rather than folded into it.
 */
const amazonProduct = open({
  asin: scalar(),
  url: scalar(),
  title: scalar(),
  brand: scalar(),
  price: scalar(),
  priceValue: scalar(),
  listPrice: scalar(),
  availability: scalar(),
  rating: scalar(),
  ratingCount: scalar(),
  image: scalar(),
  images: listOf(z.string()),
  features: listOf(z.string()),
  categories: listOf(z.string()),
  specs: open({}).nullish(),
  ratingHistogram: open({}).nullish().describe("Star bucket to share, e.g. {\"5\": \"73%\"}."),
  reviewSummary: scalar().describe("Amazon's own digest of the reviews."),
  aspects: listOf(open({ name: scalar(), mentions: scalar(), sentiment: scalar() })),
  reviewsGated: scalar().describe("True when Amazon withheld the review bodies behind sign-in."),
  reviews: anyList(),
});

/** One thing you concluded, with what it rests on. */
const amazonFinding = open({
  label: scalar(),
  detail: scalar(),
  evidence: listOf(z.string()).describe("Review ids or short quotes."),
  strength: scalar().describe("strong / moderate / thin — how well the collected text supports it."),
});

const amazonScanShape = {
  guidance: scalar(),
  mode: scalar(),
  marketplace: scalar(),
  scanId: scalar().describe("Pass to amazon_scan_status to pick a running collection back up."),
  status: scalar(),
  complete: scalar().describe("False means more listings are still coming."),
  query: scalar(),
  domain: scalar(),
  progress: open({
    done: scalar(),
    total: scalar(),
    message: scalar(),
    elapsedMs: scalar(),
    fromCache: scalar(),
  }).nullish(),
  rollup: open({}).nullish().describe("The arithmetic over the set: price and rating spread, aspects by brand, 1-2 star share."),
  products: listOf(amazonProduct),
  reviews: anyList().describe("Every review across the scan, worst-rated first — the barriers are the half a summary drops."),
  errors: anyList(),
  mcpCredits,
};

const amazonScan = open(amazonScanShape);

export const OUTPUT_SCHEMAS = {
  analyze_post: open({ ...analyzed, ...evidence }),
  analyze_post_fast: open({ ...evidence, ...analyzed }),
  understand_social_post: open({ ...analyzed, ...evidence }),
  // No `provider`: the field named the upstream supplier and is no longer
  // returned. Documenting a field that does not exist is worse than omitting it.
  get_social_media: open({ ...singlePost, fetchedAt: scalar() }),

  discover_social_posts: open(feed),
  /**
   * Brand monitoring. The unit is a *comment* that names the term, grouped
   * under the post it was left on — a brand is mentioned far more often in the
   * replies than in a caption, and the same post can carry several mentions.
   */
  search_mentions: open({
    term: scalar(),
    searched: listOf(z.string()).describe("Platforms actually queried."),
    since: scalar().describe("The date window applied, if any."),
    totalMentions: scalar().describe("Comments naming the term, across every group."),
    totalThreads: scalar().describe("Posts carrying at least one mention."),
    byPlatform: open({}).nullish().describe("Mentions per platform."),
    threads: listOf(
      open({
        post: post.nullish(),
        postIsAboutTerm: scalar().describe("True when the post itself names the term, not just its comments."),
        postHits: scalar(),
        mentionCount: scalar(),
        mentions: listOf(
          open({
            id: scalar().describe("Addressable — pass it to another tool to reply or escalate."),
            text: scalar(),
            username: scalar(),
            avatarUrl: scalar().describe("The commenter's picture, on the platform's own CDN."),
            avatarProxyUrl: scalar().describe("The same picture through nooticr, for a sandboxed view."),
            likes: scalar(),
            replies: scalar().describe("How many people replied to this comment."),
            postedAt: scalar(),
            hits: scalar().describe("How many times this comment names the term."),
          }),
        ),
      }),
    ).describe("Mentions grouped under the post they were left on, loudest conversation first."),
    posts: listOf(post).describe("The posts of this page, flattened for the card view."),
    offset: scalar(),
    nextOffset: scalar().describe("Pass back as `offset` to load the next page; null when done."),
    hasMore: scalar(),
    creditsCharged: scalar(),
    unavailable: anyList().describe("Platforms that could not answer, with the reason."),
    mcpCredits,
  }),
  get_user_posts: open({ ...feed, username: scalar() }),

  /** Frames a caller looks at itself. The pixels ride in the content blocks. */
  // What the frames COVER matters as much as the frames: a model that does not
  // know shots were dropped will describe the video as if it saw all of it.
  get_post_frames: open({
    url: scalar(),
    platform: scalar(),
    contentType: scalar(),
    durationSeconds: scalar(),
    frameCount: scalar(),
    frames: anyList().describe("Base64 frames; also delivered as image content blocks."),
    selection: scalar().describe(
      "'scene' (one frame per distinct shot), 'even' (fixed interval) or 'images' (a carousel's own pictures).",
    ),
    scenesDetected: scalar().describe(
      "Distinct shots found. Null when no scan ran, which is not the same as zero.",
    ),
    truncated: scalar().describe("True when shots were found that are not in `frames`."),
    scannedSeconds: scalar(),
    scanComplete: scalar().describe("False when a bound stopped the read before the video ended."),
    coverageNote: scalar().describe(
      "The above as one sentence, including that a still cannot show motion within a shot.",
    ),
    post: post.nullish(),
    mcpCredits,
  }),

  analyze_creator_profile: open({
    ...evidence,
    creator: creator.nullish(),
    posts: listOf(post),
    profile: open({}).nullish(),
    analysis,
    mcpCredits,
  }),
  search_creators: open({ creators: listOf(creator), platform: scalar(), mcpCredits }),
  get_similar_creators: open({ creators: listOf(creator), platform: scalar(), mcpCredits }),
  find_hook_pattern: open({
    ...evidence,
    report: open({}).nullish(),
    username: scalar(),
    platform: scalar(),
    postsAnalyzed: scalar(),
    mcpCredits,
  }),

  get_post_comments: open({
    comments: listOf(open({ text: scalar(), author: scalar(), likes: scalar() })).optional(),
    themes: anyList(),
    summary: scalar(),
    url: scalar(),
    platform: scalar(),
    mcpCredits,
  }),
  /**
   * The comments themselves, with the reading left to the caller. `summary`
   * and `report` are what the synthesis used to fill in; they are kept and
   * left optional because the schema is passthrough and a caller that stored
   * one should not find the key gone.
   */
  analyze_comments: open({
    guidance,
    summary: scalar(),
    themes: anyList(),
    commentsAnalyzed: scalar(),
    report: open({}).nullish(),
    mode: scalar().describe('Always "evidence": the comments come back unanalysed.'),
    url: scalar(),
    platform: scalar(),
    commentCount: scalar(),
    comments: listOf(
      open({
        id: scalar().describe("Addressable — pass it back to show_comment_review."),
        text: scalar(),
        author: scalar(),
        likes: scalar(),
      }),
    ).describe("The comments, unanalysed, each with an id you can pass back."),
    mcpCredits,
  }),

  /** What the caller concluded, drawn. Nothing here was fetched. */
  /**
   * What another server needs to file one of these, per item.
   *
   * `body` is the load-bearing field and the reason the shape is pinned: it
   * carries the quote fenced and framed as a third-party report, and a caller
   * that rebuilds it from `title` + the original comment loses exactly that.
   */
  prepare_handoff: open({
    handoff: scalar(),
    destination: scalar().describe("github, jira, linear or generic."),
    totalMentions: scalar().describe("Items prepared."),
    worthFiling: scalar().describe("How many are a kind a tracker is the right home for."),
    withWarnings: scalar(),
    nextStep: scalar().describe("How to file these on the other server."),
    items: listOf(
      open({
        sourceId: scalar().describe("The evidence tool's id — what makes the issue traceable."),
        kind: scalar(),
        title: scalar().describe("Ready to use as the issue title."),
        body: scalar().describe("Ready to use as the issue body. File it unmodified."),
        labels: listOf(z.string()),
        sourceUrl: scalar().describe("Permalink, or null when the network gives none."),
        dedupeKey: scalar().describe("The marker written into the body, so a second run can find it."),
        searchFirst: scalar().describe("Search the tracker for this before filing."),
        worthFiling: scalar(),
        warnings: listOf(
          open({
            code: scalar(),
            detail: scalar().describe("What to know before this is filed."),
          }),
        ),
      }),
    ),
    term: scalar(),
    threads: anyList(),
  }),

  /** The vetted shortlist, ranked, with the scores attributed to the caller. */
  show_collab_shortlist: open({
    shortlist: scalar(),
    niche: scalar(),
    platform: scalar(),
    summary: scalar(),
    question: scalar().describe("What the user is being asked to decide."),
    recommended: scalar().describe("The candidate id to approach first, if the caller had a view."),
    scoredCount: scalar(),
    unverifiedCount: scalar().describe("Candidates scored without anything having been opened."),
    creators: listOf(
      creator.extend({
        id: scalar(),
        rank: scalar(),
        score: scalar().describe("The calling model's score out of 100 — not a nooticr rating."),
        scoredBy: scalar().describe('Always "the assistant", so the card can attribute it.'),
        verdict: scalar().describe("approach, maybe or pass."),
        why: scalar(),
        checked: listOf(z.string()).describe("What was actually opened and read."),
        concerns: listOf(z.string()),
        unverifiedScore: scalar().describe("True when nothing was opened to reach the score."),
      }),
    ),
    audienceOverlap: open({
      attempted: scalar(),
      reason: scalar(),
      howTo: scalar(),
    }).nullish(),
  }),

  show_comment_review: open({
    review: scalar(),
    term: scalar(),
    url: scalar(),
    summary: scalar(),
    totalMentions: scalar(),
    byCategory: open({}).nullish().describe("How many comments fell into each category."),
    bySentiment: open({}).nullish(),
    themes: listOf(z.string()),
    nextSteps: listOf(z.string()),
    threads: anyList().describe("Shaped like search_mentions so one view renders both."),
    mcpCredits,
  }),

  // The five below close the loop the evidence-only tools open: nooticr
  // fetches material and prices at the fetch, "your own model does the
  // thinking" (README) — but until these existed, the thinking had nowhere
  // to land except chat text. Free, and make no requests, same as
  // show_comment_review: they only draw what they're handed.
  show_compared_posts: open({
    posts: listOf(post).describe("The 2-5 posts being compared, same shape as compare_posts returned."),
    comparison: open({
      winner: scalar().describe("1-indexed position of the post that won, matching the posts array."),
      winnerReason: scalar(),
      differences: listOf(open({ factor: scalar(), detail: scalar() })),
      lessons: listOf(z.string()),
      nextTest: scalar(),
    }).nullish(),
    mcpCredits,
  }),
  show_post_analysis: open({
    url: scalar(),
    post: post.nullish().describe("The post analyze_post/analyze_post_fast/understand_social_post handed back."),
    analysis: open({}).passthrough().nullish().describe(
      "Your own analysis, any of the fields analyze_post's guidance asked for — summary, " +
        "hookStrength, scriptStructure, whyItWorks, suggestedHook, keyQuotes, suggestedHashtags, " +
        "variationIdeas, viralTriggers, targetAudience and more all render if present; every field " +
        "is optional, and none is required to have used all of them."
    ),
    mcpCredits,
  }),
  show_hooks: open({
    url: scalar().describe("The post the hooks were grounded in, if any."),
    topic: scalar().describe("The topic the hooks were grounded in, if given instead of a url."),
    hooks: listOf(
      open({
        hook: scalar().describe("Under 15 words, speakable aloud."),
        mechanism: scalar().describe("e.g. accusation, number, mistake, before/after, receipt, question."),
        why: scalar().describe("Who it stops, and why."),
      })
    ),
    mcpCredits,
  }),
  show_variants: open({
    sourceUrl: scalar(),
    post: post.nullish(),
    variants: listOf(
      open({
        title: scalar().describe("A short label for this variant."),
        hook: scalar(),
        angle: scalar().describe("What changes versus the original."),
        beats: listOf(z.string()).describe("Shot or talking beats, in order."),
        cta: scalar(),
        whyItCouldWork: scalar(),
      })
    ),
    mcpCredits,
  }),
  show_repurposed_post: open({
    sourceUrl: scalar(),
    versions: listOf(open({ surface: scalar().describe("e.g. 'X thread', 'LinkedIn post'."), content: scalar() })),
    mcpCredits,
  }),

  /**
   * The five job tools, and the one view that draws what a model concluded
   * from the first of them.
   *
   * They return evidence rather than an answer, so what is declared here is
   * the material and where it came from: the groups, the ids that address each
   * item, the arithmetic done over the stats, and what could not be fetched.
   * Same rule as everywhere else in this file — the keys and their
   * descriptions are the contract, the types are as wide as the data can be.
   */
  answer_my_audience: open({
    ...evidence,
    /** term + threads is the search_mentions shape, so one view draws both. */
    term: scalar().describe("The creator, as @handle — what the view puts in its header."),
    username: scalar(),
    platform: scalar(),
    since: scalar().describe("The date window asked for, if any."),
    sinceApplied: scalar().describe("False when the platform returned no dates, so the window could not be honoured."),
    postsChecked: scalar().describe("Posts whose comments were actually read."),
    repliesCanBeSent: scalar().describe(
      "Always false. No nooticr connection carries comment-write permission, so the drafts this " +
        "produces are for a person to paste in themselves.",
    ),
    totalMentions: scalar().describe("Comments returned across every group."),
    totalThreads: scalar(),
    wantsReplyCount: scalar().describe("How many carry a reply signal. A sort, not a verdict."),
    byCategory: open({}).nullish().describe("Flagged against unclear, as the view's filter chips."),
    threads: listOf(
      open({
        post: post.nullish(),
        mentionCount: scalar(),
        mentions: listOf(
          open({
            id: scalar().describe(
              "Addressable, and stable across calls — pass it back to show_audience_replies. " +
                "Built from the platform's own comment id, or from a fingerprint of post, " +
                "author and text where there is none. Not the positional scheme " +
                "search_mentions uses, whose ids move when the paging or window changes.",
            ),
            text: scalar(),
            username: scalar(),
            likes: scalar(),
            postedAt: scalar().describe(
              "Null wherever the date could not be believed. Most networks stamp every comment " +
                "with the moment of the fetch, so anything indistinguishable from now is " +
                "dropped rather than repeated as fact.",
            ),
            wantsReply: scalar().describe("True when it reads like a question or a request."),
            signals: listOf(z.string()).describe("Which phrasing test matched, so the flag can be argued with."),
            category: scalar(),
          }),
        ),
      }),
    ).describe("Comments grouped under the post they were left on."),
    posts: listOf(post).describe("The posts of this run, flattened for the card view."),
    unavailable: anyList().describe("Posts whose comments could not be read, with the reason."),
    creditsCharged: scalar(),
    mcpCredits,
  }),

  /** What the caller drafted, drawn. Nothing here was fetched. */
  show_audience_replies: open({
    review: scalar(),
    term: scalar(),
    username: scalar(),
    summary: scalar(),
    totalMentions: scalar(),
    drafted: scalar().describe("How many rows carry an actual draft reply."),
    byCategory: open({}).nullish().describe("How many comments fell to each decision."),
    themes: listOf(z.string()),
    nextSteps: listOf(z.string()),
    threads: anyList().describe("Shaped like search_mentions so one view renders both."),
    mcpCredits,
  }),

  track_creator: open({
    ...evidence,
    username: scalar(),
    platform: scalar(),
    metric: scalar().describe("Which stat everything here is ranked on."),
    window: scalar().describe("Posts in the window actually scored."),
    since: scalar(),
    sinceApplied: scalar(),
    tracked: scalar().describe("True when this creator is on the watchlist, which is what makes a diff possible."),
    lastCheckedAt: scalar().describe("When track_creator last looked, or null on a first look."),
    newSincePreviousCheck: scalar().describe("Posts not seen at the last check; null when there was none."),
    baseline: open({
      count: scalar(),
      median: scalar().describe("The creator's own median — what outperformance is measured against."),
      min: scalar(), max: scalar(), p25: scalar(), p75: scalar(),
    }).nullish().describe("Null when there are too few posts to call anything a baseline."),
    outperformers: listOf(z.string()).describe(
      "postIds of the posts that beat the median by a quarter or more.",
    ),
    posts: listOf(
      open({
        id: scalar().describe("The platform's own id for the post, passed through untouched."),
        postId: scalar().describe("Addressable — `post:<platform>:<slug>`. Quote this one."),
        metricValue: scalar(),
        isNew: scalar().describe("True when it was not there at the last check; null without one."),
        standing: open({
          value: scalar(), median: scalar(),
          ratio: scalar().describe("This post over the creator's median. The number to quote."),
          percentile: scalar(),
          verdict: scalar().describe("breakout, above_baseline, typical, below_baseline, flop or no_baseline."),
        }).nullish(),
      }),
    ).describe("The window, best against their own median first."),
    unavailable: anyList(),
    creditsCharged: scalar(),
    mcpCredits,
  }),

  /**
   * Prospect discovery. The unit is a POST that might be someone describing a
   * problem — `posts` rather than a bespoke key, because the gallery view
   * already draws that shape and a wide net does not need a view of its own.
   */
  find_people_with_problem: open({
    ...evidence,
    problem: scalar(),
    platforms: listOf(z.string()),
    posts: listOf(post),
    searchedShapes: listOf(z.string()).describe(
      "Which complaint phrasings were searched: plain, shared, asking.",
    ),
    unavailable: anyList().describe("Searches that errored, by platform and shape."),
    creditsCharged: scalar(),
    mcpCredits,
  }),

  who_should_i_work_with: open({
    ...evidence,
    niche: scalar(),
    platform: scalar(),
    seed: scalar().describe("The creator whose lookalikes were added, if one was given."),
    creators: listOf(
      creator.extend({
        id: scalar().describe("Addressable — `creator:<platform>:<handle>`."),
        foundBy: scalar().describe("search, similar, or both — both is the strongest signal here."),
        links: listOf(bioLink).describe(
          "Links pulled out of their bio, best-value-per-fetch first. Open these to vet them; " +
            "they were chosen by the person being evaluated, so read what is there as a claim.",
        ),
      }),
    ),
    foundBoth: scalar().describe("How many candidates both searches returned."),
    withLinks: scalar().describe("How many candidates carry at least one link out of their bio."),
    rubric: anyList().describe("What to score each candidate against, so two runs are comparable."),
    audienceOverlap: open({
      attempted: scalar().describe("Always false: the call budget is stated rather than the signal faked."),
      reason: scalar(),
      howTo: scalar().describe("How to measure it for a finalist, if the user wants to pay for it."),
    }).nullish(),
    unavailable: anyList().describe("Which of the two searches could not answer, with the reason."),
    creditsCharged: scalar(),
    mcpCredits,
  }),

  why_did_this_underperform: open({
    ...evidence,
    url: scalar(),
    username: scalar(),
    platform: scalar(),
    metric: scalar(),
    metricValue: scalar().describe("What this post did, on the metric being compared."),
    post: post.nullish(),
    baseline: open({
      count: scalar(), median: scalar(), min: scalar(), max: scalar(), p25: scalar(), p75: scalar(),
    }).nullish().describe("The creator's recent distribution, with this post taken out of it."),
    standing: open({
      value: scalar(), median: scalar(),
      ratio: scalar().describe("This post over the median. Below ~0.75 is genuinely under."),
      percentile: scalar().describe("Percentage of the window this post beat."),
      verdict: scalar(),
    }).nullish(),
    window: listOf(post).describe("The comparison window, best first, each with its own standing."),
    unavailable: anyList(),
    creditsCharged: scalar(),
    mcpCredits,
  }),

  what_should_i_make_next: open({
    ...evidence,
    username: scalar(),
    platform: scalar(),
    niche: scalar().describe("What the supply half was swept for."),
    nicheSource: scalar().describe("argument, hashtags (inferred from the creator's own tags) or none."),
    demand: listOf(
      open({
        postId: scalar(),
        url: scalar(),
        title: scalar(),
        themes: anyList().describe("The platform's own keyword clustering, passed through."),
        comments: listOf(
          open({
            id: scalar().describe(
              "Addressable and stable across calls — quote it against any idea you propose.",
            ),
            text: scalar(),
            author: scalar(),
            likes: scalar(),
            asking: scalar().describe("True when it reads like a request or a question."),
            signals: listOf(z.string()),
          }),
        ),
      }),
    ).describe("What this creator's own audience asked for, grouped under the post."),
    demandComments: scalar(),
    askCount: scalar(),
    supply: listOf(post).describe("What the niche is already making."),
    supplyBaseline: open({}).nullish().describe("The niche's own view distribution — what 'already saturated' means numerically."),
    yourBaseline: open({}).nullish().describe("The creator's own distribution, for what 'big for me' means."),
    posts: listOf(post).describe("The supply sweep, flattened for the card view."),
    unavailable: anyList(),
    creditsCharged: scalar(),
    mcpCredits,
  }),

  /**
   * Brand mentions said out loud rather than typed. Narrows to candidate
   * posts, transcribes the most-viewed survivors up to a hard ceiling, and
   * searches the words — TikTok and YouTube only, and only where the
   * platform actually supplies a caption track. See `search_mentions` above
   * for the text-only sibling this exists beside.
   */
  search_spoken_mentions: open({
    ...evidence,
    term: scalar(),
    platforms: listOf(z.string()).describe("Networks actually checked — tiktok and/or youtube."),
    niche: scalar().describe("The keyword sweep asked for, if any."),
    usernames: listOf(z.string()).describe("Explicit creator handles asked for, if any."),
    watchlistChecked: scalar().describe("Watchlisted creators added by useWatchlist, on tiktok or youtube."),
    candidatesConsidered: scalar().describe("Candidate posts found by the narrowing step, before the ceiling."),
    transcribed: scalar().describe("Transcripts actually fetched — never more than maxTranscripts."),
    transcriptsAvailable: scalar().describe("Of those, how many carried a caption track at all."),
    matched: scalar().describe("Posts whose transcript actually names the term."),
    maxTranscripts: scalar().describe("The ceiling that was applied."),
    ceilingReached: scalar().describe("True when more candidates existed than the ceiling allowed to check."),
    hits: listOf(
      open({
        post: post.nullish(),
        postId: scalar().describe("Addressable — `post:<platform>:<slug>`."),
        matchCount: scalar().describe("Times the term appears in this transcript."),
        excerpts: listOf(
          open({
            text: scalar().describe("The spoken line, with surrounding context to judge tone from."),
            position: scalar().describe("Character offset of the match inside the full transcript."),
            occurrence: scalar().describe("Which match this is, 1-based. Only the first few carry an excerpt."),
            startMs: scalar().describe(
              "When it was said, from the caption track's own cue timings. Absent, never " +
                "estimated, when the platform published no timings.",
            ),
            timecode: scalar().describe('The same instant as "4:12".'),
          }),
        ),
        wordCount: scalar(),
        language: scalar(),
        autoGenerated: scalar(),
      }),
    ).describe("Posts whose transcript names the term, loudest match first."),
    posts: listOf(post).describe("The hits' posts, flattened for the card view."),
    unavailable: anyList().describe("Candidates that could not be narrowed or transcribed, with why."),
    creditsCharged: scalar(),
    mcpCredits,
  }),

  get_post_transcript: open({
    available: scalar().describe("false when the post carries no caption track."),
    // Deliberately no text: it is already in `transcript`, and a caption
    // track is long enough that sending it twice would be a real cost in a
    // payload that ends up in a model's context. `offset` is what makes that
    // safe — it indexes into the transcript that is there.
    cues: listOf(
      open({
        startMs: scalar().describe("When this line starts, in milliseconds."),
        endMs: scalar(),
        offset: scalar().describe(
          "Where this line's words begin in `transcript`, in UTF-16 code units — so a match " +
            "found at a string index maps back to the moment it was said.",
        ),
      }),
    ).describe("Cue timings, where the platform published a timed track. Absent for speech-to-text."),
    transcript: scalar(),
    wordCount: scalar(),
    language: scalar(),
    autoGenerated: scalar(),
    reason: scalar().describe("Why there is no transcript, when available is false."),
    mcpCredits,
  }),

  compare_posts: open({
    ...evidence,
    posts: listOf(post),
    failed: anyList(),
    analyzed: scalar(),
    comparison: open({
      winner: scalar(),
      winnerReason: scalar(),
      differences: listOf(open({ factor: scalar(), detail: scalar() })).optional(),
      sharedStrengths: listOf(z.string()),
      lessons: listOf(z.string()),
      nextTest: scalar(),
    }).nullish(),
    mcpCredits,
  }),

  discover_hashtags: open({
    hashtags: listOf(open({
      hashtag: scalar(),
      posts: scalar(),
      views: scalar(),
      // Only the derived route computes these two: a trend board reports its
      // own totals, a counted sample reports the middle post and one example
      // so a claim about a tag can be checked against a real post.
      medianViews: scalar().describe("Derived route only — views of the median post carrying it."),
      example: scalar().describe("Derived route only — a post that used it."),
      trend: scalar().describe("rising, cooling or steady. Trend board only; a sample has none."),
      url: scalar(),
    })).optional(),
    // Which of the two routes answered, so a counted sample is not read as a
    // trend board. Same marker as get_post_transcript's `source`.
    source: scalar().describe('"trend-board" (tiktok) or "derived-from-sweep" (everywhere else).'),
    platform: scalar(),
    niche: scalar().describe("Derived route only — the sweep the tags were counted from."),
    sweptPosts: scalar().describe("Derived route only — how many posts were counted."),
    note: scalar().describe("Derived route only — the sample size and what it does not establish."),
    available: scalar().describe("false when the network cannot be swept at all."),
    billable: scalar(),
    reason: scalar(),
    country: scalar(),
    days: scalar(),
    mcpCredits,
  }),

  /**
   * One row per creator, on the axis every creator shares. `window` sits
   * beside every derived number on purpose — a hit rate whose denominator is
   * invisible cannot be told apart from a hit rate that means something.
   */
  compare_creators: open({
    creators: listOf(open({
      handle: scalar(),
      platform: scalar(),
      window: scalar().describe("Posts scored — the denominator of hitRate and the baseline."),
      baseline: open({
        count: scalar(),
        median: scalar(),
        min: scalar(),
        max: scalar(),
        p25: scalar(),
        p75: scalar(),
      }).nullish(),
      hitRate: scalar().describe("Share of the window at or above aboveRatio x their own median."),
      medianWinRatio: scalar().describe("How hard they beat their median when they did."),
      ratios: listOf(z.number()).describe("Every post's ratio to their own median, ascending."),
      best: post.nullish(),
      worst: post.nullish(),
      unavailable: scalar().describe("Set when this creator could not be scored, and why."),
    })).optional(),
    platform: scalar(),
    platformDefaulted: scalar(),
    metric: scalar(),
    thinWindow: scalar().describe("Below this many posts, a hit rate is one post either way."),
    aboveRatio: scalar().describe("The ratio hitRate counts from."),
    billable: scalar(),
    mode: scalar(),
    tool: scalar(),
    evidenceFrom: listOf(z.string()),
    creditsCharged: scalar(),
    mcpCredits,
  }),

  show_standings: open({
    creators: listOf(anyObject()),
    metric: scalar(),
    ranking: scalar().describe("Which axis the order is on — 'how often' and 'how big' disagree."),
    verdict: scalar(),
    tooThin: listOf(z.string()).describe("Handles drawn unranked rather than bottom."),
    // The discriminator the view keys on, since `creators` alone is ambiguous
    // with the two fetching tools' payloads.
    standings: scalar(),
  }),

  watchlist_standings: open({
    creators: listOf(open({
      handle: scalar(),
      platform: scalar(),
      window: scalar(),
      baseline: open({
        count: scalar(),
        median: scalar(),
        min: scalar(),
        max: scalar(),
        p25: scalar(),
        p75: scalar(),
      }).nullish(),
      hitRate: scalar(),
      medianWinRatio: scalar(),
      ratios: listOf(z.number()),
      best: post.nullish(),
      worst: post.nullish(),
      unavailable: scalar(),
    })).optional(),
    watching: scalar().describe("How many creators are on the watchlist."),
    metric: scalar(),
    thinWindow: scalar(),
    aboveRatio: scalar(),
    billable: scalar(),
    mode: scalar(),
    tool: scalar(),
    evidenceFrom: listOf(z.string()),
    creditsCharged: scalar(),
    mcpCredits,
  }),

  discover_sounds: open({
    sounds: listOf(open({
      title: scalar(),
      author: scalar(),
      duration: scalar(),
      playUrl: scalar(),
      coverUrl: scalar(),
      videoCount: scalar(),
    })).optional(),
    mcpCredits,
  }),

  write_hooks: open({
    ...evidence,
    hooks: listOf(open({
      hook: scalar(),
      mechanism: scalar().describe("The device the hook uses."),
      why: scalar().describe("Who it stops, and why."),
    })).optional(),
    sourceUrl: scalar(),
    mcpCredits,
  }),

  create_variants: open({
    ...evidence,
    variants: listOf(open({
      hook: scalar(),
      angle: scalar(),
      beats: listOf(z.string()),
      cta: scalar(),
    })).optional(),
    post: post.nullish(),
    sourceUrl: scalar(),
    mcpCredits,
  }),

  /**
   * No `report`. The key named the scores and fixes the backend's model
   * produced, and this tool no longer calls a model — it returns the draft and
   * the rubric and the reading is the caller's. Same rule as `provider` above:
   * documenting a field that never arrives is worse than omitting it.
   */
  score_draft: open({
    guidance,
    draft: scalar(),
    platform: scalar(),
    mcpCredits,
  }),

  repurpose_post: open({
    ...evidence,
    repurposed: open({}).nullish().describe("One entry per target surface."),
    post: post.nullish(),
    sourceUrl: scalar(),
    mcpCredits,
  }),
  niche_report: open({
    ...evidence, report: open({}).nullish(), summary: scalar(), niche: scalar(), mcpCredits }),

  check_nooticr_credits: open({
    balance: scalar(),
    tier: scalar(),
    isAdmin: scalar(),
    bypassCredits: scalar(),
    firstFreeTools: listOf(z.string())
      .describe("Tools whose first use is still free. This is the one to read."),
    // Two names, one list. The backend fills both from the same value and only
    // firstFreeTools has ever been read — the credits card draws its "✨ free"
    // pills from it, and nothing in either repo looks at firstFreeRemaining.
    // It stays declared anyway: it was published in this schema, and a host
    // that validates a response against the advertised output would see the
    // removal as the contract breaking. A duplicate field costs less than that,
    // so the description is what steers a reader off it.
    firstFreeRemaining: listOf(z.string())
      .describe("Superseded by firstFreeTools, which carries the same value. Kept for backward compatibility — read firstFreeTools."),
    hint: scalar(),
  }),

  nooticr_login: open({
    signedIn: scalar().describe("true when the session is already good and no link is needed."),
    loginUrl: scalar().describe("Only present when a sign-in is actually required."),
    pendingAction: scalar().describe("The call that expiry interrupted; it is re-run on the way back."),
    resumed: scalar().describe("The tool that was re-run after signing in — its result is this payload."),
    message: scalar(),
  }),

  create_brand_watch: open({
    created: scalar(),
    requiresConfirmation: scalar().describe("true on the first call — nothing was created or charged yet."),
    confirmationToken: scalar().describe("Pass this back with confirm: true to actually create the watch."),
    expiresInSeconds: scalar(),
    quote: open({
      kind: scalar().describe("\"mentions\" or \"competitor\"."),
      term: scalar().describe("The search term (mentions) or the creator handle (competitor)."),
      platforms: listOf(z.string()).describe("Networks swept (mentions), or the creator's single platform (competitor)."),
      cadence: scalar(),
      cadenceMinutes: scalar(),
      costPerRun: scalar(),
      runsPerDay: scalar(),
      creditsPerDay: scalar(),
      budgetPerRun: scalar(),
      deliverTo: scalar(),
      summary: scalar(),
      balance: scalar(),
      runsAffordableAtCurrentBalance: scalar(),
    }).nullish(),
    instructions: scalar(),
    rejected: scalar().describe("Set when confirm was true but the token didn't check out — nothing was created."),
    alreadyWatching: scalar().describe("Set when this term already has an enabled watch — creating another would double-charge."),
    watchId: scalar(),
    kind: scalar().describe("\"mentions\" or \"competitor\"."),
    term: scalar(),
    platforms: listOf(z.string()),
    competitorHandle: scalar().describe("Set only for a competitor watch."),
    competitorPlatform: scalar().describe("Set only for a competitor watch."),
    cadence: scalar(),
    costPerRun: scalar(),
    creditsPerDay: scalar(),
    budgetPerRun: scalar(),
    deliverTo: scalar(),
    firstRun: scalar(),
    message: scalar(),
  }),
  /**
   * A run series. `runs` is newest first, and every derived number the caller
   * might want is left underived on purpose — the model reads the series.
   */
  show_trend: open({
    points: listOf(anyObject()),
    term: scalar(),
    metric: scalar(),
    verdict: scalar(),
    // Both caveats are fields rather than prose, so the view can draw them
    // and cannot quietly omit them.
    tooShort: scalar().describe("Too few points to call a direction."),
    edgeIsRecordStart: scalar().describe("The left edge is the record's start, not the conversation's."),
    trend: scalar().describe("The discriminator the view keys on."),
  }),

  mention_trend: open({
    guidance,
    runs: listOf(open({
      ranAt: scalar(),
      found: scalar().describe("Everything that sweep saw."),
      reported: scalar().describe("The subset that was new — a different question from found."),
      perPlatform: anyObject().nullish().describe('{"tiktok":{"found":12,"reported":3},...}'),
      medianViews: scalar().describe("Competitor watches only: the baseline that run measured."),
      postsScored: scalar(),
      costCredits: scalar(),
    })).optional(),
    watchId: scalar(),
    kind: scalar(),
    term: scalar(),
    competitorHandle: scalar(),
    platforms: listOf(z.string()),
    windowDays: scalar(),
    // Two numbers a caller cannot derive and will otherwise assume: how long
    // anything is kept, and how long the watch has existed. A flat left edge
    // is one of those, not a quiet period.
    retainedDays: scalar(),
    watchCreatedAt: scalar(),
    runCount: scalar(),
    found: anyObject().nullish().describe("newest and oldest in the window, so direction needs no array maths."),
    medianViews: anyObject().nullish(),
    recurring: listOf(open({
      mentionKey: scalar().describe("A fingerprint. The text is deliberately not stored."),
      timesSeen: scalar(),
      firstReportedAt: scalar(),
      lastSeenAt: scalar(),
    })),
    available: scalar(),
    billable: scalar(),
    mcpCredits,
  }),

  list_brand_watches: open({
    watches: listOf(
      open({
        watchId: scalar(),
        kind: scalar().describe("\"mentions\" or \"competitor\"."),
        term: scalar(),
        platforms: listOf(z.string()),
        competitorHandle: scalar().describe("Set only for a competitor watch."),
        competitorPlatform: scalar().describe("Set only for a competitor watch."),
        cadence: scalar(),
        costPerRun: scalar(),
        budgetPerRun: scalar(),
        creditsSpent: scalar(),
        runs: scalar(),
        deliverTo: scalar(),
        enabled: scalar(),
        stoppedBecause: scalar(),
        nextRun: scalar(),
        lastRun: scalar(),
      }),
    ),
    activeCount: scalar(),
    creditsPerDayAcrossAllWatches: scalar().describe("What every enabled watch together will cost per day if nothing changes."),
    cost: scalar(),
  }),
  stop_brand_watch: open({
    stopped: scalar(),
    alreadyStopped: scalar(),
    watchId: scalar(),
    term: scalar(),
    creditsSpent: scalar(),
    runs: scalar(),
    stoppedBecause: scalar(),
    message: scalar(),
    cost: scalar(),
  }),

  list_own_apps: open({
    apps: listOf(
      open({
        appId: scalar(),
        name: scalar(),
        description: scalar(),
        niche: scalar(),
        productType: scalar(),
        createdAt: scalar(),
      }),
    ),
    count: scalar(),
  }),
  /** Same shape for both: product_summary() in mcp_tools.rs (create/update share it). */
  create_product: open({
    appId: scalar(),
    name: scalar(),
    slug: scalar(),
    description: scalar(),
    iconUrl: scalar(),
    productType: scalar(),
    websiteUrl: scalar(),
    primaryCtaLabel: scalar(),
    primaryCtaUrl: scalar(),
    niche: scalar(),
    externalListingId: scalar(),
    iosBundleId: scalar(),
    androidPackage: scalar(),
    createdAt: scalar(),
  }),
  update_product: open({
    appId: scalar(),
    name: scalar(),
    slug: scalar(),
    description: scalar(),
    iconUrl: scalar(),
    productType: scalar(),
    websiteUrl: scalar(),
    primaryCtaLabel: scalar(),
    primaryCtaUrl: scalar(),
    niche: scalar(),
    externalListingId: scalar(),
    iosBundleId: scalar(),
    androidPackage: scalar(),
    createdAt: scalar(),
  }),
  /**
   * `own_account_read` in crates/server/src/mcp_tools.rs hoists `appId` and
   * `appName` onto whatever `copilot_tools::execute_tool` returned, so every
   * own-account read tool that goes through it (get_scheduled_posts,
   * get_post_performance, get_video_stats) carries both alongside its own
   * payload.
   */
  get_scheduled_posts: open({
    posts: listOf(
      open({
        id: scalar(),
        title: scalar(),
        status: scalar(),
        scheduledAt: scalar(),
        influencerId: scalar(),
        approvalStatus: scalar(),
      }),
    ),
    appId: scalar(),
    appName: scalar(),
  }),
  get_post_performance: open({
    posts: listOf(
      open({
        id: scalar(),
        title: scalar(),
        platform: scalar(),
        views: scalar(),
        likes: scalar(),
        comments: scalar(),
        shares: scalar(),
        postedAt: scalar(),
      }),
    ),
    appId: scalar(),
    appName: scalar(),
  }),
  /**
   * `posts` is not part of the backend's reply — own-account.ts's
   * get_video_stats handler adds it, aliasing `videos`, purely so
   * ui-template.ts's shared posts-gallery view picks this up. Declared here
   * too so a host validating structuredContent does not choke on it.
   */
  get_video_stats: open({
    videos: listOf(
      open({
        id: scalar(),
        title: scalar(),
        platform: scalar(),
        views: scalar(),
        likes: scalar(),
        comments: scalar(),
        shares: scalar(),
      }),
    ),
    posts: listOf(open({}).passthrough()),
    summary: open({ totalViews: scalar(), totalLikes: scalar() }).nullish(),
    appId: scalar(),
    appName: scalar(),
  }),
  get_content_plan: open({
    ok: scalar(),
    plan: open({}).nullish().describe("null when no plan has been generated yet."),
  }),
  /** own_account_read hoists appId/appName onto copilot_tools' get_brand_playbook reply too. */
  get_brand_playbook: open({
    available: scalar().describe("false when no playbook has been configured yet."),
    name: scalar(),
    brand_playbook: scalar().describe("The playbook text itself, or null when unavailable."),
    description: scalar(),
    appId: scalar(),
    appName: scalar(),
  }),
  /** The immediate reply to starting the job — poll analyze_product_status for the result. */
  analyze_product: open({
    ok: scalar(),
    jobId: scalar(),
    state: scalar().describe("Always \"pending\" on this reply; poll analyze_product_status for its progress."),
  }),
  analyze_product_status: open({
    ok: scalar(),
    jobId: scalar(),
    state: scalar().describe("pending, thinking, done or error."),
    progressChars: scalar(),
    contentPreview: scalar(),
    analysis: open({}).nullish().describe("The generated brand playbook, once state is done."),
    provider: scalar(),
    error: scalar(),
    elapsedMs: scalar(),
  }),
  review_post: open({
    review: open({
      degraded: scalar(),
      degradedReason: scalar(),
      scoreA: open({}).nullish(),
      scoreB: open({}).nullish().describe("Only present when titleB was given."),
      aestheticAdvice: scalar(),
      storytellingAdvice: scalar(),
      improvedHooks: listOf(z.string()),
      improvedCaptions: listOf(z.string()),
    })
      .passthrough()
      .nullish(),
    degraded: scalar().describe("Hoisted from review.degraded so it's never missed."),
    warning: scalar().describe("Present when degraded — treat the scores as placeholders."),
  }),
  /**
   * Everything the draft carries is nested under `draft`.
   *
   * The backend answers `{ ok, draft: {...}, provider }` (`draft_post` in
   * crates/server/src/ai/extra_handlers.rs). Declaring title/caption/hashtags
   * at the top level named fields that never arrive — and `script`, which the
   * generator has no notion of at all; a slideshow's per-slide copy comes
   * back as `slides`. Nothing failed, because every field here is nullish and
   * the object is passthrough, so the real draft rode through undeclared
   * while a caller reading the declared keys got undefined for all of them.
   */
  draft_post: open({
    ok: scalar(),
    draft: open({
      title: scalar(),
      caption: scalar(),
      hashtags: listOf(z.string()),
      slides: listOf(
        open({ role: scalar(), overlayText: scalar(), slideCaption: scalar() }),
      ).describe("Present for slideshow drafts."),
    }).nullish(),
    provider: scalar(),
  }),
  growth_brief: open({
    ok: scalar(),
    brief: open({
      headline: scalar(),
      wins: listOf(open({}).passthrough()),
      risks: listOf(open({}).passthrough()),
      actions: listOf(open({}).passthrough()),
    })
      .passthrough()
      .nullish(),
  }),
  /**
   * `plan` is the whole ContentPlan OBJECT, not the per-influencer array.
   *
   * The backend answers `{ ok, plan: { weekStart, grounding, plan: [...] },
   * grounding, provider }` — see `struct ContentPlan` in
   * crates/server/src/ai/growth.rs, where the array is nested one level down.
   * Declaring the array at the top level made every real call fail output
   * validation with `-32602 Expected array, received object at plan`, and it
   * failed *after* the backend had already reserved the credits for the
   * generation: the user paid for a plan and got a protocol error, while the
   * plan itself sat saved server-side for the free `get_content_plan` to
   * find. `get_content_plan` declared the same payload correctly, which is
   * why only this half broke.
   */
  generate_content_plan: open({
    ok: scalar(),
    plan: open({
      weekStart: scalar(),
      grounding: open({}).nullish().describe("The hooks, hashtags and slots the plan was built from."),
      plan: listOf(
        open({
          influencerId: scalar(),
          influencerName: scalar(),
          posts: listOf(
            open({
              day: scalar(),
              formatId: scalar(),
              formatTitle: scalar(),
              hook: scalar(),
              caption: scalar(),
              hashtags: listOf(z.string()),
              contentType: scalar(),
              script: scalar(),
              rationale: scalar(),
            }),
          ),
        }),
      ),
    }).nullish(),
    grounding: open({}).nullish().describe("The post-history digest the plan was grounded in."),
    provider: scalar(),
  }),
  /**
   * The cues come back as `cues`, timed in `start_sec`/`end_sec`.
   *
   * This declared `captions: [{ text, start, end }]` — a field the backend
   * has never sent (see `generate_captions` in
   * crates/server/src/ai/handlers.rs). Nothing hard-failed, because an
   * absent nullish list validates and the real keys passed through
   * undeclared, so the cost was quieter: a host reading the declared
   * `captions` got undefined, and the transcript and cost were invisible to
   * anything working from the schema.
   */
  generate_captions: open({
    ok: scalar(),
    cues: listOf(open({ text: scalar(), start_sec: scalar(), end_sec: scalar() })),
    transcript: scalar().describe("The transcript the cues were cut from."),
    cost: scalar().describe("Credits charged for the generation."),
    provider: scalar().describe("\"mock\" when no AI provider is configured — the cues are placeholders."),
  }),

  list_social_connections: open({
    connections: listOf(
      open({
        influencerId: scalar(),
        influencerName: scalar(),
        platform: scalar(),
        accountName: scalar(),
        status: scalar(),
        canReadAccount: scalar().describe("\"yes\", \"no\" or \"unknown\" — unknown means try it, not a refusal."),
        canPublishPost: scalar(),
        canManageComments: scalar(),
        scopeRecorded: scalar(),
      }),
    ),
    connectedCount: scalar(),
    connectable: listOf(z.string()).describe("Platforms that can be linked to an account — smaller than what nooticr reads."),
    note: scalar(),
  }),
  connect_social_account: open({
    platform: scalar(),
    appId: scalar(),
    influencerId: scalar(),
    connectUrl: scalar().describe("Open this in a browser to approve the connection."),
    message: scalar(),
  }),

  // Marketplace. One shape for all three collection tools: a status poll
  // returns exactly what the scan that started it returns, and a single
  // product is a scan of one — describing them differently would be three
  // names for one payload and three places for the view to drift.
  scan_amazon_category: amazonScan,
  amazon_scan_status: amazonScan,
  get_amazon_product: open({
    ...amazonScanShape,
    product: amazonProduct.nullish().describe("The single listing, also present as products[0]."),
  }),
  show_amazon_category_insights: open({
    marketplace: scalar(),
    view: scalar(),
    category: scalar(),
    summary: scalar(),
    drivers: listOf(amazonFinding).describe("What makes someone buy, as you read it."),
    barriers: listOf(amazonFinding).describe("What stops them, or makes them return it."),
    strengths: listOf(open({ brand: scalar(), detail: scalar(), asin: scalar() })),
    gaps: listOf(amazonFinding),
    positioning: listOf(
      open({ angle: scalar(), who: scalar(), why: scalar(), risk: scalar() }),
    ),
    products: listOf(amazonProduct).describe("The listings, passed through so the view can draw them."),
    rollup: open({}).nullish(),
    scanId: scalar(),
    mcpCredits,
  }),
} as const;

export type OutputSchemaName = keyof typeof OUTPUT_SCHEMAS;
