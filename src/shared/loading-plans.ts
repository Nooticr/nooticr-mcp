/**
 * What each tool is about to do, and what it will cost — for the wait.
 *
 * ## Why this exists rather than a table in the view
 *
 * The view is a static HTML string with no imports, so its first version of
 * this was a hand-copied price list. It was wrong within the hour: it took its
 * numbers from `mcp_tool_cost` in nooticr-server, which prices a *direct*
 * `/mcp` call, while every evidence tool in this server fans out to cheaper
 * calls instead. `analyze_post` is billed 6 there and 3 here (frames 2 plus
 * transcript 1); `analyze_creator_profile` 15 there and 2 here. A price on the
 * face of a loading screen is a promise, and one copied from the wrong table
 * is worse than none at all.
 *
 * So the plans are built here, from the same constants the tools bill against
 * — `EVIDENCE_PLANS` and `BACKEND_CALL_CREDITS` — and substituted into the
 * template as JSON. A tool that changes what it fetches changes what the wait
 * says, with no second place to remember.
 *
 * ## What the view may and may not claim
 *
 * MCP Apps gives a view four notifications: tool-input, tool-input-partial,
 * tool-result and tool-cancelled (`@modelcontextprotocol/ext-apps`). There is
 * no progress notification, so nothing here can honestly say a step has
 * *finished* — only what the call is going to do and what each line costs.
 * The design board's ledger ticks green checks through its rows; that is a
 * canvas loop, and reproducing it would assert completions this server has no
 * way to know. The rows are drawn, priced, and left un-ticked.
 */
import { planCalls } from "./evidence.js";
import {
  BACKEND_CALL_CREDITS,
  CREDITS_PER_CREATOR,
  CREDITS_PER_NETWORK,
  MAX_SPOKEN_HANDLE_CALLS,
  MAX_SPOKEN_TRANSCRIPTS,
  SEARCH_PLATFORMS,
  SPOKEN_PLATFORMS,
  XIAOHONGSHU_CREDITS,
} from "./spend.js";

/** The shape the answer will arrive in, so the space it needs is reserved. */
export type LoadingKind = "post" | "strip" | "list" | "text";

/** One backend call the tool will make, named and priced. */
export interface LoadingStep {
  via: string;
  label: string;
  detail?: string;
  credits: number;
}

/**
 * A line whose *count* an argument sets, expanded by the view.
 *
 * `arg` names the argument to measure — an array's length, a number's value.
 * `defaultCount` is what the tool does when the argument is omitted, which is
 * the case worth stating: an omitted `platforms` on search_mentions means all
 * nine networks and 21 credits, and nothing the caller read said so.
 */
export interface LoadingPerUnit {
  via: string;
  label: string;
  detail?: string;
  credits: number;
  arg?: string;
  defaultCount: number;
  /** Price each named platform separately — Xiaohongshu costs more upstream. */
  perPlatform?: boolean;
  /** Only runs when this argument is present (a niche sweep, a seed creator). */
  onlyWith?: string;
  /**
   * The values of `arg` the tool keeps, when it drops the rest.
   *
   * `search_spoken_mentions` accepts a `platforms` array and then filters it
   * to the two networks that publish a caption track. Counting the argument
   * as given quotes a sweep of Instagram that never runs.
   */
  only?: readonly string[];
  /**
   * Multiply the count by the size of a second argument.
   *
   * A named handle is checked once per platform, so two handles across two
   * networks is four calls rather than two. Spelled out rather than reusing
   * `only`/`defaultCount` above, because those describe `arg` — filtering a
   * list of handles by a list of networks would count every call as zero.
   */
  per?: { arg: string; only?: readonly string[]; defaultCount: number };
  /** The clamp the tool applies to a numeric argument, mirrored so the wait cannot over-quote. */
  min?: number;
  max?: number;
  /**
   * An argument whose presence makes the count unknowable from here.
   *
   * `useWatchlist` adds however many creators the watchlist holds, and a
   * sandboxed view cannot read it. The answer is the ceiling the tool clamps
   * to, drawn as a ceiling — "up to" — rather than a precise number that
   * would be wrong for every watchlist but one.
   */
  ceilingWith?: string;
}

