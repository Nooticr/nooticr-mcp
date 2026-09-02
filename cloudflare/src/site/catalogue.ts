/**
 * The tool catalogue, in one place.
 *
 * The landing page and the documentation both list every tool with its price.
 * When those lived in two arrays they drifted — the landing page silently lost
 * four tools for a release. One source, read by both, plus a test pinning the
 * prices to what orchyn-server actually charges.
 */

export type Group = "read" | "understand" | "research" | "create" | "account";

export interface Tool {
  name: string;
  /** Credits per call. 0 = free. */
  cost: number;
  /** AI tools are free the first time each is used. */
  freeFirstUse?: boolean;
  group: Group;
  /** One line: what it returns. */
  desc: string;
  /** When to reach for it, and which neighbour to prefer instead. */
  when?: string;
  /** Named inputs, for the reference table. */
  args?: string;
}

export const GROUPS: { id: Group; title: string; blurb: string }[] = [
  {
    id: "read",
    title: "Read a post",
    blurb: "Retrieve what a post contains. No interpretation, no AI.",
  },
  {
    id: "understand",
    title: "Understand a post",
    blurb: "AI over a post you already have. Every AI tool is free the first time you use it.",
  },
  {
    id: "research",
    title: "Research a niche or creator",
    blurb: "Look across many posts to find the pattern.",
  },
  {
    id: "create",
    title: "Make something",
    blurb: "Turn what you learned into work you can publish.",
  },
  {
    id: "account",
    title: "Account",
    blurb: "Balance and billing. Never billed.",
  },
];

