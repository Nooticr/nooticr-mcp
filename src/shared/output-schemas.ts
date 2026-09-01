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

/** Every paid tool reports what it charged. */
const mcpCredits = open({
  cost: z.number().optional().describe("Credits this call consumed."),
  adminBypass: z.boolean().optional(),
  balance: z.number().optional(),
}).optional();

/** The post object every feed, comparison and single-post tool returns. */
const post = open({
  id: z.string().optional(),
  platform: z.string().optional(),
  contentType: z.string().optional().describe("video, image, carousel or slideshow."),
  detectedFormat: z.string().optional(),
  title: z.string().optional(),
  caption: z.string().optional(),
  creatorHandle: z.string().optional(),
  externalUrl: z.string().optional().describe("Permalink — the URL to feed back into another tool."),
  embedUrl: z.string().optional(),
  duration: z.number().optional(),
  views: z.number().optional(),
  likes: z.number().optional(),
  comments: z.number().optional(),
  shares: z.number().optional(),
  engagementRate: z.number().optional(),
  hashtags: z.array(z.string()).optional(),
  // Media comes in threes: the platform URL, an orchyn proxy, and a resolver
  // that re-fetches when a signed link has expired.
  videoUrl: z.string().optional(),
  videoProxyUrl: z.string().optional(),
  videoFallbackUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  thumbnailProxyUrl: z.string().optional(),
  thumbnailFallbackUrl: z.string().optional(),
  musicUrl: z.string().optional(),
  musicProxyUrl: z.string().optional(),
  musicFallbackUrl: z.string().optional(),
  musicTitle: z.string().optional(),
  musicAuthor: z.string().optional(),
  mediaItems: z.array(open({}).passthrough()).optional(),
});

const creator = open({
  username: z.string().optional(),
  nickname: z.string().optional(),
  platform: z.string().optional(),
  followers: z.number().optional(),
  signature: z.string().optional(),
  verified: z.boolean().optional(),
  avatarUrl: z.string().optional(),
  externalUrl: z.string().optional(),
});

/** The prose blocks an AI tool returns; keys vary by tool, so keep it open. */
const analysis = open({
  summary: z.string().optional(),
  hookStrength: z.union([z.number(), z.string()]).optional(),
  whyItWorks: z.string().optional(),
  viralTriggers: z.array(z.string()).optional(),
  keyQuotes: z.array(z.string()).optional(),
  variationIdeas: z.array(z.string()).optional(),
  suggestedHook: z.string().optional(),
  suggestedHashtags: z.array(z.string()).optional(),
  niche: z.string().optional(),
}).optional();

const feed = { platform: z.string().optional(), posts: z.array(post).optional(), mcpCredits };
const singlePost = { post: post.optional(), platform: z.string().optional(), url: z.string().optional(), mcpCredits };
const analyzed = { ...singlePost, analysis, analyzed: z.boolean().optional() };

/**
 * One entry per tool. A tool missing from here declares nothing, which is the
 * honest option when the shape has not been checked against a real response.
 */
