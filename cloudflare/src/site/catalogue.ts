/**
 * The tool catalogue, in one place.
 *
 * The landing page and the documentation both list every tool with its price.
 * When those lived in two arrays they drifted — the landing page silently lost
 * four tools for a release. One source, read by both, plus a test pinning the
 * prices to what nooticr-server actually charges.
 */

export type Group =
  | "read"
  | "understand"
  | "research"
  | "market"
  | "create"
  | "own"
  | "account";

export interface Tool {
  name: string;
  /**
   * Credits per call. 0 = free.
   *
   * Every price here is the sum of the upstream fetches the tool makes — the
   * server sells the fetch and leaves the reasoning to the caller's own model,
   * so a tool that fans out to two calls costs both and says so below. There
   * is no free-first-use flag any more: that grant belonged to the AI calls,
   * and there are none left to spend it on.
   */
  cost: number;
  group: Group;
  /** One line: what it returns. */
  desc: string;
  /** When to reach for it, and which neighbour to prefer instead. */
  when?: string;
  /** Named inputs, for the reference table. */
  args?: string;
  /**
   * Set on the tools billed in the workspace's **plan** AI credits rather
   * than in personal MCP credits — the ones that mirror a button in the
   * dashboard. They carry `cost: 0` because they spend none of the balance
   * this server sells, and `billing` so the pages can say which purse they
   * do come out of. Printing them as "free" would be the wrong claim in the
   * one direction that costs somebody money.
   */
  billing?: "plan";
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
    blurb: "The material behind a post you already have, for your own model to read.",
  },
  {
    id: "research",
    title: "Research a niche or creator",
    blurb: "Look across many posts to find the pattern.",
  },
  {
    id: "market",
    title: "Research a marketplace",
    blurb:
      "Read a category on twelve shopping sites: products, prices, star histograms and the review text itself.",
  },
  {
    id: "create",
    title: "Make something",
    blurb: "Turn what you learned into work you can publish.",
  },
  {
    id: "own",
    title: "Your own product",
    blurb:
      "Your own workspace: its products, its pipeline, its connected accounts and its performance.",
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
    name: "analyze_post_fast", cost: 2, group: "understand",
    args: "url",
    desc: "The post's transcript, caption and stats — everything but the pictures. Two fetches: get_social_media and get_post_transcript.",
    when: "The default. A credit less than analyze_post, and it carries everything the script and structure depend on.",
  },
  {
    name: "analyze_post", cost: 3, group: "understand",
    args: "url",
    desc: "Frames sampled across the video, as images your own model can look at, plus the transcript. Two fetches: get_post_frames (2) and get_post_transcript (1).",
    when: "The visuals are the point — framing, editing, on-screen text, pacing.",
  },
  {
    name: "understand_social_post", cost: 3, group: "understand",
    args: "url, focus?",
    desc: "The same frames and transcript as analyze_post, asked for what physically happens on screen rather than why it works.",
    when: "You need the events, not the strategy.",
  },
  {
    name: "analyze_comments", cost: 2, group: "understand",
    args: "url, limit?",
    desc: "The comment section, every comment with an id, and the taxonomy to label them with — sentiment, and whether each is praise, a complaint, a bug report, a question, a request, a comparison or spam.",
    when: "The goal is what to make next, not what people wrote. show_comment_review then draws your labels for free.",
  },
  {
    name: "compare_posts", cost: 1, group: "understand",
    args: "urls[] (2–5)",
    desc: "The first post with its stats, and the comparison left to you — fetch the rest with get_social_media at 1 credit each.",
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
    name: "suggest_creator_identity", cost: 2, group: "research",
    args: "handle, platform?, platforms?",
    desc: "Accounts on other networks that may be the same person, with the evidence for each. Suggests, never merges. 2 per network searched plus 2 for the handle.",
    when: "You have one confirmed handle and want the same creator elsewhere.",
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
    name: "find_hook_pattern", cost: 2, group: "research",
    args: "username, platform?, limit?",
    desc: "A creator's recent posts, fetched so their opening lines can be read as a set and turned into fill-in-the-blank templates.",
    when: "Reverse-engineering someone you want to learn from. The same single fetch as analyze_creator_profile, asked a narrower question.",
  },
  {
    name: "niche_report", cost: 2, group: "research",
    args: "niche, platform?, count?",
    desc: "Recent posts in the niche with their stats, so the dominant formats, the hook patterns and the gaps can be read off them.",
    when: "Entering a niche, or deciding what to make next.",
  },
  {
    name: "analyze_creator_profile", cost: 2, group: "research",
    args: "username, platform?, limit?, focus?",
    desc: "A creator's recent posts with their stats — the material of a teardown: niche, themes, hook formula, what over- and underperforms.",
    when: "A deep read of one account. Pair it with analyze_post on the posts whose visuals you want to see.",
  },

  // ── create ──
  {
    name: "write_hooks", cost: 2, group: "create",
    args: "url? or topic, count?, tone?",
    desc: "The source post and its transcript, to write openings against. With a topic and no url it fetches nothing and costs nothing.",
    when: "You know the subject and need openings to choose between.",
  },
  {
    name: "score_draft", cost: 0, group: "create",
    args: "draft, platform?",
    desc: "Your draft back with the rubric to hold it to — hook, clarity, payoff, specificity and fit, each scored 1-10, plus the fixes worth making. Free: the text is already yours, so there is nothing to fetch.",
    when: "Before filming, while changing it is still cheap. The only tool that runs before the content exists.",
  },
  {
    name: "repurpose_post", cost: 2, group: "create",
    args: "url, targets?",
    desc: "The source post and its transcript, to rewrite as an X thread, LinkedIn post, carousel, YouTube metadata or newsletter.",
    when: "A post worked and you want it on other surfaces.",
  },
  {
    name: "create_variants", cost: 2, group: "create",
    args: "url, count?, angle?",
    desc: "The post that worked, with its transcript, to build variants from — hook, the angle that changes, ordered shot beats, CTA.",
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
    name: "list_watchlist", cost: 0, group: "research",
    args: "\u2014",
    desc: "Who you are watching, and when you last caught up on each. Reads the stored list only.",
    when: "Before paying for a catch-up, or to find the exact handle to unwatch.",
  },
  {
    name: "catch_up_watchlist", cost: 2, group: "research",
    args: "limit?, platform?",
    desc: "What everyone you watch has posted since your last catch-up \u2014 2 credits per creator checked, not per call.",
    when: "Following a set of creators over time instead of re-reading each one.",
  },


  // ── read ──
  {
    name: "get_post_frames", cost: 2, group: "read",
    args: "url, count?",
    desc: "Frames from the post's video as real images, chosen by scene change rather than by the clock. Roughly 1,200 tokens of context each.",
    when: "The frames are all you want. analyze_post pairs them with the transcript for one credit more.",
  },

  // ── understand ──
  {
    name: "why_did_this_underperform", cost: 3, group: "understand",
    args: "url",
    desc: "One post read against the creator's own recent median, so the answer can be \u201cthis is an ordinary result, not a failure\u201d.",
    when: "You have one post and nothing to compare it with; compare_posts is for two URLs you already picked.",
  },
  {
    name: "show_post_analysis", cost: 0, group: "understand",
    args: "the analysis you wrote",
    desc: "Draws the analysis you wrote after analyze_post or analyze_post_fast handed you the material. Fetches nothing.",
    when: "After you have read the frames and the transcript \u2014 not instead of reading them.",
  },
  {
    name: "show_comment_review", cost: 0, group: "understand",
    args: "your labelled comments",
    desc: "Draws the comment classifications you produced from analyze_comments, each with its sentiment and category, sortable.",
    when: "After you have classified the comments.",
  },
  {
    name: "show_compared_posts", cost: 0, group: "understand",
    args: "your comparison",
    desc: "Draws the comparison you wrote, with a badge on the winner, what differed and the next experiment.",
    when: "After compare_posts and the fetches you made yourself.",
  },

  // ── research ──
  {
    name: "detect_spoken_mentions", cost: 2, group: "research",
    args: "url, brands?, language?",
    desc: "Every brand named out loud in one video, for your model to find in the transcript beside the caption \u2014 1 credit for the transcript and 1 for the caption, nothing when no transcript can be made.",
    when: "A brand may be said on camera but never written; you have the video's URL.",
  },
  {
    name: "search_spoken_mentions", cost: 2, group: "research",
    args: "term, platforms?, handles?, maxTranscripts?",
    desc: "Finds a term said out loud on camera rather than written anywhere \u2014 2 credits per platform searched, 2 per creator handle checked and 1 per transcript actually fetched.",
    when: "A term might be spoken but never typed; search_mentions reads written text only.",
  },
  {
    name: "find_people_with_problem", cost: 2, group: "research",
    args: "problem, platforms?, shapes?",
    desc: "People describing a problem in their own words \u2014 2 credits per search, and each platform is searched once per query shape, three by default, so 6 per platform.",
    when: "Demand research: who has the pain, in what words. Not searchable here: LinkedIn.",
  },
  {
    name: "answer_my_audience", cost: 2, group: "research",
    args: "username, platform?, limit?",
    desc: "Your own recent posts and the comments under them, so you can write the replies \u2014 2 credits for the post list plus 2 per post opened, 14 at the default of 6.",
    when: "The job is answering your own audience rather than reading about strangers.",
  },
  {
    name: "show_audience_replies", cost: 0, group: "research",
    args: "your drafted replies",
    desc: "Draws the replies you drafted, grouped under the post each comment was left on. Sends nothing.",
    when: "After drafting, not instead of drafting.",
  },
  {
    name: "track_creator", cost: 2, group: "research",
    args: "username, platform?, window?",
    desc: "One rival's recent posts scored against their own median, marking what is new since your last check.",
    when: "A rival you follow over time. Flat price, whatever the window size.",
  },
  {
    name: "compare_creators", cost: 2, group: "research",
    args: "usernames[] (2\u20135), platform?",
    desc: "Several creators on one window, each against their own median \u2014 one post list per creator, so 2 credits each and 4\u201310 in total.",
    when: "\u201cIs their hit rate better than mine\u201d; track_creator is one creator alone.",
  },
  {
    name: "watchlist_standings", cost: 2, group: "research",
    args: "limit?, platform?",
    desc: "How everyone on your watchlist is doing against their own median \u2014 2 credits per creator, so the price is the size of your list. It confirms before spending.",
    when: "The weekly \u201cwho is accelerating\u201d; catch_up_watchlist is what is new rather than how it did.",
  },
  {
    name: "show_standings", cost: 0, group: "research",
    args: "your standings",
    desc: "Draws the standings you read out of compare_creators or watchlist_standings \u2014 one row per creator, their median, how often they beat it and by how much.",
    when: "After you have read the numbers.",
  },
  {
    name: "who_should_i_work_with", cost: 2, group: "research",
    args: "niche, platform?, seed?",
    desc: "A shortlist of creators worth approaching, with what to check before you do. 4 credits with a seed creator.",
    when: "Building a list to vet. It says what a full vet would cost rather than faking one.",
  },
  {
    name: "show_collab_shortlist", cost: 0, group: "research",
    args: "your scored creators",
    desc: "Draws the creators you scored after vetting, ranked, with the scores attributed to you rather than to nooticr.",
    when: "After who_should_i_work_with and your own vetting.",
  },
  {
    name: "what_should_i_make_next", cost: 2, group: "research",
    args: "niche, platform?, limit?",
    desc: "The supply side and the demand side together \u2014 2 credits for the post list, 2 per post read and 2 for the sweep, 12 at the default of 4.",
    when: "Deciding what to film; niche_report covers the supply half alone.",
  },
  {
    name: "create_brand_watch", cost: 0, group: "research",
    args: "term or handle, kind?, cadence?, budgetCredits?, deliverTo?",
    desc: "Schedules a recurring sweep and emails only what is new. Free to create; each run bills like the tool it repeats \u2014 2 credits per network (5 for Xiaohongshu), or a flat 2 for a competitor watch.",
    when: "You want the answer to keep arriving. It quotes the cost and asks before creating anything.",
  },
  {
    name: "list_brand_watches", cost: 0, group: "research",
    args: "\u2014",
    desc: "Every watch you have: cadence, cost per run, credits spent, runs made, next run due, and whether it is stopped.",
    when: "Before creating one \u2014 a second watch on the same term is a second recurring charge for the same answer.",
  },
  {
    name: "stop_brand_watch", cost: 0, group: "research",
    args: "id",
    desc: "Stops a watch immediately: the run that was due does not happen and nothing further is charged.",
    when: "Works at a zero balance, because someone out of credits is exactly who needs to turn off what is spending them.",
  },
  {
    name: "mention_trend", cost: 0, group: "research",
    args: "watchId",
    desc: "The series a brand watch has built up over its runs, per network, with the mentions more than one run has seen. Free \u2014 the sweeps were billed when they ran.",
    when: "Reading direction out of a watch you already pay for.",
  },
  {
    name: "show_trend", cost: 0, group: "research",
    args: "your read of the series",
    desc: "Draws the trend as a chart with your own read of what changed. Says so when the series is too short to call.",
    when: "After mention_trend.",
  },
  {
    name: "prepare_handoff", cost: 0, group: "research",
    args: "the items you classified",
    desc: "Turns a bug report in a comment into the exact text to file in GitHub, Jira or Linear, with the quote framed as third-party evidence and a search string to check for duplicates first.",
    when: "You classified something worth filing. Fetches nothing and costs nothing.",
  },

  // ── market ──
  // Twelve shopping sites behind one `marketplace` argument rather than twelve
  // near-identical tools, so a model picks a site instead of picking a tool.
  {
    name: "scan_marketplace_category", cost: 3, group: "market",
    args: "marketplace, query? or items[], limit?, reviews?, market?",
    desc: "A whole category from one of twelve marketplaces: products, prices, star histograms and the review text, with the arithmetic over them. 3 credits per product collected \u2014 a product with reviews is a real browser render behind the site's bot defences.",
    when: "Sizing up a category or a competitive set. Collection runs in the background; poll marketplace_scan_status for free.",
  },
  {
    name: "marketplace_scan_status", cost: 0, group: "market",
    args: "marketplace, scanId, waitSeconds?",
    desc: "Picks up a scan that was still running. Free: it is the poll the scan asked for, and repeating it is how a scan gets more time.",
    when: "A scan came back incomplete \u2014 which the first call usually does.",
  },
  {
    name: "get_marketplace_product", cost: 3, group: "market",
    args: "marketplace, item, market?",
    desc: "One product by id or URL: price, rating, the full star histogram, specs and the review text.",
    when: "A single product; scan_marketplace_category collects many in one job.",
  },
  {
    name: "scan_amazon_category", cost: 3, group: "market",
    args: "query? or asins[], limit?, reviews?, domain?",
    desc: "The same as scan_marketplace_category for Amazon, plus Amazon's own review-aspect counts. 3 credits per listing collected.",
    when: "Amazon specifically. Any other site goes through scan_marketplace_category.",
  },
  {
    name: "amazon_scan_status", cost: 0, group: "market",
    args: "scanId, waitSeconds?",
    desc: "Picks up an Amazon scan that was still running. Free, and repeatable.",
    when: "The Amazon half of marketplace_scan_status.",
  },
  {
    name: "get_amazon_product", cost: 3, group: "market",
    args: "asin or url, domain?",
    desc: "One Amazon listing: price, rating, star histogram, features, specs, Amazon's review digest and aspect breakdown, and the review text.",
    when: "A single listing.",
  },
  {
    name: "show_amazon_category_insights", cost: 0, group: "market",
    args: "your category read",
    desc: "Draws the read you wrote beside the listings and their reviews, so a person can click a product and check any claim against the text it came from.",
    when: "After you have read the reviews. The scores shown are attributed to you, not presented as a nooticr rating of anyone's product.",
  },

  // ── create ──
  {
    name: "show_hooks", cost: 0, group: "create",
    args: "the hooks you wrote",
    desc: "Draws the openings you wrote, each with the device it uses and who it stops.",
    when: "After write_hooks.",
  },
  {
    name: "show_variants", cost: 0, group: "create",
    args: "the variants you wrote",
    desc: "Draws each variant's hook, the angle that changes, its shot beats and its call to action.",
    when: "After create_variants.",
  },
  {
    name: "show_repurposed_post", cost: 0, group: "create",
    args: "the copy you wrote",
    desc: "Draws the rewritten copy, one entry per surface you rewrote it for.",
    when: "After repurpose_post.",
  },
  {
    name: "review_post", cost: 0, group: "create",
    args: "postId, or appId plus draft fields",
    desc: "Scores a post before you publish: hook strength, an optional A-vs-B hook comparison, aesthetic and storytelling notes, rewritten hook and caption suggestions. Nothing is published.",
    when: "The last check before it goes out. Free, same as the dashboard's own pre-publish review.",
  },
  {
    name: "draft_post", cost: 0, group: "create", billing: "plan",
    args: "topic, appId?, platform?",
    desc: "A full draft for your own product \u2014 hook, caption, hashtags and a per-slide script. Saves and schedules nothing.",
    when: "Billed like the dashboard's Draft Post button: your workspace's plan AI credits, not your MCP balance.",
  },
  {
    name: "generate_captions", cost: 0, group: "create", billing: "plan",
    args: "videoId or appId",
    desc: "A transcript plus start/end-timed caption lines for your own video. Burns nothing onto the video.",
    when: "Billed like the dashboard's Generate Captions button: plan AI credits.",
  },
  {
    name: "generate_content_plan", cost: 0, group: "create", billing: "plan",
    args: "appId?",
    desc: "A weekly plan grounded in your own post history. Saves it; schedules and publishes nothing.",
    when: "Billed like the dashboard's Content Plan button: plan AI credits. Read it back later with get_content_plan.",
  },
  {
    name: "get_content_plan", cost: 0, group: "create",
    args: "appId?",
    desc: "The saved weekly plan, or null when none has been generated yet. Read-only.",
    when: "Reading back what generate_content_plan produced. Free even when a plan exists.",
  },
  {
    name: "growth_brief", cost: 0, group: "create", billing: "plan",
    args: "appId?",
    desc: "What is working, what is not, the wins, the risks and concrete next actions \u2014 grounded in your real post history and synced analytics. Read-only.",
    when: "Billed like the dashboard's Growth Brief button: plan AI credits.",
  },

  // ── own ──
  {
    name: "list_own_apps", cost: 0, group: "own",
    args: "\u2014",
    desc: "Every product in your own workspace \u2014 id, name, niche, product type. Reads only your own workspace.",
    when: "First, when your workspace has more than one product and another tool here asks for an appId.",
  },
  {
    name: "create_product", cost: 0, group: "own",
    args: "name, niche?, product_type?, website_url?",
    desc: "Creates a product in the session's own workspace \u2014 the row every other tool here needs. Free: no AI call, just a row.",
    when: "A fresh workspace has none. It cannot create in a workspace you could name.",
  },
  {
    name: "update_product", cost: 0, group: "own",
    args: "appId?, plus the fields to change",
    desc: "Patches your product's fields; omitted arguments leave their column unchanged, and the result lists what was actually written.",
    when: "A misspelled field shows up as one that did not change rather than as a silent no-op.",
  },
  {
    name: "analyze_product", cost: 0, group: "own", billing: "plan",
    args: "appId?",
    desc: "Fetches your product's own website, reads its recent posts and performance, and writes the result as the product's brand playbook.",
    when: "10 of your workspace's plan AI credits, first analysis free per workspace. Runs as a job \u2014 poll analyze_product_status.",
  },
  {
    name: "analyze_product_status", cost: 0, group: "own",
    args: "jobId",
    desc: "Polls an analyze_product job: pending, thinking, done or error, and the playbook once it is done.",
    when: "Free to poll \u2014 the cost was charged when the job started.",
  },
  {
    name: "get_brand_playbook", cost: 0, group: "own",
    args: "appId?",
    desc: "The product's brand playbook, if one has been configured in the dashboard or written by analyze_product. Returns available: false when none exists.",
    when: "Grounding anything you write in what the brand has already decided.",
  },
  {
    name: "get_scheduled_posts", cost: 0, group: "own",
    args: "appId?, status?",
    desc: "What is queued to publish \u2014 title, status, scheduled time, approval status. Publishes and changes nothing.",
    when: "The pipeline, not the history; get_post_performance is what already went out.",
  },
  {
    name: "get_post_performance", cost: 0, group: "own",
    args: "appId?, limit?",
    desc: "Your own published posts with their engagement counters \u2014 views, likes, comments, shares, platform, date.",
    when: "The raw history. Pair it with growth_brief for an interpretation.",
  },
  {
    name: "get_video_stats", cost: 0, group: "own",
    args: "appId?",
    desc: "Your most recently synced video stats across every connected creator, plus a running total. Reads the last sync; triggers no new one.",
    when: "A quick total without spending anything.",
  },
  {
    name: "get_google_analytics", cost: 0, group: "own",
    args: "appId?",
    desc: "Your GA4 sync as of its last sync: property, date range, rows synced.",
    when: "Checking your GA4 data is flowing into nooticr.",
  },
  {
    name: "get_search_console_data", cost: 0, group: "own",
    args: "appId?",
    desc: "Search Console clicks, impressions and top queries as of the last sync.",
    when: "Whether people search for what your content is about.",
  },
  {
    name: "get_posthog_analytics", cost: 0, group: "own",
    args: "appId?",
    desc: "Your PostHog pageview trend as of the last sync.",
    when: "Lining a post's date up against traffic to your site.",
  },
  {
    name: "list_social_connections", cost: 0, group: "own",
    args: "\u2014",
    desc: "Which social accounts your workspace has connected and what each one is allowed to do \u2014 read, publish, manage comments \u2014 plus which platforms can be connected at all.",
    when: "Before anything that needs an account linked.",
  },
  {
    name: "connect_social_account", cost: 0, group: "own",
    args: "platform",
    desc: "A link to open so the user can connect one account. They approve at the provider; no credential passes through this tool.",
    when: "list_social_connections showed the platform is connectable and not yet connected.",
  },

  // ── account ──
  {
    name: "nooticr_getting_started", cost: 0, group: "account",
    args: "—",
    desc: "Where this account stands (balance, connections, watchlist) and the next calls worth making, with prices.",
    when: "The first call, or whenever you are not sure what to try.",
  },
  {
    name: "check_nooticr_credits", cost: 0, group: "account",
    args: "—",
    desc: "Balance and billing URL.",
    when: "Before a run of paid calls.",
  },
  {
    name: "list_tool_runs", cost: 0, group: "account",
    args: "tool?, from?, to?, success?, minCredits?, limit?, before?, scope?",
    desc: "Your tool-call history: what ran, whether it worked, and the credits each call actually took.",
    when: "A balance moved more than expected.",
  },
  {
    name: "get_tool_run", cost: 0, group: "account",
    args: "id",
    desc: "One run by id, with its full error.",
    when: "Looking closely at one charge from list_tool_runs.",
  },
  {
    name: "nooticr_login", cost: 0, group: "account",
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
