import { z } from "zod";

export const TOOL_DEFINITIONS = [
 {
 name: "analyze_post",
 title: "Analyze Post",
 description: "Analyze a social post (video, image, carousel/slideshow) from its link — imports the media and runs AI analysis over the actual content (video frames, carousel images, caption). Supports TikTok, Instagram, YouTube, X/Twitter, Douyin, Xiaohongshu and Bilibili. Returns the full analysis once finished.",
 inputSchema: z.object({ url: z.string().describe("Public post URL (TikTok/Instagram/YouTube/X, Douyin, Xiaohongshu or Bilibili).") }).strict(),
 },
 {
 name: "get_social_media",
 title: "Get Social Media",
 description: "Fetch a social post's media from a TikTok, Instagram, YouTube, X/Twitter, Douyin, Xiaohongshu or Bilibili URL: contentType (video/image/carousel/slideshow), title, caption, author, stats and direct media URLs. Returns an inline thumbnail image. Consumes 1 orchyn credit. First use free per user.",
 inputSchema: z.object({ url: z.string().describe("Full public post URL.") }).strict(),
 },
 {
 name: "discover_social_posts",
 title: "Discover Social Posts",
 description: "Discover recent posts (video, image, carousel, slideshow) for a niche on YouTube, TikTok, Instagram, Douyin, Xiaohongshu, X/Twitter or Bilibili. Each post includes title/caption, thumbnailUrl, externalUrl, views/likes/comments and inline thumbnails (up to 4) so they show in chat. Say \"next\" to paginate (offset), or \"analyze the 2nd one\" / \"analyze all\" for batch analysis. Consumes 2 orchyn credits. First use free per user.",
 inputSchema: z.object({ niche: z.string().describe("Niche/topic, e.g. 'fitness'."), keywords: z.string().optional().describe("Optional extra keywords."), limit: z.number().int().optional().describe("Max results (default 6)."), offset: z.number().int().optional().describe("Skip first N results — for 'next' pagination."), platform: z.enum(["youtube", "tiktok", "instagram", "douyin", "xiaohongshu", "twitter", "bilibili", "any"]).optional().describe("Platform to search (default youtube).") }).strict(),
 },
 {
 name: "get_user_posts",
 title: "Get User Posts",
 description: "List recent posts by a creator handle (e.g. @zoundsapp) on TikTok, Instagram, YouTube, Douyin, Xiaohongshu, X/Twitter or Bilibili. Each post includes title/caption, thumbnailUrl, externalUrl, views/likes/comments and inline thumbnails (up to 4) so they show in chat. Use this when Claude needs to pull more posts from the same account to spot a pattern, or to scan a whole profile. Consumes 2 orchyn credits. First use free per user.",
 inputSchema: z.object({ username: z.string().describe("Creator handle, e.g. 'zoundsapp' or '@zoundsapp'."), platform: z.enum(["tiktok", "instagram", "youtube", "douyin", "xiaohongshu", "twitter", "bilibili"]).optional().describe("Which platform (default tiktok)."), limit: z.number().int().optional().describe("Max posts (default 6).") }).strict(),
 },
 {
 name: "analyze_creator_profile",
 title: "Analyze Creator Profile",
 description: "Deep-dive a whole creator profile on TikTok, Instagram, YouTube, Douyin, Xiaohongshu, X/Twitter or Bilibili: fetch recent posts, run multimodal AI on up to 3, then synthesize a profile report — creator summary, niche, content themes, hook styles, strengths/weaknesses, engagement patterns, audience insights, variation ideas, collaboration fit. Consumes 15 orchyn credits. First use free per user.",
 inputSchema: z.object({ username: z.string().describe("Creator handle, e.g. 'zoundsapp'."), platform: z.enum(["tiktok", "instagram", "youtube", "douyin", "xiaohongshu", "twitter", "bilibili"]).optional().describe("Which platform (default tiktok)."), limit: z.number().int().optional().describe("Posts to fetch (default 6; first 3 analyzed)."), focus: z.string().optional().describe("Extra instruction for the profile synthesis.") }).strict(),
 },
 {
 name: "get_post_comments",
 title: "Get Post Comments",
 description: "Fetch top comments for a post URL on TikTok, Instagram, YouTube, Douyin, X/Twitter or Bilibili (plus keyword clusters from TikTok Analytics when available) — audience sentiment/audience-signal analysis. Consumes 2 orchyn credits. First use free per user.",
 inputSchema: z.object({ url: z.string().describe("Full public post URL (TikTok/Instagram/YouTube/Douyin/X/Bilibili)."), limit: z.number().int().optional().describe("Max comments (default 20).") }).strict(),
 },
 {
 name: "search_creators",
 title: "Search Creators",
 description: "Search creators by niche/keyword on TikTok, Instagram, Xiaohongshu, YouTube or Douyin — username, nickname, follower count, signature, verified status. Use to find influencers to vet or analyze. Consumes 2 orchyn credits. First use free per user.",
 inputSchema: z.object({ keyword: z.string().describe("Niche/keyword, e.g. 'fitness' or a creator name."), platform: z.enum(["tiktok", "instagram", "xiaohongshu", "youtube", "douyin"]).optional().describe("Which platform (default tiktok)."), count: z.number().int().optional().describe("Max creators (default 8).") }).strict(),
 },
 {
 name: "get_similar_creators",
 title: "Get Similar Creators",
 description: "Find lookalike creators for a given handle — TikTok similar-user recommendations or Instagram similar users. Useful for scaling: 'if this creator works, here are more like them'. Consumes 2 orchyn credits. First use free per user.",
 inputSchema: z.object({ username: z.string().describe("Seed creator handle, e.g. 'zoundsapp'."), platform: z.enum(["tiktok", "instagram"]).optional().describe("Which platform (default tiktok).") }).strict(),
 },
 {
 name: "discover_sounds",
 title: "Discover Sounds",
 description: "Discover trending sounds/music for a keyword on TikTok or Instagram — the sound is a huge ranking signal for TikTok virality. Returns title, artist, duration, play/cover URLs. Consumes 2 orchyn credits. First use free per user.",
 inputSchema: z.object({ keyword: z.string().describe("Niche/keyword, e.g. 'gym'."), platform: z.enum(["tiktok", "instagram"]).optional().describe("Which platform (default tiktok)."), count: z.number().int().optional().describe("Max sounds (default 6).") }).strict(),
 },
 {
 name: "understand_social_post",
 title: "Understand Social Post",
 description: "Import a social post URL AND understand it with multimodal AI over the actual video/images: summary, hook strength, viral triggers, format breakdown and variation ideas. Includes the thumbnail. Supports TikTok, Instagram, YouTube, X/Twitter, Douyin, Xiaohongshu and Bilibili. Consumes 10 orchyn credits. First use free per user.",
 inputSchema: z.object({ url: z.string().describe("Full public post URL (TikTok/Instagram/YouTube/X/Douyin/Xiaohongshu/Bilibili)."), focus: z.string().optional().describe("Extra instruction, e.g. 'focus on the CTA'.") }).strict(),
 },
 {
 name: "check_orchyn_credits",
 title: "Check Orchyn Credits",
 description: "Check your MCP credit balance, billing URL and pack size. No cost — call anytime to see remaining credits before running other tools.",
 inputSchema: z.object({}).strict(),
 },
 {
 name: "buy_orchyn_credits",
 title: "Buy Orchyn Credits",
 description: "Buy an MCP credit pack via Stripe Checkout. Returns a secure checkout URL — open it in your browser to pay. Credits are added automatically after payment. No cost to call.",
 inputSchema: z.object({}).strict(),
 },
] as const;

export type ToolName = typeof TOOL_DEFINITIONS[number]["name"];
