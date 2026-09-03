/**
 * Output schemas — what a caller gets back, declared.
 *
 * Every tool here already returns structuredContent and none of them said what
 * shape it was, so anything chaining two Orchyn tools had to call one, look at
 * the result, and guess. Declaring the shape is what lets a host validate it
 * and an agent plan against it.
 *
 * These describe rather than constrain, deliberately. The payloads come from
 * the orchyn backend, not from this repo: a field it adds tomorrow must not
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
 */
const scalar = () => z.union([z.string(), z.number(), z.boolean()]).nullish();
/** Same reasoning for lists: a null list, and a null element, must both pass. */
const listOf = <T extends z.ZodTypeAny>(item: T) => z.array(z.union([item, z.null()])).nullish();
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
  // Media comes in threes: the platform URL, an orchyn proxy, and a resolver
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
const evidence = {
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
            avatarProxyUrl: scalar().describe("The same picture through orchyn, for a sandboxed view."),
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
  get_post_frames: open({
    url: scalar(),
    platform: scalar(),
    contentType: scalar(),
    durationSeconds: scalar(),
    frameCount: scalar(),
    frames: anyList().describe("Base64 frames; also delivered as image content blocks."),
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
      "Always false. No orchyn connection carries comment-write permission, so the drafts this " +
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

  track_competitor: open({
    ...evidence,
    username: scalar(),
    platform: scalar(),
    metric: scalar().describe("Which stat everything here is ranked on."),
    window: scalar().describe("Posts in the window actually scored."),
    since: scalar(),
    sinceApplied: scalar(),
    tracked: scalar().describe("True when this creator is on the watchlist, which is what makes a diff possible."),
    lastCheckedAt: scalar().describe("When track_competitor last looked, or null on a first look."),
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

  who_should_i_work_with: open({
    ...evidence,
    niche: scalar(),
    platform: scalar(),
    seed: scalar().describe("The creator whose lookalikes were added, if one was given."),
    creators: listOf(
      creator.extend({
        id: scalar().describe("Addressable — `creator:<platform>:<handle>`."),
        foundBy: scalar().describe("search, similar, or both — both is the strongest signal here."),
      }),
    ),
    foundBoth: scalar().describe("How many candidates both searches returned."),
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

  get_post_transcript: open({
    available: scalar().describe("false when the post carries no caption track."),
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
      trend: scalar().describe("rising, cooling or steady."),
      url: scalar(),
    })).optional(),
    country: scalar(),
    days: scalar(),
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

  check_orchyn_credits: open({
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
    billingUrl: scalar(),
    hint: scalar(),
  }),
  buy_orchyn_credits: open({
    checkoutUrl: scalar(),
    packs: listOf(open({})),
  }),
  orchyn_login: open({
    signedIn: scalar().describe("true when the session is already good and no link is needed."),
    loginUrl: scalar().describe("Only present when a sign-in is actually required."),
    pendingAction: scalar().describe("The call that expiry interrupted; it is re-run on the way back."),
    resumed: scalar().describe("The tool that was re-run after signing in — its result is this payload."),
    message: scalar(),
  }),
} as const;

export type OutputSchemaName = keyof typeof OUTPUT_SCHEMAS;
