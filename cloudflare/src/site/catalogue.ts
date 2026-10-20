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
  billing?: "plan" | "quote";
  /**
   * `"quote"`: the price depends on the arguments, so the first call returns a
   * quote in credits and nothing is charged until the user confirms. Carries
   * `cost: 0` for the same reason as `"plan"`; the pages print "Quoted".
   */
  /**
   * Overrides the cost cell on the docs page for a tool whose price depends
   * on its arguments (free with one input, billed with another). `cost` stays
   * 0 so the landing page lists only flat-priced tools.
   */
  costNote?: string;
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
    name: "get_social_post", cost: 1, group: "read",
    args: "url",
    desc: "A post's media, caption, author and engagement counts.",
    when: "You want the post itself, not an interpretation of it.",
  },
  {
    name: "get_post_transcript", cost: 1, group: "read",
    args: "url, language?",
    desc: "The words actually spoken: read from the caption track where a platform publishes one (TikTok, Douyin, YouTube), heard from the audio everywhere else.",
    when: "The exact wording matters — a hook, a claim, a CTA.",
  },
  {
    name: "get_post_comments", cost: 2, group: "read",
    args: "url, limit?",
    desc: "Top comments, the themes the platform clusters them into, and which the creator pinned or liked.",
    when: "You want to read what people wrote. Use summarize_post_comments to have it synthesised instead.",
  },

  // ── understand ──
  {
    name: "analyze_post_text", cost: 2, group: "understand",
    args: "url",
    desc: "The post's transcript, caption and stats — everything but the pictures. Two fetches: the post itself and get_post_transcript.",
    when: "The words and numbers answer the question. 2 credits, without frames, and it carries everything the script and structure depend on.",
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
    name: "summarize_post_comments", cost: 2, group: "understand",
    args: "url, limit?",
    desc: "The comment section, every comment with an id, and the taxonomy to label them with — sentiment, and whether each is praise, a complaint, a bug report, a question, a request, a comparison or spam.",
    when: "The goal is what to make next, not what people wrote. show_comment_review then draws your labels for free.",
  },
  {
    name: "compare_social_posts", cost: 1, group: "understand",
    args: "urls[] (2–5)",
    desc: "The first post with its stats, and the comparison left to you — fetch the rest with get_social_post at 1 credit each.",
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
    name: "generate_hook_ideas", cost: 2, group: "create",
    args: "url? or topic, count?, tone?",
    desc: "The source post and its transcript, to write openings against. With a topic and no url it fetches nothing and costs nothing.",
    when: "You know the subject and need openings to choose between.",
  },
  {
    name: "evaluate_social_draft", cost: 0, group: "create",
    args: "draft, platform?",
    desc: "Your draft back with the rubric to hold it to — hook, clarity, payoff, specificity and fit, each scored 1-10, plus the fixes worth making. Free: the text is already yours, so there is nothing to fetch.",
    when: "Before filming, while the draft can still be changed.",
  },
  {
    name: "adapt_post_for_platform", cost: 2, group: "create",
    args: "url, targets?",
    desc: "The source post and its transcript, to rewrite as an X thread, LinkedIn post, carousel, YouTube metadata or newsletter.",
    when: "A post worked and you want it on other surfaces.",
  },
  {
    name: "generate_post_variants", cost: 2, group: "create",
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
    name: "save_creator_identity", cost: 0, group: "research",
    args: "name, accounts, note?",
    desc: "Saves accounts on different networks as one person, once that is confirmed. An account already in another identity is refused, never moved.",
    when: "suggest_creator_identity found the same person elsewhere and you confirmed it.",
  },
  {
    name: "list_creator_identities", cost: 0, group: "research",
    args: "\u2014",
    desc: "Every saved creator identity, with its accounts and the evidence for each.",
    when: "To find an identity's id, or which accounts are one person.",
  },
  {
    name: "update_creator_identity", cost: 0, group: "research",
    args: "identityId, name?, note?, addAccounts?, removeAccounts?",
    desc: "Renames a saved identity, or adds or removes accounts.",
    when: "A saved identity is wrong or incomplete.",
  },
  {
    name: "delete_creator_identity", cost: 0, group: "research",
    args: "identityId",
    desc: "Deletes a saved identity. The accounts and their watchlist entries stay.",
    when: "The accounts turned out not to be one person.",
  },
  {
    name: "watch_creator_identity", cost: 0, group: "research",
    args: "identityId, note?",
    desc: "Puts every account of a saved identity on your watchlist, grouped as one person.",
    when: "You want to follow a person across networks, not one account.",
  },
  {
    name: "unwatch_creator_identity", cost: 0, group: "research",
    args: "identityId",
    desc: "Takes every account of a saved identity off your watchlist.",
    when: "That person should no longer appear in the catch-up.",
  },
  {
    name: "catch_up_watchlist", cost: 2, group: "research",
    args: "limit?, platform?",
    desc: "What everyone you watch has posted since your last catch-up \u2014 2 credits per creator checked, not per call.",
    when: "Following a set of creators over time.",
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
    name: "benchmark_post", cost: 3, group: "understand",
    args: "url",
    desc: "One post read against the creator's own recent median, so the answer can be \u201cthis is an ordinary result, not a failure\u201d.",
    when: "You have one post and nothing to compare it with; compare_social_posts is for two URLs you already picked.",
  },
  {
    name: "show_post_analysis", cost: 0, group: "understand",
    args: "the analysis you wrote",
    desc: "Draws the analysis you wrote after analyze_post or analyze_post_text handed you the material. Fetches nothing.",
    when: "After you have read the frames and the transcript.",
  },
  {
    name: "show_comment_review", cost: 0, group: "understand",
    args: "your labelled comments",
    desc: "Draws the comment classifications you produced from summarize_post_comments, each with its sentiment and category, sortable.",
    when: "After you have classified the comments.",
  },
  {
    name: "show_compared_posts", cost: 0, group: "understand",
    args: "your comparison",
    desc: "Draws the comparison you wrote, with a badge on the winner, what differed and the next experiment.",
    when: "After compare_social_posts and the fetches you made yourself.",
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
    name: "measure_audience_overlap", cost: 4, group: "research",
    args: "usernames, platform?, postsPerCreator?",
    desc: "The commenters two accounts share, and the overlap in each direction \u2014 4 credits for the two post lists plus 2 per post opened, 16 at the default of 3 each.",
    when: "Deciding between collaboration finalists: commenters, not followers, so it says how thin the sample is.",
  },
  {
    name: "answer_my_audience", cost: 2, group: "research",
    args: "username, platform?, limit?",
    desc: "Your own recent posts and the comments under them, so you can write the replies \u2014 2 credits for the post list plus 2 per post opened, 14 at the default of 6.",
    when: "The job is answering your own audience rather than reading about strangers.",
  },
  {
    name: "list_comments_to_answer", cost: 0, group: "own",
    args: "platform?, influencerId?, postId?, sinceDays?, limit?, includeAnswered?",
    desc: "Recent comments on your own connected account that nobody has answered yet, newest first. Read-only; sends nothing. Free.",
    when: "You want to answer your audience and the account is connected with comment management.",
  },
  {
    name: "draft_comment_reply", cost: 0, costNote: "Free with your text, else 1 cr", group: "own",
    args: "platform, commentId, postId, text?, guidance?, appId?",
    desc: "Stores a reply to one comment; nothing is posted. Free with your own text, 1 credit when nooticr writes it in your brand voice, with its rationale; refused at no cost when there is no brand voice, product or guidance to write from. Returns a draftId and confirmationToken.",
    when: "After list_comments_to_answer, to have a reply ready for the user to read.",
  },
  {
    name: "post_comment_reply", cost: 0, group: "own",
    args: "draftId, confirm, confirmationToken",
    desc: "Posts a stored draft as the user's own account. Only after the user has agreed to the exact text. Each comment is answered at most once. Free.",
    when: "The user has read the draft and said to send it.",
  },
  {
    name: "show_audience_replies", cost: 0, group: "research",
    args: "your drafted replies",
    desc: "Draws the replies you drafted, grouped under the post each comment was left on. Sends nothing.",
    when: "After drafting.",
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
    when: "Comparing hit rates between two to five creators; track_creator covers one creator.",
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
    name: "find_collaborators", cost: 2, group: "research",
    args: "niche, platform?, seed?",
    desc: "A shortlist of creators worth approaching, with what to check before you do. 4 credits with a seed creator.",
    when: "Building a list to vet. It says what a full vet would cost rather than faking one.",
  },
  {
    name: "show_collab_shortlist", cost: 0, group: "research",
    args: "your scored creators",
    desc: "Draws the creators you scored after vetting, ranked, with the scores attributed to you rather than to nooticr.",
    when: "After find_collaborators and your own vetting.",
  },
  {
    name: "content_ideas_from_audience", cost: 2, group: "research",
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
    name: "creative_assets_list", cost: 0, group: "own",
    args: "appId?, kind?, briefId?, since?, limit?, cursor?",
    desc: "The creative assets (voice-overs, images, videos, composites) generated in your workspace, newest first. Free.",
    when: "You want to see or reuse what was already generated before making more.",
  },
  {
    name: "creative_voices_search", cost: 0, group: "own",
    args: "query?, language?, accent?, gender?, age?, useCase?, limit?",
    desc: "Search ElevenLabs' voice library for a voice to use in a voice-over. Library voices only. Free.",
    when: "Before creative_voiceover: it needs a voiceRef from here.",
  },
  {
    name: "creative_voiceover", cost: 0, group: "own", billing: "quote",
    args: "appId, text, voiceRef?, quality?, confirm?, confirmationToken?",
    desc: "A voice-over with word timings. The first call returns a credit quote; nothing is charged until you confirm.",
    when: "You have a script and a voice from creative_voices_search.",
  },
  {
    name: "creative_sfx", cost: 0, group: "own", billing: "quote",
    args: "appId, description, durationSeconds?, confirm?, confirmationToken?",
    desc: "A short sound effect from a description. The first call returns a credit quote; nothing is charged until you confirm.",
    when: "You need a one-off sound, not a music bed.",
  },
  {
    name: "creative_music", cost: 0, group: "own", billing: "quote",
    args: "appId, prompt, durationSeconds, confirm?, confirmationToken?",
    desc: "An instrumental music bed of 5-60 seconds, generated as a job. The first call returns a credit quote; nothing is charged until you confirm.",
    when: "You need background music; describe mood and tempo, not artists. Poll creative_job_status for the result.",
  },
  {
    name: "creative_video", cost: 0, group: "own", billing: "quote",
    args: "appId, prompt, durationSeconds?, aspect?, firstFrameAssetId?, referenceAssetIds?, audio?, confirm?, confirmationToken?",
    desc: "One short draft video clip (3-30 s), generated as a job. The first call returns a credit quote; nothing is charged until you confirm.",
    when: "You need a short clip, optionally from a first-frame image; add voice-over and music with the audio tools. Poll creative_job_status for the result.",
  },
  {
    name: "creative_compose", cost: 0, group: "own", billing: "quote",
    args: "appId, segments, aspect?, draft?, voiceoverAssetId?, captions?, music?, sfx?, safeZone?, brandKit?, endCard?, output?, confirm?, confirmationToken?",
    desc: "Cuts your creative assets into one finished vertical video or still, with captions, brand colours, music and an end card. One flat render, quoted first. Never publishes.",
    when: "You have clips, images or audio and want them assembled into one post. Poll creative_job_status for the result.",
  },
  {
    name: "creative_settings_get", cost: 0, group: "own",
    args: "appId?",
    desc: "Your workspace's creative spend caps and what was spent in the last 24 hours and this month. Free.",
    when: "A creative call was refused for a cap, or before a large batch.",
  },
  {
    name: "creative_brief_create", cost: 0, group: "own",
    args: "appId, brief, platforms, audience?, hook?, voiceNotes?, variants?, pick?, budgetCredits?, slotAt?, influencerId?",
    desc: "Files a creative brief for one product; your Creative Producer employee or a teammate works it. Free.",
    when: "You want creative made for a product rather than generating it yourself.",
  },
  {
    name: "creative_brief_list", cost: 0, group: "own",
    args: "status?, appId?, limit?",
    desc: "Your creative briefs with their drafts, picks and deliveries. Free.",
    when: "To see what is queued, waiting for a pick or delivered.",
  },
  {
    name: "creative_brief_update", cost: 0, group: "own",
    args: "briefId, status?, notes?, draftAssetIds?, deliveredAssetIds?, actionIds?, creditsSpent?",
    desc: "Moves a creative brief along and attaches what was made. Free.",
    when: "Work on a brief started, produced drafts, or finished.",
  },
  {
    name: "creative_image", cost: 0, group: "own", billing: "quote",
    args: "appId, prompt, size?, n?, transparent?, confirm?, confirmationToken?",
    desc: "1-4 still images with GPT Image (low quality). The first call returns a credit quote; nothing is charged until you confirm.",
    when: "You need a picture, a background or a transparent sticker; put long text in captions, not in the prompt.",
  },
  {
    name: "creative_image_edit", cost: 0, group: "own", billing: "quote",
    args: "appId, prompt, imageAssetIds, maskAssetId?, size?, confirm?, confirmationToken?",
    desc: "Edit or combine 1-4 of your existing image assets, with an optional mask. The first call returns a credit quote; nothing is charged until you confirm.",
    when: "You want to change or merge images you already generated rather than start over.",
  },
  {
    name: "creative_job_status", cost: 0, group: "own",
    args: "jobId",
    desc: "Where an asynchronous creative job stands, with its finished assets and the credits quoted, charged and refunded. Free.",
    when: "A creative job was started and you are waiting for it; poll after pollAfterSeconds.",
  },
  {
    name: "sheets_create", cost: 0, group: "own",
    args: "appId?, title, sheets?",
    desc: "Create a Google spreadsheet in the connected Google account, with named tabs and header rows. Nooticr owns the file, so later writes need no approval. Free.",
    when: "An employee needs a ledger, price table or report sheet it can keep writing to.",
  },
  {
    name: "sheets_list", cost: 0, group: "own",
    args: "appId?, limit?",
    desc: "The spreadsheets this connection can see: the ones Nooticr created and the ones the customer picked, and whether each may be edited without approval. Free.",
    when: "Before creating one: the sheet you need may already exist.",
  },
  {
    name: "sheets_read", cost: 0, group: "own",
    args: "appId?, id, range",
    desc: "Read an A1 range of a spreadsheet (at most 10000 cells). Free.",
    when: "You need the current numbers before adding to or changing a sheet.",
  },
  {
    name: "sheets_append_rows", cost: 0, group: "own",
    args: "appId?, id, sheet, rows",
    desc: "Append typed rows after the last row of a tab. Free on files Nooticr created or the customer allowed; other picked files wait for approval.",
    when: "You are logging new entries (an expense, a price check) without touching existing rows.",
  },
  {
    name: "sheets_update_range", cost: 0, group: "own",
    args: "appId?, id, range, values",
    desc: "Overwrite an A1 range with typed values. Same approval rule as sheets_append_rows.",
    when: "You are correcting or recalculating cells that already exist.",
  },
  {
    name: "sheets_add_sheet", cost: 0, group: "own",
    args: "appId?, id, name",
    desc: "Add an empty tab to a spreadsheet. Same approval rule as sheets_append_rows.",
    when: "A new month or product needs its own tab.",
  },
  {
    name: "stop_brand_watch", cost: 0, group: "research",
    args: "id",
    desc: "Stops a watch immediately: the run that was due does not happen and nothing further is charged.",
    when: "Works at a zero balance, because someone out of credits is exactly who needs to turn off what is spending them.",
  },
  {
    name: "set_brand_watch_alerts", cost: 0, group: "research",
    args: "watchId, email, slack, minNew",
    desc: "Turns a watch's email and Slack alerts on or off, and sets how many new items a run must find before it alerts. Every run still posts to the watch's thread.",
    when: "When findings should reach the team's Slack rather than one inbox, or a watch is too noisy.",
  },
  {
    name: "update_watch_portfolio", cost: 0, group: "research",
    args: "watchId, add, remove",
    desc: "Adds terms to a portfolio watch or takes them out. The per-run budget you agreed to does not move, so no new confirmation is needed.",
    when: "When a new competitor or product should join the comparison \u2014 the reply says if the split budget now reaches fewer networks.",
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
    name: "hire_employee", cost: 0, group: "own",
    args: "template, name?, instructions?, schedule?, monthlyBudgetCredits?, maxCreditsPerRun?",
    desc: "Hires an AI employee that works on a schedule inside your workspace. Free to call: it quotes first and creates nothing until you confirm; the runs are billed to the hiring user, up to the monthly budget.",
    when: "You want recurring work done for you. Public actions wait for your approval unless autopilot is on.",
  },
  {
    name: "list_employees", cost: 0, group: "own",
    args: "includeFired?",
    desc: "Your workspace's AI employees with status, schedule, next run and budget left. Free.",
    when: "Before hiring another, or to see what is running.",
  },
  {
    name: "pause_employee", cost: 0, group: "own",
    args: "employeeId, resume?",
    desc: "Pauses an AI employee, or resumes it. It keeps its memory and thread. Free.",
    when: "You want it to stop for a while rather than for good.",
  },
  {
    name: "fire_employee", cost: 0, group: "own",
    args: "employeeId",
    desc: "Lets an AI employee go for good and discards what was waiting for approval. Describes the effect first and acts only on confirmation. Free.",
    when: "You are done with it; to stop it temporarily, pause it instead.",
  },
  {
    name: "crm_upsert_creator", cost: 0, group: "own",
    args: "platform, handle, ...fields",
    desc: "Adds a creator to your creator pipeline, or updates the one already there (matched by platform and handle). Free.",
    when: "You found a creator worth tracking, or learned more about one.",
  },
  {
    name: "crm_list_creators", cost: 0, group: "own",
    args: "status?, appId?, query?, limit?, dueBefore?",
    desc: "Your creator pipeline, most recently updated first, each with its last interaction. Free.",
    when: "Before adding a creator, or to see who is due a next step.",
  },
  {
    name: "crm_update_status", cost: 0, group: "own",
    args: "creatorId, status, note",
    desc: "Moves a creator to a new pipeline status and records why. Free.",
    when: "A creator's relationship with you changed.",
  },
  {
    name: "crm_log_interaction", cost: 0, group: "own",
    args: "creatorId, kind, summary, body?",
    desc: "Records a note, vetting result, outreach draft, reply or deliverable against a creator. Free.",
    when: "Something happened with a creator that the pipeline should remember.",
  },
  {
    name: "list_pending_actions", cost: 0, group: "own",
    args: "employeeId?, limit?",
    desc: "What your AI employees are waiting to do until you approve: a preview of what will be published, sent or changed. Free.",
    when: "Before approving or rejecting anything.",
  },
  {
    name: "get_employee_audit", cost: 0, group: "own",
    args: "employeeId, from?, to?, types?, runId?, actionId?, limit?, verify?",
    desc: "One AI employee's tamper-evident audit trail: runs, calls and their cost, approvals, executed actions, config changes. Owners and admins only. Free.",
    when: "You need to know what an employee did, why an action went out, or that the record is intact.",
  },
  {
    name: "approve_action", cost: 0, group: "own",
    args: "actionId",
    desc: "Approves one pending action. Returns the preview and a token first and runs nothing; the stored action runs exactly once after you confirm. Free.",
    when: "You have read the preview and want it to go out.",
  },
  {
    name: "reject_action", cost: 0, group: "own",
    args: "actionId, note?",
    desc: "Rejects one pending action, with a note the employee can learn from. Free.",
    when: "The preview is not something you want published or sent.",
  },
  {
    name: "marketplace_changes", cost: 0, group: "market",
    args: "marketplace, query, market?",
    desc: "What moved in a category since the run before: products that entered or left a search's results, and ones whose price or place changed. Compared from stored scans, so it fetches nothing. Free.",
    when: "A category was scanned before and you want to know what changed; scan it again first to have a second run.",
  },
  {
    name: "get_price_history", cost: 0, group: "market",
    args: "marketplace, id, market?, from?, to?, metric?",
    desc: "One product's price, rating, review count or availability over time, from the observations stored each time it was scanned. Fetches nothing. Free.",
    when: "You want to know whether a product got cheaper or better rated; read it once with get_marketplace_product to start its record.",
  },
  {
    name: "track_price", cost: 0, group: "market",
    args: "marketplace, id, market?, productLine?, competitorOf?",
    desc: "Follows a listing already read here on the workspace's Price history page, optionally drawn against one of its own listings as a competitor. Fetches nothing. Free.",
    when: "Someone wants a product's price followed, or a competitor's offer charted against theirs; read it once with get_marketplace_product first.",
  },
  {
    name: "untrack_price", cost: 0, group: "market",
    args: "marketplace, id, market?",
    desc: "Stops following a tracked listing. One the workspace's scans still return stays on the page. Free.",
    when: "A listing no longer needs following.",
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
  {
    name: "show_marketplace_category_insights", cost: 0, group: "market",
    args: "marketplace, your category read",
    desc: "The same card for the other eleven sites: your read beside that site's listings and reviews, re-read from the scan so nothing is re-typed.",
    when: "After reading a scan_marketplace_category result.",
  },

  // ── create ──
  {
    name: "show_hooks", cost: 0, group: "create",
    args: "the hooks you wrote",
    desc: "Draws the openings you wrote, each with the device it uses and who it stops.",
    when: "After generate_hook_ideas.",
  },
  {
    name: "show_variants", cost: 0, group: "create",
    args: "the variants you wrote",
    desc: "Draws each variant's hook, the angle that changes, its shot beats and its call to action.",
    when: "After generate_post_variants.",
  },
  {
    name: "show_repurposed_post", cost: 0, group: "create",
    args: "the copy you wrote",
    desc: "Draws the rewritten copy, one entry per surface you rewrote it for.",
    when: "After adapt_post_for_platform.",
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
    name: "get_google_analytics_data", cost: 0, group: "own",
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
    name: "get_search_performance", cost: 0, group: "own",
    args: "app_id, start_date?, end_date?, dimensions?, filters?, compare_to_previous?, ...",
    desc: "Your own site's clicks, impressions, CTR and position in Google Search, live from its connected Search Console. Free.",
    when: "Which queries and pages bring people to your site, and what changed.",
  },
  {
    name: "inspect_url", cost: 0, group: "own",
    args: "app_id, url, urls?",
    desc: "Whether Google indexed pages of your own site, the canonical it chose and the last crawl. At most 20 per call. Free.",
    when: "A page of yours does not show up in Google.",
  },
  {
    name: "get_sitemaps", cost: 0, group: "own",
    args: "app_id, url?",
    desc: "Your own site's submitted sitemaps with indexed counts, errors and warnings. Read-only. Free.",
    when: "Whether Google read your sitemap and how much of it is indexed.",
  },
  {
    name: "get_page_speed", cost: 0, group: "own",
    args: "app_id, url, strategy?",
    desc: "Core Web Vitals for a page of your own site: field data when there is enough, and lab scores. Free.",
    when: "Whether a page of yours is fast enough, and what would make it faster.",
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
    desc: "Which social accounts your workspace has connected and what each one is allowed to do \u2014 read, publish, manage comments \u2014 plus which platforms can be connected at all. Publishing happens through an AI employee, when you approve its post in the dashboard, or on its own if you turned on autopilot for publishing for that employee; not from here.",
    when: "Before anything that needs an account linked.",
  },
  {
    name: "connect_social_account", cost: 0, group: "own",
    args: "platform",
    desc: "A link to open so the user can connect one account. They approve at the provider; no credential passes through this tool.",
    when: "list_social_connections showed the platform is connectable and not yet connected.",
  },
  {
    name: "connect_store", cost: 0, group: "own",
    args: "platform, shop?, region?, appId?",
    desc: "A link a workspace owner or admin opens to connect an Amazon seller account or a Shopify shop. They approve at the store; no credential passes through this tool. Free.",
    when: "You want your own store's catalogue read and none is connected yet.",
  },
  {
    name: "list_store_products", cost: 0, group: "own",
    args: "connectionId?, query?, limit?, cursor?, productRef?",
    desc: "Your connected store's own catalogue: title, description, status, price and Amazon listing issues. Read-only. Free.",
    when: "Before changing anything about a listing, or to see what the store currently says.",
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
    name: "get_usage_report", cost: 0, group: "account",
    args: "days?, from?, to?, scope?",
    desc: "Spend over a window: totals, per tool, per day, recent failures; per seat for a workspace's owners and admins.",
    when: "What did we spend this month, on what, and what failed.",
  },
  {
    name: "nooticr_login", cost: 0, group: "account",
    args: "—",
    desc: "Re-link the account.",
    when: "A call fails with an authentication error.",
  },
  {
    name: "nooticr_settings_read", cost: 0, group: "account",
    args: "—",
    desc: "Read your default social platform and result count.",
    when: "Check the research defaults used when you omit those arguments.",
  },
  {
    name: "nooticr_settings_update", cost: 0, group: "account",
    args: "set",
    desc: "Save your default social platform and result count for research tools.",
    when: "Choose the defaults for future calls that omit those arguments.",
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