export const TOOLS: Tool[] = [
  // ── read ──
  {
    name: "get_social_media", cost: 1, group: "read",
    args: "url",
    desc: "A post's media, caption, author and engagement counts.",
    when: "You want the post itself, not an interpretation of it.",
  },
  {
    name: "get_post_transcript", cost: 1, group: "read",
    args: "url, language?",
    desc: "The words actually spoken, read from the post's caption track (TikTok, YouTube).",
    when: "The exact wording matters — a hook, a claim, a CTA. Cheaper and more literal than any AI tool.",
  },
  {
    name: "get_post_comments", cost: 2, group: "read",
    args: "url, limit?",
    desc: "Top comments, the themes the platform clusters them into, and which the creator pinned or liked.",
    when: "You want to read what people wrote. Use analyze_comments to have it synthesised instead.",
  },

  // ── understand ──
  {
    name: "analyze_post_fast", cost: 2, freeFirstUse: true, group: "understand",
    args: "url",
    desc: "Hook strength, script structure, why it works, weaknesses, variations — from the transcript and stats.",
    when: "The default. A third the price of analyze_post and just as strong on script and structure.",
  },
  {
    name: "analyze_post", cost: 6, freeFirstUse: true, group: "understand",
    args: "url",
    desc: "The same analysis with the video actually watched.",
    when: "The visuals are the point — framing, editing, on-screen text, pacing.",
  },
  {
    name: "understand_social_post", cost: 6, freeFirstUse: true, group: "understand",
    args: "url, focus?",
    desc: "A factual description of what physically happens on screen.",
    when: "You need the events, not the strategy.",
  },
  {
    name: "analyze_comments", cost: 6, freeFirstUse: true, group: "understand",
    args: "url, limit?",
    desc: "Sentiment, recurring themes, questions asked, objections raised, content requested, follow-up ideas.",
    when: "The goal is what to make next, not what people wrote.",
  },
  {
    name: "compare_posts", cost: 8, freeFirstUse: true, group: "understand",
    args: "urls[] (2–5)",
    desc: "Which post won, what actually differed, shared strengths, testable lessons, one next experiment.",
    when: "Performance differs and you need to know why.",
  },

  // ── research ──
  {
    name: "discover_social_posts", cost: 2, group: "research",
    args: "niche, platform?, limit?, offset?",
    desc: "Recent posts for a niche across seven networks, with pagination.",
    when: "You want posts to look at. Use niche_report for the pattern across them.",
  },
  {
    name: "get_user_posts", cost: 2, group: "research",
    args: "username, platform?, limit?",
    desc: "One creator's recent posts with stats.",
    when: "Scanning an account.",
  },
  {
    name: "search_creators", cost: 2, group: "research",
    args: "keyword, platform?, count?",
    desc: "Creators by niche or keyword, with follower and engagement data.",
    when: "You know the niche but not the names.",
  },
  {
    name: "get_similar_creators", cost: 2, group: "research",
    args: "username, platform?",
    desc: "Lookalikes for a creator that already fits.",
    when: "One creator works and you want more like them.",
  },
  {
    name: "discover_sounds", cost: 2, group: "research",
    args: "keyword, platform?, count?",
    desc: "Trending audio with playable previews and usage counts.",
    when: "Picking audio, or spotting a sound before it peaks.",
  },
  {
    name: "discover_hashtags", cost: 2, group: "research",
    args: "country?, days?, count?, industryId?",
    desc: "Trending hashtags with volumes and whether each is rising, cooling or steady.",
    when: "Choosing tags, or catching a wave early.",
  },
  {
    name: "find_hook_pattern", cost: 2, freeFirstUse: true, group: "research",
    args: "username, platform?, limit?",
    desc: "A creator's repeatable formula as fill-in-the-blank templates.",
    when: "Reverse-engineering someone you want to learn from. Never watches the videos, so far cheaper than the profile teardown.",
  },
  {
    name: "niche_report", cost: 3, freeFirstUse: true, group: "research",
    args: "niche, platform?, count?",
    desc: "Dominant formats, hook patterns, what over- and underperforms, the gaps nobody fills.",
    when: "Entering a niche, or deciding what to make next.",
  },
  {
    name: "analyze_creator_profile", cost: 15, freeFirstUse: true, group: "research",
    args: "username, platform?, limit?, focus?",
    desc: "Full teardown: fetches recent posts, watches up to three, synthesises niche, themes and what works.",
    when: "A deep read where the visuals matter.",
  },

  // ── create ──
  {
    name: "write_hooks", cost: 2, freeFirstUse: true, group: "create",
    args: "url? or topic, count?, tone?",
    desc: "Alternative opening lines, each with the mechanism it uses and who it stops.",
    when: "You know the subject and need openings to choose between.",
  },
  {
    name: "score_draft", cost: 2, freeFirstUse: true, group: "create",
    args: "draft, platform?",
    desc: "Hook, clarity and payoff scores, concrete fixes, a rewritten hook and a tightened draft.",
    when: "Before filming, while changing it is still cheap. The only tool that runs before the content exists.",
  },
  {
    name: "repurpose_post", cost: 2, freeFirstUse: true, group: "create",
    args: "url, targets?",
    desc: "One post as an X thread, LinkedIn post, carousel, YouTube metadata or newsletter.",
    when: "A post worked and you want it on other surfaces.",
  },
  {
    name: "create_variants", cost: 3, freeFirstUse: true, group: "create",
    args: "url, count?, angle?",
    desc: "Variants to film next — hook, the angle that changes, ordered shot beats, CTA.",
    when: "Moving from why it worked to what to make.",
  },

  // ── brand monitoring ──
  {
    name: "search_mentions", cost: 2, group: "research",
    args: "term, platforms?, since?, limit?, offset?",
    desc: "Brand monitoring: every comment that names a term, across nine networks at once, grouped under the post it was left on and filtered to a date window you choose \u2014 2 credits per network searched (5 for Xiaohongshu), not per call.",
    when: "Watching what is said about a brand, product or person; discover_social_posts is for one platform.",
  },

  // ── watchlist ──
  // The only tools that remember anything between calls: everything else here
  // answers "what is true now", and these answer "what changed since I asked".
  {
    name: "watch_creator", cost: 0, group: "research",
    args: "username, platform?, note?",
    desc: "Add a creator to your watchlist. Stores the handle only \u2014 nothing is fetched.",
    when: "You want to follow someone over time rather than look once.",
  },
  {
    name: "unwatch_creator", cost: 0, group: "research",
    args: "username, platform?",
    desc: "Drop a creator from the watchlist.",
    when: "They should no longer appear in the catch-up.",
  },
  {
    name: "catch_up_watchlist", cost: 2, group: "research",
    args: "limit?, platform?",
    desc: "What everyone you watch has posted since your last catch-up \u2014 2 credits per creator checked, not per call.",
    when: "Following a set of creators over time instead of re-reading each one.",
  },

  // ── account ──
  {
    name: "check_orchyn_credits", cost: 0, group: "account",
    args: "—",
    desc: "Balance, billing URL, and which free first uses remain.",
    when: "Before a run of paid calls.",
  },
  {
    name: "buy_orchyn_credits", cost: 0, group: "account",
    args: "—",
    desc: "A Stripe Checkout URL for a credit pack. Credits land automatically after payment.",
    when: "The balance is short.",
  },
  {
    name: "orchyn_login", cost: 0, group: "account",
    args: "—",
    desc: "Re-link the account.",
    when: "A call fails with an authentication error.",
  },
];

export const PACKS = [
  { name: "Starter", price: "$15", credits: 600, per: "$0.025" },
  { name: "Pro", price: "$40", credits: 2000, per: "$0.020" },
  { name: "Scale", price: "$85", credits: 5000, per: "$0.017" },
];

export function toolsIn(group: Group): Tool[] {
  return TOOLS.filter((t) => t.group === group);
}