export const OUTPUT_SCHEMAS = {
  analyze_post: open(analyzed),
  analyze_post_fast: open({ ...analyzed, mode: z.string().optional() }),
  understand_social_post: open(analyzed),
  get_social_media: open({ ...singlePost, provider: z.string().optional(), fetchedAt: z.string().optional() }),

  discover_social_posts: open(feed),
  get_user_posts: open({ ...feed, username: z.string().optional() }),

  analyze_creator_profile: open({
    creator: creator.optional(),
    posts: z.array(post).optional(),
    profile: open({}).optional(),
    analysis,
    mcpCredits,
  }),
  search_creators: open({ creators: z.array(creator).optional(), platform: z.string().optional(), mcpCredits }),
  get_similar_creators: open({ creators: z.array(creator).optional(), platform: z.string().optional(), mcpCredits }),
  find_hook_pattern: open({
    report: open({}).optional(),
    username: z.string().optional(),
    platform: z.string().optional(),
    postsAnalyzed: z.number().optional(),
    mcpCredits,
  }),

  get_post_comments: open({
    comments: z.array(open({ text: z.string().optional(), author: z.string().optional(), likes: z.number().optional() })).optional(),
    themes: z.array(z.union([z.string(), open({})])).optional(),
    summary: z.string().optional(),
    url: z.string().optional(),
    platform: z.string().optional(),
    mcpCredits,
  }),
  analyze_comments: open({
    summary: z.string().optional(),
    themes: z.array(z.union([z.string(), open({})])).optional(),
    commentsAnalyzed: z.number().optional(),
    report: open({}).optional(),
    mcpCredits,
  }),

  get_post_transcript: open({
    available: z.boolean().optional().describe("false when the post carries no caption track."),
    transcript: z.string().optional(),
    wordCount: z.number().optional(),
    language: z.string().optional(),
    autoGenerated: z.boolean().optional(),
    reason: z.string().optional().describe("Why there is no transcript, when available is false."),
    mcpCredits,
  }),

  compare_posts: open({
    posts: z.array(post).optional(),
    failed: z.array(z.union([z.string(), open({})])).optional(),
    analyzed: z.union([z.boolean(), z.number()]).optional(),
    comparison: open({
      winner: z.union([z.number(), z.string()]).optional(),
      winnerReason: z.string().optional(),
      differences: z.array(open({ factor: z.string().optional(), detail: z.string().optional() })).optional(),
      sharedStrengths: z.array(z.string()).optional(),
      lessons: z.array(z.string()).optional(),
      nextTest: z.string().optional(),
    }).optional(),
    mcpCredits,
  }),

  discover_hashtags: open({
    hashtags: z.array(open({
      hashtag: z.string().optional(),
      posts: z.number().optional(),
      views: z.number().optional(),
      trend: z.string().optional().describe("rising, cooling or steady."),
      url: z.string().optional(),
    })).optional(),
    country: z.string().optional(),
    days: z.number().optional(),
    mcpCredits,
  }),

  discover_sounds: open({
    sounds: z.array(open({
      title: z.string().optional(),
      author: z.string().optional(),
      duration: z.number().optional(),
      playUrl: z.string().optional(),
      coverUrl: z.string().optional(),
      videoCount: z.number().optional(),
    })).optional(),
    mcpCredits,
  }),

  write_hooks: open({
    hooks: z.array(open({
      hook: z.string().optional(),
      mechanism: z.string().optional().describe("The device the hook uses."),
      why: z.string().optional().describe("Who it stops, and why."),
    })).optional(),
    sourceUrl: z.string().optional(),
    mcpCredits,
  }),

  create_variants: open({
    variants: z.array(open({
      hook: z.string().optional(),
      angle: z.string().optional(),
      beats: z.array(z.string()).optional(),
      cta: z.string().optional(),
    })).optional(),
    post: post.optional(),
    sourceUrl: z.string().optional(),
    mcpCredits,
  }),

  score_draft: open({
    draft: z.string().optional(),
    platform: z.string().optional(),
    report: open({
      verdict: z.string().optional(),
      hookStrength: z.union([z.number(), z.string()]).optional(),
      clarity: z.union([z.number(), z.string()]).optional(),
      payoff: z.union([z.number(), z.string()]).optional(),
      strengths: z.array(z.string()).optional(),
      weaknesses: z.array(z.string()).optional(),
      fixes: z.array(z.union([z.string(), open({})])).optional(),
      rewrittenHook: z.string().optional(),
      rewrittenDraft: z.string().optional(),
      predictedComment: z.string().optional(),
    }).optional(),
    mcpCredits,
  }),

  repurpose_post: open({
    repurposed: open({}).optional().describe("One entry per target surface."),
    post: post.optional(),
    sourceUrl: z.string().optional(),
    mcpCredits,
  }),
  niche_report: open({ report: open({}).optional(), summary: z.string().optional(), niche: z.string().optional(), mcpCredits }),

  check_orchyn_credits: open({
    balance: z.number().optional(),
    tier: z.string().optional(),
    isAdmin: z.boolean().optional(),
    bypassCredits: z.boolean().optional(),
    firstFreeTools: z.array(z.string()).optional(),
    firstFreeRemaining: z.array(z.string()).optional(),
    billingUrl: z.string().optional(),
    hint: z.string().optional(),
  }),
  buy_orchyn_credits: open({
    checkoutUrl: z.string().optional(),
    packs: z.array(open({})).optional(),
  }),
  orchyn_login: open({
    loginUrl: z.string().optional(),
    message: z.string().optional(),
  }),
} as const;

export type OutputSchemaName = keyof typeof OUTPUT_SCHEMAS;
