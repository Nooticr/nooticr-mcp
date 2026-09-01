import { z } from "zod";

export const TOOL_DEFINITIONS = [
 {
 name: "analyze_post",
 title: "Analyze Post",
 description: "Analyze a social post (video, image, carousel/slideshow) from its link — imports the media and runs AI analysis over the actual content (video frames, carousel images, caption). Supports TikTok, Instagram, YouTube, X/Twitter, Douyin, Xiaohongshu and Bilibili. Returns the full analysis once finished. Use when the visuals are the point — framing, editing, on-screen text; for script, hook and structure alone, analyze_post_fast costs a third as much. AI analysis \u2014 1 free use, then 6 credits per use.",
 inputSchema: z.object({ url: z.string().describe("Public post URL (TikTok/Instagram/YouTube/X, Douyin, Xiaohongshu or Bilibili).") }).strict(),
 },
 {
 name: "get_social_media",
 title: "Get Social Media",
 description: "Fetch a social post's media from a TikTok, Instagram, YouTube, X/Twitter, Douyin, Xiaohongshu or Bilibili URL: contentType (video/image/carousel/slideshow), title, caption, author, stats and direct media URLs. Returns an inline thumbnail image. (20 free credits for new users). Use when you need the post's facts and media and nothing more; if you want it interpreted, use analyze_post_fast instead. Consumes 1 orchyn credit.",
 inputSchema: z.object({ url: z.string().describe("Full public post URL.") }).strict(),
 },
 {
 name: "discover_social_posts",
 title: "Discover Social Posts",
 description: "Discover recent posts (video, image, carousel, slideshow) for a niche on YouTube, TikTok, Instagram, Douyin, Xiaohongshu, X/Twitter or Bilibili. Each post includes title/caption, thumbnailUrl, externalUrl, views/likes/comments and inline thumbnails (up to 4) so they show in chat. Say \"next\" to paginate (offset), or \"analyze the 2nd one\" / \"analyze all\" for batch analysis. (20 free credits for new users). Use to find individual posts to look at; use niche_report when you want the pattern across them rather than the posts themselves. Consumes 2 orchyn credits.",
 inputSchema: z.object({ niche: z.string().describe("Niche/topic, e.g. 'fitness'."), keywords: z.string().optional().describe("Optional extra keywords."), limit: z.number().int().optional().describe("Max results (default 6)."), offset: z.number().int().optional().describe("Skip first N results — for 'next' pagination."), platform: z.enum(["youtube", "tiktok", "instagram", "douyin", "xiaohongshu", "twitter", "bilibili", "any"]).optional().describe("Platform to search (default youtube).") }).strict(),
 },
 {
 name: "get_user_posts",
 title: "Get User Posts",
 description: "List recent posts by a creator handle (e.g. @zoundsapp) on TikTok, Instagram, YouTube, Douyin, Xiaohongshu, X/Twitter or Bilibili. Each post includes title/caption, thumbnailUrl, externalUrl, views/likes/comments and inline thumbnails (up to 4) so they show in chat. Use this when Claude needs to pull more posts from the same account to spot a pattern, or to scan a whole profile. (20 free credits for new users). Use to scan one creator's output; use find_hook_pattern when you want their formula extracted rather than the raw list. Consumes 2 orchyn credits.",
 inputSchema: z.object({ username: z.string().describe("Creator handle, e.g. 'zoundsapp' or '@zoundsapp'."), platform: z.enum(["tiktok", "instagram", "youtube", "douyin", "xiaohongshu", "twitter", "bilibili"]).optional().describe("Which platform (default tiktok)."), limit: z.number().int().optional().describe("Max posts (default 6).") }).strict(),
 },
 {
 name: "analyze_creator_profile",
 title: "Analyze Creator Profile",
 description: "Deep-dive a whole creator profile on TikTok, Instagram, YouTube, Douyin, Xiaohongshu, X/Twitter or Bilibili: fetch recent posts, run multimodal AI on up to 3, then synthesize a profile report — creator summary, niche, content themes, hook styles, strengths/weaknesses, engagement patterns, audience insights, variation ideas, collaboration fit. Use for a full teardown when the visuals matter; find_hook_pattern gives you their formula from captions for a fraction of the price. AI analysis \u2014 1 free use, then 15 credits per use.",
 inputSchema: z.object({ username: z.string().describe("Creator handle, e.g. 'zoundsapp'."), platform: z.enum(["tiktok", "instagram", "youtube", "douyin", "xiaohongshu", "twitter", "bilibili"]).optional().describe("Which platform (default tiktok)."), limit: z.number().int().optional().describe("Posts to fetch (default 6; first 3 analyzed)."), focus: z.string().optional().describe("Extra instruction for the profile synthesis.") }).strict(),
 },
 {
 name: "get_post_comments",
 title: "Get Post Comments",
 description: "Fetch top comments for a post URL on TikTok, Instagram, YouTube, Douyin, X/Twitter or Bilibili (plus keyword clusters from TikTok Analytics when available) — audience sentiment/audience-signal analysis. (20 free credits for new users). Use when you want to read what people actually wrote; use analyze_comments when you want it synthesised into what to do next. Consumes 2 orchyn credits.",
 inputSchema: z.object({ url: z.string().describe("Full public post URL (TikTok/Instagram/YouTube/Douyin/X/Bilibili)."), limit: z.number().int().optional().describe("Max comments (default 20).") }).strict(),
 },
 {
 name: "search_creators",
 title: "Search Creators",
 description: "Search creators by niche/keyword on TikTok, Instagram, Xiaohongshu, YouTube or Douyin — username, nickname, follower count, signature, verified status. Use to find influencers to vet or analyze. (20 free credits for new users). Use when you know the niche but not the names; use get_similar_creators when you already have one creator that works. Consumes 2 orchyn credits.",
 inputSchema: z.object({ keyword: z.string().describe("Niche/keyword, e.g. 'fitness' or a creator name."), platform: z.enum(["tiktok", "instagram", "xiaohongshu", "youtube", "douyin"]).optional().describe("Which platform (default tiktok)."), count: z.number().int().optional().describe("Max creators (default 8).") }).strict(),
 },
 {
 name: "get_similar_creators",
 title: "Get Similar Creators",
 description: "Find lookalike creators for a given handle — TikTok similar-user recommendations or Instagram similar users. Useful for scaling: 'if this creator works, here are more like them'. (20 free credits for new users). Use when one creator already fits and you want more of the same. Consumes 2 orchyn credits.",
 inputSchema: z.object({ username: z.string().describe("Seed creator handle, e.g. 'zoundsapp'."), platform: z.enum(["tiktok", "instagram"]).optional().describe("Which platform (default tiktok).") }).strict(),
 },
 {
 name: "discover_sounds",
 title: "Discover Sounds",
 description: "Discover trending sounds/music for a keyword on TikTok or Instagram — the sound is a huge ranking signal for TikTok virality. Returns title, artist, duration, play/cover URLs. (20 free credits for new users). Use when picking audio for a post, or to spot a sound before it peaks. Consumes 2 orchyn credits.",
 inputSchema: z.object({ keyword: z.string().describe("Niche/keyword, e.g. 'gym'."), platform: z.enum(["tiktok", "instagram"]).optional().describe("Which platform (default tiktok)."), count: z.number().int().optional().describe("Max sounds (default 6).") }).strict(),
 },
 {
 name: "understand_social_post",
 title: "Understand Social Post",
 description: "Import a social post URL AND understand it with multimodal AI over the actual video/images: summary, hook strength, viral triggers, format breakdown and variation ideas. Includes the thumbnail. Supports TikTok, Instagram, YouTube, X/Twitter, Douyin, Xiaohongshu and Bilibili. Use when you need a factual description of what physically happens on screen; analyze_post is the better default for strategy. AI analysis \u2014 1 free use, then 6 credits per use.",
 inputSchema: z.object({ url: z.string().describe("Full public post URL (TikTok/Instagram/YouTube/X/Douyin/Xiaohongshu/Bilibili)."), focus: z.string().optional().describe("Extra instruction, e.g. 'focus on the CTA'.") }).strict(),
 },
 {
 name: "get_post_transcript",
 title: "Get Post Transcript",
 description: "Get the words actually spoken in a TikTok or YouTube post by reading its caption track. Cheap and exact — use this before analyze_post when you need the script, hook wording or CTA verbatim rather than an interpretation. Returns plain text with a word count, or available:false with a reason when the post has no captions. Use before any analysis when the exact wording matters. Consumes 1 orchyn credit.",
 inputSchema: z.object({ url: z.string().describe("Post URL (TikTok or YouTube)."), language: z.string().optional().describe("Preferred language code, e.g. 'en'.") }).strict(),
 },
 {
 name: "analyze_comments",
 title: "Analyze Comments",
 description: "Read a post's comment section and return what the audience is actually saying: sentiment, recurring themes, the questions they ask, objections raised, content they request, the language they use, and follow-up video ideas grounded in it. Use when the goal is 'what should I make next' rather than 'what did people write'. AI analysis — 1 free use, then 6 credits per use.",
 inputSchema: z.object({ url: z.string().describe("Full public post URL."), limit: z.number().int().optional().describe("Comments to read (default 50, max 100).") }).strict(),
 },
 {
 name: "compare_posts",
 title: "Compare Posts",
 description: "Compare 2-5 posts side by side and explain the performance gap: which won, what actually differed (hook, format, length, caption, hashtags), shared strengths, testable lessons and one concrete next experiment. Use for 'why did this one work and that one not'. AI analysis — 1 free use, then 8 credits per use.",
 inputSchema: z.object({ urls: z.array(z.string()).describe("2-5 post URLs to compare.") }).strict(),
 },
 {
 name: "discover_hashtags",
 title: "Discover Hashtags",
 description: "Trending TikTok hashtags from the Creative Center trend board, with post counts, view counts and whether each is rising, cooling or steady. Filter by country and time window. Use to find what to tag, or to spot a wave early. Consumes 2 orchyn credits.",
 inputSchema: z.object({ country: z.string().optional().describe("2-letter country code (default US)."), days: z.number().int().optional().describe("Window in days: 7, 30 or 120 (default 7)."), count: z.number().int().optional().describe("Max hashtags (default 20)."), industryId: z.string().optional().describe("Optional TikTok industry id to filter by.") }).strict(),
 },
 {
 name: "analyze_post_fast",
 title: "Analyze Post (Fast)",
 description: "Same analysis as analyze_post but built from the post's transcript, caption and stats instead of its video frames — a third of the price. Weaker on visual style and production detail, just as strong on hook, script structure, CTA and audience. Use this by default; reach for analyze_post when the visuals are the point. Consumes 2 orchyn credits.",
 inputSchema: z.object({ url: z.string().describe("Full public post URL.") }).strict(),
 },
 {
 name: "write_hooks",
 title: "Write Hooks",
 description: "Write alternative opening hooks — the first line said or shown on screen. Give a url to riff on an existing post (it reads the real transcript), or a topic to start from nothing. Returns each hook with the mechanism it uses and who it stops. Use when you know the subject and need openings to choose between. Consumes 2 orchyn credits.",
 inputSchema: z.object({ url: z.string().optional().describe("Post to riff on (optional if topic given)."), topic: z.string().optional().describe("Subject to write hooks about (optional if url given)."), count: z.number().int().optional().describe("How many hooks (default 10, max 20)."), tone: z.string().optional().describe("Optional tone, e.g. 'blunt', 'contrarian'.") }).strict(),
 },
 {
 name: "create_variants",
 title: "Create Variants",
 description: "Turn a post that worked into variants a creator could film next — same underlying mechanism, different execution. Each variant comes with a hook, the angle that changes, ordered shot beats and a CTA. Use after analysing a post to move from 'why it worked' to 'what to make'. Consumes 3 orchyn credits.",
 inputSchema: z.object({ url: z.string().describe("The post to make variants of."), count: z.number().int().optional().describe("How many variants (default 3, max 6)."), angle: z.string().optional().describe("Optional steer, e.g. 'for a beginner audience'.") }).strict(),
 },
 {
 name: "score_draft",
 title: "Score Draft",
 description: "Review your own draft BEFORE you film or post it: hook strength, clarity and payoff scores, concrete fixes, a rewritten hook and a tightened draft. The only tool that runs before the content exists. Use before filming, while changing it is still cheap. Consumes 2 orchyn credits.",
 inputSchema: z.object({ draft: z.string().describe("Your script, caption or hook."), platform: z.string().optional().describe("Target platform (default tiktok).") }).strict(),
 },
 {
 name: "repurpose_post",
 title: "Repurpose Post",
 description: "Rewrite one post for other surfaces — X thread, LinkedIn post, carousel slides, YouTube title/description, newsletter — keeping the argument and changing the shape to suit how each is read. Use when a post already worked and you want it on other surfaces without rewriting it yourself. Consumes 2 orchyn credits.",
 inputSchema: z.object({ url: z.string().describe("The post to repurpose."), targets: z.array(z.string()).optional().describe("Which formats to produce (default all).") }).strict(),
 },
 {
 name: "niche_report",
 title: "Niche Report",
 description: "What is working in a niche right now: dominant formats, recurring hook patterns, what over- and underperforms, the gaps nobody is filling, and what to make next. Reads recent posts' captions and performance — no video, so it stays cheap. Use when entering a niche or deciding what to make next, rather than judging one post. Consumes 3 orchyn credits.",
 inputSchema: z.object({ niche: z.string().describe("Niche or topic, e.g. 'home fitness'."), platform: z.string().optional().describe("Platform to survey (default tiktok)."), count: z.number().int().optional().describe("Posts to survey (default 20, max 40).") }).strict(),
 },
 {
 name: "find_hook_pattern",
 title: "Find Hook Pattern",
 description: "Extract a creator's repeatable formula from their captions and performance: the hook types they reuse, caption style, length pattern, and fill-in-the-blank templates another creator could adapt. Much cheaper than analyze_creator_profile because it never watches the videos. Use to reverse-engineer a creator you want to learn from. Consumes 2 orchyn credits.",
 inputSchema: z.object({ username: z.string().describe("Creator handle, with or without @."), platform: z.string().optional().describe("Platform (default tiktok)."), limit: z.number().int().optional().describe("Posts to read (default 20, max 40).") }).strict(),
 },
 {
 name: "check_orchyn_credits",
 title: "Check Orchyn Credits",
 description: "Check your MCP credit balance, billing URL and pack size. New users get 20 free credits. No cost — call anytime to see remaining credits before running other tools. Use before a run of paid calls to confirm the balance covers it.",
 inputSchema: z.object({}).strict(),
 },
 {
 name: "buy_orchyn_credits",
 title: "Buy Orchyn Credits",
 description: "Buy an MCP credit pack via Stripe Checkout. Returns a secure checkout URL — open it in your browser to pay. Credits are added automatically after payment. Use when the balance is short and the user has agreed to top up. No cost to call.",
 inputSchema: z.object({}).strict(),
 },
 {
 name: "orchyn_login",
 title: "Orchyn Login",
 description: "Get a fresh login URL to re-authenticate your MCP session. Call this tool when you need to reconnect or when the session has expired. Use when a call fails with an authentication error, to re-link the account. Free to call. No cost to call.",
 inputSchema: z.object({}).strict(),
 },
 {
 name: "watch_creator",
 title: "Watch Creator",
 description: "Add a creator to your watchlist so you can ask later what they have posted since. Stores the handle only \u2014 nothing is fetched here. Use catch_up_watchlist to see what changed. Use when you want to follow someone over time rather than look at them once. No cost to call.",
 inputSchema: z.object({ username: z.string().describe("Creator handle, with or without @."), platform: z.string().optional().describe("Platform (default tiktok)."), note: z.string().optional().describe("Why you are watching them \u2014 shown back to you later.") }).strict(),
 },
 {
 name: "unwatch_creator",
 title: "Unwatch Creator",
 description: "Remove a creator from your watchlist. Nothing is fetched. Use when you no longer want them in the catch-up. No cost to call.",
 inputSchema: z.object({ username: z.string().describe("Creator handle, with or without @."), platform: z.string().optional().describe("Platform (default tiktok).") }).strict(),
 },
 {
 name: "catch_up_watchlist",
 title: "Catch Up On Watchlist",
 description: "What the creators you watch have posted since you last checked. Fetches each one's recent posts and compares them against the snapshot taken at your last catch-up, then moves the snapshot forward \u2014 so it answers 'what is new' rather than 'what exists'. The first run for a creator records the baseline and has nothing to compare against. Use to follow a set of creators over time instead of re-reading each one. Consumes 2 orchyn credits per creator checked.",
 inputSchema: z.object({ limit: z.number().int().optional().describe("Posts to check per creator (default 6)."), platform: z.string().optional().describe("Only check creators on this platform.") }).strict(),
 },
] as const;

export type ToolName = typeof TOOL_DEFINITIONS[number]["name"];