export interface LoadingPlan {
  label: string;
  kind: LoadingKind;
  n: number;
  steps: LoadingStep[];
  perUnit?: LoadingPerUnit[];
  /** Free to call: it fetches nothing, or only reads nooticr's own rows. */
  free?: boolean;
  /**
   * Spends the workspace's plan AI credits rather than personal MCP credits.
   *
   * A third state, and it has to be: these tools are not free, but the number
   * they spend is not the balance check_nooticr_credits reports on. Drawing
   * them as "Free" would be a lie a user only discovers on their plan bill,
   * and drawing them as an MCP credit count would be a lie about which
   * balance is moving.
   */
  planAi?: boolean;
  /** Shown under the centred mark on the long fan-outs. */
  note?: string;
}

/** What each backend call is doing, in words a person reads rather than a tool name. */
const CALL_LABELS: Record<string, { label: string; detail?: string }> = {
  get_post_frames: { label: "Sampling frames", detail: "one per shot, by scene change" },
  get_post_transcript: { label: "Reading the caption track", detail: "exact wording, not inferred" },
  get_social_media: { label: "Fetching the post", detail: "stats, caption and media" },
  get_user_posts: { label: "Loading their posts", detail: "recent window, with stats" },
  get_post_comments: { label: "Reading the comments", detail: "top replies and their themes" },
  discover_social_posts: { label: "Searching posts", detail: "recent, for the niche" },
  search_creators: { label: "Finding creators", detail: "by keyword" },
  get_similar_creators: { label: "Finding lookalikes", detail: "from the seed creator" },
  discover_sounds: { label: "Finding sounds", detail: "trending audio" },
  discover_hashtags: { label: "Reading the trend board", detail: "with volumes and direction" },
};

function step(via: string): LoadingStep {
  const said = CALL_LABELS[via] ?? { label: via };
  return { via, label: said.label, detail: said.detail, credits: BACKEND_CALL_CREDITS[via] ?? 0 };
}

/** The fan-out an evidence tool declares, as priced lines. */
function evidenceSteps(tool: string): LoadingStep[] {
  return planCalls(tool).map(step);
}

const CREATOR_UNIT: LoadingPerUnit = {
  via: "get_user_posts",
  label: "Checking a creator",
  detail: "since your last catch-up",
  credits: CREDITS_PER_CREATOR,
  defaultCount: 1,
};

/**
 * One plan per registered tool.
 *
 * Pinned by tests/loading-plans.test.ts against the server's own tool list, so
 * a tool cannot ship without a wait that says what it is doing — which is how
 * search_mentions, the slowest and dearest call here, ended up drawing a
 * generic grey box that said "Working".
 */
