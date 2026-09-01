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

/** Every paid tool reports what it charged. */
const mcpCredits = open({
  cost: scalar().describe("Credits this call consumed."),
  adminBypass: scalar(),
  balance: scalar(),
}).nullish();

/** The post object every feed, comparison and single-post tool returns. */
const post = open({
  id: scalar(),
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

const feed = { platform: scalar(), posts: listOf(post), mcpCredits };
const singlePost = { post: post.nullish(), platform: scalar(), url: scalar(), mcpCredits };
const analyzed = { ...singlePost, analysis, analyzed: scalar() };

/**
 * One entry per tool. A tool missing from here declares nothing, which is the
 * honest option when the shape has not been checked against a real response.
 */
export const OUTPUT_SCHEMAS = {
  analyze_post: open(analyzed),
  analyze_post_fast: open({ ...analyzed, mode: scalar() }),
  understand_social_post: open(analyzed),
  get_social_media: open({ ...singlePost, provider: scalar(), fetchedAt: scalar() }),

  discover_social_posts: open(feed),
  get_user_posts: open({ ...feed, username: scalar() }),

  analyze_creator_profile: open({
    creator: creator.nullish(),
    posts: listOf(post),
    profile: open({}).nullish(),
    analysis,
    mcpCredits,
  }),
  search_creators: open({ creators: listOf(creator), platform: scalar(), mcpCredits }),
  get_similar_creators: open({ creators: listOf(creator), platform: scalar(), mcpCredits }),
  find_hook_pattern: open({
    report: open({}).nullish(),
    username: scalar(),
    platform: scalar(),
    postsAnalyzed: scalar(),
    mcpCredits,
  }),

  get_post_comments: open({
    comments: listOf(open({ text: scalar(), author: scalar(), likes: scalar() })).optional(),
    themes: listOf(z.unknown()),
    summary: scalar(),
    url: scalar(),
    platform: scalar(),
    mcpCredits,
  }),
  analyze_comments: open({
    summary: scalar(),
    themes: listOf(z.unknown()),
    commentsAnalyzed: scalar(),
    report: open({}).nullish(),
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
    posts: listOf(post),
    failed: listOf(z.unknown()),
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
    hooks: listOf(open({
      hook: scalar(),
      mechanism: scalar().describe("The device the hook uses."),
      why: scalar().describe("Who it stops, and why."),
    })).optional(),
    sourceUrl: scalar(),
    mcpCredits,
  }),

  create_variants: open({
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

  score_draft: open({
    draft: scalar(),
    platform: scalar(),
    report: open({
      verdict: scalar(),
      hookStrength: scalar(),
      clarity: scalar(),
      payoff: scalar(),
      strengths: listOf(z.string()),
      weaknesses: listOf(z.string()),
      fixes: listOf(z.unknown()),
      rewrittenHook: scalar(),
      rewrittenDraft: scalar(),
      predictedComment: scalar(),
    }).nullish(),
    mcpCredits,
  }),

  repurpose_post: open({
    repurposed: open({}).nullish().describe("One entry per target surface."),
    post: post.nullish(),
    sourceUrl: scalar(),
    mcpCredits,
  }),
  niche_report: open({ report: open({}).nullish(), summary: scalar(), niche: scalar(), mcpCredits }),

  check_orchyn_credits: open({
    balance: scalar(),
    tier: scalar(),
    isAdmin: scalar(),
    bypassCredits: scalar(),
    firstFreeTools: listOf(z.string()),
    firstFreeRemaining: listOf(z.string()),
    billingUrl: scalar(),
    hint: scalar(),
  }),
  buy_orchyn_credits: open({
    checkoutUrl: scalar(),
    packs: listOf(open({})),
  }),
  orchyn_login: open({
    loginUrl: scalar(),
    message: scalar(),
  }),
} as const;

export type OutputSchemaName = keyof typeof OUTPUT_SCHEMAS;
