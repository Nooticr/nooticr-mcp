/**
 * Prompts — the workflows, named.
 *
 * A tool list is a parts bin. It tells a host what Orchyn can do and nothing
 * about what to do first, and the ordering is where most of the value is: the
 * transcript before the analysis when the wording matters, the cheap
 * caption-based pass before the one that watches every frame, the comments
 * before deciding what to make next. That knowledge lived only in the tool
 * descriptions, where it is read one tool at a time and never as a sequence.
 *
 * Prompts are also the only surface a user can find without knowing a tool
 * name — they are what a host offers up front. `prompts/list` returned an
 * empty array, so nobody could find any of this without being told what to
 * type.
 *
 * Each prompt below is a workflow someone actually runs, written to spend the
 * user's credits in the right order: cheapest evidence first, and the
 * expensive multimodal pass only where it changes the answer.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** MCP prompt arguments are strings on the wire, so every arg is a string. */
const platformArg = z
  .string()
  .optional()
  .describe("tiktok, instagram, youtube, douyin, xiaohongshu, twitter or bilibili. Defaults to tiktok.");

function userMessage(text: string) {
  return { messages: [{ role: "user" as const, content: { type: "text" as const, text } }] };
}

/** Shared preamble: spend credits in the right order, and say what was used. */
const COST_RULE =
  "Prefer the cheapest tool that answers the question, and only reach for a multimodal " +
  "analysis when the visuals are actually the point. Do not call a paid tool twice for " +
  "the same input. When you are done, say briefly which tools you used.";

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "teardown_creator",
    {
      title: "Tear down a creator",
      description:
        "Reverse-engineer what a creator does that works: their repeatable hook formula, " +
        "caption style, posting pattern, and what you could adapt.",
      argsSchema: {
        handle: z.string().describe("Creator handle, with or without @ — e.g. 'zoundsapp'."),
        platform: platformArg,
        depth: z
          .string()
          .optional()
          .describe("'fast' (captions only, cheap) or 'full' (also watches their videos). Default fast."),
      },
    },
    ({ handle, platform, depth }) =>
      userMessage(
        `Tear down the creator ${handle}${platform ? ` on ${platform}` : ""}.\n\n` +
          `Work in this order:\n` +
          `1. find_hook_pattern on ${handle} — their formula from captions and performance. This is the ` +
          `cheap backbone of the teardown, so start here rather than with a full profile analysis.\n` +
          `2. get_user_posts to see the actual recent posts behind that pattern, and note which ones ` +
          `outperformed the rest.\n` +
          (depth === "full"
            ? `3. analyze_creator_profile for the visual and production side — framing, editing, on-screen ` +
              `text — since the user asked for the full pass.\n`
            : `3. Only run analyze_creator_profile if the caption-level pattern leaves something important ` +
              `unexplained. Say so before you spend it.\n`) +
          `\nThen give me: the hook types they reuse, their caption and length pattern, what their best ` +
          `posts share that their worst do not, and three fill-in-the-blank templates I could adapt to my ` +
          `own niche. Be concrete — quote their actual hooks.\n\n${COST_RULE}`,
      ),
  );

  server.registerPrompt(
    "niche_briefing",
    {
      title: "What is working in a niche",
      description:
        "A briefing on a niche right now: dominant formats, hook patterns, trending tags and sounds, " +
        "the gaps nobody is filling, and what to make next.",
      argsSchema: {
        niche: z.string().describe("Niche or topic, e.g. 'home fitness'."),
        platform: platformArg,
        country: z.string().optional().describe("2-letter country code for the trend board, e.g. 'US'."),
      },
    },
    ({ niche, platform, country }) =>
      userMessage(
        `Brief me on the "${niche}" niche${platform ? ` on ${platform}` : ""} as it stands right now.\n\n` +
          `Work in this order:\n` +
          `1. niche_report on "${niche}" — the pattern across recent posts. This is the spine of the ` +
          `briefing; do it before looking at individual posts.\n` +
          `2. discover_hashtags${country ? ` for ${country}` : ""} — what is rising versus cooling, so the ` +
          `briefing reflects the direction of travel and not just the current state.\n` +
          `3. discover_sounds for "${niche}" if the platform is TikTok or Instagram — the sound is a ` +
          `ranking signal, not decoration.\n` +
          `4. discover_social_posts only if you need concrete examples to point at.\n\n` +
          `Then give me: the formats that dominate, the hook patterns that recur, what is rising and what ` +
          `is cooling, the gaps nobody is filling, and three specific things I could make this week. ` +
          `Rank those three by how much evidence you actually have for them.\n\n${COST_RULE}`,
      ),
  );

  server.registerPrompt(
    "check_my_draft",
    {
      title: "Check my draft before I post",
      description:
        "Review a script, caption or hook before filming — scores, concrete fixes, and stronger " +
        "hook options. The one workflow that runs before the content exists.",
      argsSchema: {
        draft: z.string().describe("Your script, caption or hook."),
        platform: platformArg,
      },
    },
    ({ draft, platform }) =>
      userMessage(
        `Review this draft before I film it${platform ? ` for ${platform}` : ""}:\n\n"""\n${draft}\n"""\n\n` +
          `Work in this order:\n` +
          `1. score_draft on it — hook strength, clarity, payoff, and the concrete fixes.\n` +
          `2. write_hooks on the same topic for alternative openings to choose between.\n\n` +
          `Then tell me plainly: is the hook doing work in the first two seconds, where does attention ` +
          `leak, and which of the alternative hooks you would actually use and why. If the draft is ` +
          `fine as it stands, say so rather than inventing changes.\n\n${COST_RULE}`,
      ),
  );

  server.registerPrompt(
    "post_teardown",
    {
      title: "Tear down one post",
      description:
        "Understand a single post properly: what is said, why it works, and what the audience did " +
        "with it.",
      argsSchema: {
        url: z.string().describe("Full public post URL."),
        visuals: z
          .string()
          .optional()
          .describe("'yes' if the framing, editing and on-screen text matter. Default no."),
      },
    },
    ({ url, visuals }) =>
      userMessage(
        `Tear down this post: ${url}\n\n` +
          `Work in this order:\n` +
          `1. get_post_transcript — the exact words, cheaply. Do this first: an analysis that quotes the ` +
          `real script beats one that paraphrases an interpretation of it.\n` +
          `2. analyze_post_fast — hook, structure, CTA and audience, built from that transcript.\n` +
          (visuals === "yes"
            ? `3. analyze_post — the visual pass, since the framing and editing are the point here.\n`
            : `3. Skip analyze_post unless the fast pass leaves the visuals genuinely unexplained. It costs ` +
              `three times as much; say so before spending it.\n`) +
          `4. analyze_comments — what the audience actually took away, which is often not what the ` +
          `creator intended.\n\n` +
          `Then give me: the hook and why it stops someone, the structure beat by beat, the CTA, and the ` +
          `gap (if any) between what the post says and what the comments show people heard.\n\n${COST_RULE}`,
      ),
  );

  server.registerPrompt(
    "why_this_won",
    {
      title: "Why did this one win",
      description:
        "Compare posts that performed differently and explain the gap in terms you can act on.",
      argsSchema: {
        urls: z.string().describe("2-5 post URLs, separated by spaces or commas."),
      },
    },
    ({ urls }) =>
      userMessage(
        `Compare these posts and explain the performance gap:\n${urls}\n\n` +
          `Use compare_posts on all of them at once rather than analysing each separately — the comparison ` +
          `is the point, and one call is cheaper than several.\n\n` +
          `Then tell me: which won, what actually differed (hook, format, length, caption, tags), what ` +
          `they share that I should keep, and one concrete experiment that would test your explanation. ` +
          `Be honest about which differences are evidence and which are guesses — sample sizes this small ` +
          `support fewer conclusions than they appear to.\n\n${COST_RULE}`,
      ),
  );

  server.registerPrompt(
    "what_to_make_next",
    {
      title: "Turn a post that worked into what to film next",
      description:
        "Go from 'this one worked' to a shot list — variants with hooks, angles and beats, grounded " +
        "in what the audience asked for.",
      argsSchema: {
        url: z.string().describe("The post that worked."),
        angle: z.string().optional().describe("Optional steer, e.g. 'for a beginner audience'."),
      },
    },
    ({ url, angle }) =>
      userMessage(
        `This post worked: ${url}. Tell me what to film next.\n\n` +
          `Work in this order:\n` +
          `1. analyze_comments — the audience already said what they want more of, and the questions they ` +
          `asked are the cheapest content ideas available.\n` +
          `2. create_variants${angle ? ` with the angle "${angle}"` : ""} — same mechanism, different ` +
          `execution, with hooks and shot beats.\n\n` +
          `Then give me a shortlist I could film this week, each with its hook, what changes versus the ` +
          `original, and which comment or pattern it is answering. Order them by how much evidence there ` +
          `is that the audience wants it, not by how clever the idea is.\n\n${COST_RULE}`,
      ),
  );

  server.registerPrompt(
    "repurpose_everywhere",
    {
      title: "Repurpose a post for other surfaces",
      description:
        "Reshape one post that already worked into the formats other platforms reward, keeping the " +
        "argument and changing the shape.",
      argsSchema: {
        url: z.string().describe("The post to repurpose."),
        targets: z
          .string()
          .optional()
          .describe("Comma-separated formats, e.g. 'x thread, linkedin, newsletter'. Default all."),
      },
    },
    ({ url, targets }) =>
      userMessage(
        `Repurpose this post for other surfaces: ${url}\n` +
          (targets ? `Targets: ${targets}\n` : "") +
          `\nUse repurpose_post. If the post's argument depends on the exact wording, pull ` +
          `get_post_transcript first so the rewrite carries the real lines rather than a summary of them.\n\n` +
          `Then give me each version ready to paste, and note for each one what you changed about the ` +
          `shape and why that surface rewards it.\n\n${COST_RULE}`,
      ),
  );
}