export const LOADING_PLANS: Record<string, LoadingPlan> = {
  // ─── Read a post ───
  get_social_media: { label: "Fetching the post", kind: "post", n: 1, steps: [step("get_social_media")] },
  get_post_transcript: {
    label: "Reading the caption track",
    kind: "text",
    n: 1,
    steps: [step("get_post_transcript")],
  },
  get_post_frames: { label: "Sampling frames", kind: "post", n: 1, steps: [step("get_post_frames")] },
  get_post_comments: { label: "Loading comments", kind: "list", n: 6, steps: [step("get_post_comments")] },

  // ─── Understand a post ───
  analyze_post: { label: "Analysing the post", kind: "post", n: 1, steps: evidenceSteps("analyze_post") },
  understand_social_post: {
    label: "Watching the video",
    kind: "post",
    n: 1,
    steps: evidenceSteps("understand_social_post"),
  },
  analyze_post_fast: {
    label: "Reading the post",
    kind: "text",
    n: 1,
    steps: evidenceSteps("analyze_post_fast"),
  },
  analyze_comments: {
    label: "Reading the comment section",
    kind: "text",
    n: 1,
    // Not an evidence plan: it proxies one get_post_comments and synthesises.
    steps: [step("get_post_comments")],
  },
  compare_posts: {
    label: "Fetching the first post",
    kind: "strip",
    n: 2,
    steps: evidenceSteps("compare_posts"),
    note: "1 credit more for every further post you fetch yourself.",
  },

  // ─── Research ───
  discover_social_posts: {
    label: "Searching posts",
    kind: "strip",
    n: 3,
    steps: [step("discover_social_posts")],
  },
  get_user_posts: { label: "Loading their posts", kind: "strip", n: 3, steps: [step("get_user_posts")] },
  search_creators: { label: "Finding creators", kind: "list", n: 5, steps: [step("search_creators")] },
  get_similar_creators: {
    label: "Finding similar creators",
    kind: "list",
    n: 5,
    steps: [step("get_similar_creators")],
  },
  discover_sounds: { label: "Finding trending sounds", kind: "list", n: 4, steps: [step("discover_sounds")] },
  discover_hashtags: {
    label: "Reading the trend board",
    kind: "list",
    n: 6,
    steps: [step("discover_hashtags")],
  },
  analyze_creator_profile: {
    label: "Reading the profile",
    kind: "list",
    n: 4,
    steps: evidenceSteps("analyze_creator_profile"),
  },
  find_hook_pattern: {
    label: "Reading their openings",
    kind: "list",
    n: 5,
    steps: evidenceSteps("find_hook_pattern"),
  },
  niche_report: { label: "Reading the niche", kind: "text", n: 1, steps: evidenceSteps("niche_report") },

  // ─── Make something ───
  write_hooks: { label: "Reading the source post", kind: "text", n: 1, steps: evidenceSteps("write_hooks") },
  create_variants: {
    label: "Reading the post that worked",
    kind: "text",
    n: 1,
    steps: evidenceSteps("create_variants"),
  },
  repurpose_post: {
    label: "Reading the source post",
    kind: "text",
    n: 1,
    steps: evidenceSteps("repurpose_post"),
  },
  // Fetches nothing: the draft is already the caller's.
  score_draft: { label: "Scoring the draft", kind: "text", n: 1, steps: [], free: true },

  // ─── Brand monitoring ───
  search_mentions: {
    label: "Sweeping for mentions",
    kind: "list",
    n: 6,
    steps: [],
    perUnit: [
      {
        via: "search_mentions",
        label: "Sweeping a network",
        detail: "every comment that names the term",
        credits: CREDITS_PER_NETWORK,
        arg: "platforms",
        defaultCount: SEARCH_PLATFORMS.length,
        perPlatform: true,
      },
    ],
    note: "Priced per network. Omitting platforms means all of them.",
  },
  // The one plan whose arithmetic is not a single argument read straight off:
  // it mirrors the worst case jobs.ts computes before it asks to spend, line
  // for line, because the two numbers are shown to the same person minutes
  // apart and any gap between them reads as one of them lying.
  search_spoken_mentions: {
    label: "Listening for mentions",
    kind: "list",
    n: 4,
    steps: [],
    perUnit: [
      {
        via: "discover_social_posts",
        label: "Sweeping for candidates",
        detail: "per network, when a niche is given",
        credits: BACKEND_CALL_CREDITS.discover_social_posts,
        arg: "platforms",
        only: SPOKEN_PLATFORMS,
        defaultCount: SPOKEN_PLATFORMS.length,
        onlyWith: "niche",
      },
      {
        via: "get_user_posts",
        label: "Checking a creator",
        detail: "once per network asked for",
        credits: BACKEND_CALL_CREDITS.get_user_posts,
        arg: "usernames",
        per: { arg: "platforms", only: SPOKEN_PLATFORMS, defaultCount: SPOKEN_PLATFORMS.length },
        defaultCount: 0,
        max: MAX_SPOKEN_HANDLE_CALLS,
        ceilingWith: "useWatchlist",
      },
      {
        via: "get_post_transcript",
        label: "Transcribing a candidate",
        detail: "most-viewed first, up to the ceiling",
        credits: BACKEND_CALL_CREDITS.get_post_transcript,
        arg: "maxTranscripts",
        defaultCount: 8,
        min: 1,
        max: MAX_SPOKEN_TRANSCRIPTS,
      },
    ],
    note: "The ceiling is the price. Only the survivors are transcribed.",
  },
  catch_up_watchlist: {
    label: "Checking your watchlist",
    kind: "list",
    n: 5,
    steps: [],
    perUnit: [CREATOR_UNIT],
    note: "Priced per creator on the watchlist.",
  },

  // ─── The goal tools (jobs.ts) ───
  answer_my_audience: {
    label: "Reading your own replies",
    kind: "list",
    n: 6,
    steps: [step("get_user_posts")],
    perUnit: [
      {
        via: "get_post_comments",
        label: "Opening a post",
        detail: "reading what was asked under it",
        credits: BACKEND_CALL_CREDITS.get_post_comments,
        arg: "limit",
        defaultCount: 6,
      },
    ],
  },
  track_competitor: {
    label: "Reading what they shipped",
    kind: "strip",
    n: 3,
    steps: [step("get_user_posts")],
  },
  who_should_i_work_with: {
    label: "Building a shortlist",
    kind: "list",
    n: 5,
    steps: [step("search_creators")],
    perUnit: [
      {
        via: "get_similar_creators",
        label: "Adding their lookalikes",
        credits: BACKEND_CALL_CREDITS.get_similar_creators,
        defaultCount: 1,
        onlyWith: "seed",
      },
    ],
  },
  why_did_this_underperform: {
    label: "Measuring it against their own median",
    kind: "text",
    n: 1,
    steps: [step("get_social_media"), step("get_user_posts")],
  },
  what_should_i_make_next: {
    label: "Reading demand against supply",
    kind: "list",
    n: 6,
    steps: [step("get_user_posts"), step("discover_social_posts")],
    perUnit: [
      {
        via: "get_post_comments",
        label: "Reading a post's comments",
        detail: "what the audience asked for",
        credits: BACKEND_CALL_CREDITS.get_post_comments,
        arg: "limit",
        defaultCount: 4,
      },
    ],
  },

  // ─── Draws what the caller already has: no fetch, no price ───
  show_comment_review: { label: "Drawing the labels", kind: "list", n: 6, steps: [], free: true },
  show_audience_replies: { label: "Laying out the drafts", kind: "list", n: 5, steps: [], free: true },

  // ─── Draws what the caller already produced: no fetch, no price ───
  // The show_* family renders the model's own output. A wait here is brief
  // and free, but it still says which, because "nothing is happening" and
  // "this is free and instant" look identical on a blank screen.
  show_analysis: { label: "Drawing the reading", kind: "text", n: 1, steps: [], free: true },
  show_comparison: { label: "Drawing the comparison", kind: "strip", n: 2, steps: [], free: true },
  show_hooks: { label: "Laying out the hooks", kind: "list", n: 5, steps: [], free: true },
  show_variants: { label: "Laying out the variants", kind: "list", n: 4, steps: [], free: true },
  show_repurposed_post: { label: "Laying out the rewrites", kind: "text", n: 1, steps: [], free: true },
  show_collab_shortlist: { label: "Drawing the shortlist", kind: "list", n: 5, steps: [], free: true },
  show_trend: { label: "Drawing the trend", kind: "text", n: 1, steps: [], free: true },
  // Reads stored aggregates the sweeps already paid for. Free, and no
  // upstream step to wait on — the wait is a database read.
  mention_trend: { label: "Reading the run history", kind: "text", n: 1, steps: [], free: true },
  prepare_handoff: { label: "Packaging the handoff", kind: "list", n: 4, steps: [], free: true },

  // ─── Own-account reads: nooticr's own stored rows ───
  get_scheduled_posts: { label: "Reading your pipeline", kind: "list", n: 5, steps: [], free: true },
  get_post_performance: { label: "Reading your numbers", kind: "list", n: 5, steps: [], free: true },
  get_video_stats: { label: "Reading the last sync", kind: "strip", n: 3, steps: [], free: true },
  get_brand_playbook: { label: "Reading the playbook", kind: "text", n: 1, steps: [], free: true },

  // ─── The product analysis: the one own-account tool that spends ───
  // The only outbound fetch in this family — it reads an excerpt of the
  // product's own site — and it is billed against the workspace's plan AI
  // credits, not the personal MCP balance.
  analyze_product: { label: "Starting the analysis", kind: "text", n: 1, steps: [], planAi: true },
  // Free to poll: the spend already happened when the job was started.
  analyze_product_status: {
    label: "Checking the analysis",
    kind: "text",
    n: 1,
    steps: [],
    free: true,
  },

  // ─── Scheduled monitoring (brand-watch.ts) ───
  // Managing a schedule is not using it: the sweeps a watch makes are billed
  // as search_mentions when the worker runs them, later and elsewhere.
  create_brand_watch: { label: "Setting up the watch", kind: "text", n: 1, steps: [], free: true },
  list_brand_watches: { label: "Reading your watches", kind: "list", n: 3, steps: [], free: true },
  stop_brand_watch: { label: "Stopping the watch", kind: "text", n: 1, steps: [], free: true },

  // ─── Own-account reads: nooticr's own stored rows, never an upstream call ───
  list_own_apps: { label: "Reading your products", kind: "list", n: 3, steps: [], free: true },
  get_content_plan: { label: "Reading the saved plan", kind: "text", n: 1, steps: [], free: true },
  // Calls AI, but the dashboard's own pre-publish review has never billed for
  // it, so neither does this.
  review_post: { label: "Scoring the post", kind: "text", n: 1, steps: [], free: true },

  // ─── Own-account generation: a different balance ───
  draft_post: { label: "Drafting the post", kind: "text", n: 1, steps: [], planAi: true },
  growth_brief: { label: "Writing the brief", kind: "text", n: 1, steps: [], planAi: true },
  generate_content_plan: {
    label: "Planning the week",
    kind: "list",
    n: 5,
    steps: [],
    planAi: true,
  },
  generate_captions: { label: "Writing the captions", kind: "text", n: 1, steps: [], planAi: true },

  // ─── Account and own-account: free, and free at a zero balance ───
  check_nooticr_credits: { label: "Checking your balance", kind: "text", n: 1, steps: [], free: true },
  nooticr_login: { label: "Getting a sign-in link", kind: "text", n: 1, steps: [], free: true },
  watch_creator: { label: "Adding to your watchlist", kind: "text", n: 1, steps: [], free: true },
  unwatch_creator: { label: "Removing from your watchlist", kind: "text", n: 1, steps: [], free: true },
  list_social_connections: { label: "Reading your connections", kind: "list", n: 3, steps: [], free: true },
  connect_social_account: { label: "Minting a fresh link", kind: "text", n: 1, steps: [], free: true },
  create_product: { label: "Writing the row", kind: "text", n: 1, steps: [], free: true },
  update_product: { label: "Patching the row", kind: "text", n: 1, steps: [], free: true },
};

/** Everything the view needs, as one JSON blob substituted into the template. */
export function loadingPlansJson(): string {
  return JSON.stringify({
    plans: LOADING_PLANS,
    platforms: SEARCH_PLATFORMS,
    perNetwork: CREDITS_PER_NETWORK,
    xiaohongshu: XIAOHONGSHU_CREDITS,
  });
}

/** Tools that fan out over an argument, for the tests that pin the wait. */
export const ARGUMENT_PRICED = Object.keys(LOADING_PLANS).filter((t) => !!LOADING_PLANS[t].perUnit);
