/**
 * Own-account intelligence — the conceptual hole the capability review
 * (`docs/nooticr-gaps.html`, Tier 1) named: the MCP could analyse every
 * creator except the person using it. The dashboard's internal copilot
 * already has a registry of tools covering the user's own apps, scheduled
 * posts, performance, brand playbook and AI generation
 * (crates/server/src/copilot_tools.rs); nooticr-server's own `/mcp` dispatch
 * table already exposes a read-only-plus-generation subset of those
 * (crates/server/src/mcp_tools.rs) — this file is what makes that subset
 * reachable from Claude/ChatGPT, which is the whole gap.
 *
 * Billing is not uniform across these tools, and that is deliberate,
 * not a bug to paper over:
 *  - list_own_apps, create_product, update_product, get_scheduled_posts,
 *    get_post_performance, get_video_stats, get_content_plan and
 *    get_brand_playbook are free — nooticr's own already-stored data (or,
 *    for the two writes, a plain row with no AI call), never an upstream
 *    call.
 *  - review_post calls AI but the dashboard's own pre-publish review has
 *    never billed for it, so neither does this.
 *  - draft_post, growth_brief, generate_content_plan, generate_captions and
 *    analyze_product spend the workspace's plan AI credits — a different
 *    balance from the personal MCP credits every other tool in this file
 *    spends, and one check_nooticr_credits does not report on. Their
 *    descriptions say so explicitly rather than implying "free" by omitting
 *    a credit count. analyze_product_status, which only polls the job
 *    analyze_product started, is free — the cost was already charged.
 *
 * create_product/update_product also break this file's other convention:
 * every product-editing field on them (website_url, product_type, ...) is
 * snake_case, not camelCase. That is not a style slip — nooticr-server's
 * create_product_tool/update_product_tool (crates/server/src/mcp_tools.rs)
 * read those keys by exact name rather than through the camelCase-aliasing
 * path appId gets, so a camelCase websiteUrl sent here would silently be
 * dropped rather than land in the row. appId itself still works in either
 * case, same as every other tool below.
 *
 * analyze_product is a real outbound fetch, not just a nooticr-internal
 * read: it fetches an excerpt of the product's own website (whatever domain
 * website_url names), which is why it is the one tool in this file marked
 * openWorldHint: true rather than closed.
 *
 * get_scheduled_posts, get_post_performance and get_video_stats are the
 * measurement half of the same gap `growth_brief` only half-closed:
 * `growth_brief` hands back a narrative built from these same numbers, and
 * an agent asked to check whether something it made actually worked had no
 * way to see the numbers themselves — only nooticr's plain-language opinion
 * of them. All three already existed as tool descriptors in nooticr-server's
 * `/mcp` dispatch (`crates/server/src/mcp_tools.rs`'s `own_account_read`,
 * reusing `copilot_tools::execute_tool` exactly like `list_own_apps` and
 * `get_content_plan` above); this file is what makes them reachable here.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { NooticrClient, McpProxyResult } from "./nooticr.js";
import { OUTPUT_SCHEMAS } from "./output-schemas.js";
import { viewMeta } from "./view-meta.js";

interface MakeClient {
  (ctx: { authInfo?: AuthInfo; requestId?: string | number; arguments?: unknown }):
    | Promise<NooticrClient>
    | NooticrClient;
}

function toResult(proxy: McpProxyResult) {
  const textBlock = proxy.contentBlocks.find((c) => c.type === "text");
  return {
    content: textBlock ? [{ type: "text" as const, text: String(textBlock.text ?? "") }] : [],
    structuredContent: proxy.structured as Record<string, unknown> | undefined,
  };
}

function failed(prefix: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: `${prefix}: ${msg}` }],
    isError: true as const,
  };
}

export function registerOwnAccountTools(server: McpServer, makeClient: MakeClient): void {
  server.registerTool(
    "list_own_apps",
    {
      title: "List Own Apps",
      description:
        "List every product (\"app\") in your own workspace — id, name, niche and product type. " +
        "Call this first when your workspace has more than one product and another own-account " +
        "tool below asks for appId; with only one product none of them need it. Reads only your " +
        "own workspace. No cost to call.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: z.object({}).strict(),
      outputSchema: OUTPUT_SCHEMAS.list_own_apps,
    },
    async (_args, extra) => {
      const client = await makeClient({ ...extra, arguments: {} });
      try {
        return toResult(await client.callTool("list_own_apps", {}));
      } catch (err) {
        return failed("list_own_apps failed", err);
      }
    },
  );

  server.registerTool(
    "create_product",
    {
      title: "Create Product",
      description:
        "Create a new product (\"app\") in your own workspace — the row every other own-account " +
        "tool needs before it has anything to work with; a fresh workspace has none. Takes no " +
        "workspace argument: it always creates in the workspace of the session calling it, never " +
        "one you could name. Subject to your plan's product limit — the error names the limit if " +
        "you hit it. Does not generate a brand playbook by itself; call analyze_product afterwards " +
        "for that. name and slug are required; description, website_url, niche, product_type and " +
        "the store-listing fields below are optional. Free — no AI call, just a row.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      // These field names are snake_case, unlike appId elsewhere in this file.
      // The backend reads them by exact key (crates/server/src/mcp_tools.rs's
      // create_product_tool) rather than through the camelCase-aliasing path
      // resolve_app_target gives appId/app_id, so a camelCase websiteUrl here
      // would silently vanish rather than land in the row.
      inputSchema: z
        .object({
          name: z.string().describe("Product name."),
          slug: z.string().describe("URL-safe slug, unique within your workspace."),
          description: z.string().optional(),
          website_url: z
            .string()
            .optional()
            .describe(
              "The product's own site. analyze_product later fetches an excerpt of this page as " +
                "part of its analysis.",
            ),
          niche: z.string().optional(),
          product_type: z.string().optional().describe("e.g. \"app\", \"saas\", \"physical\"."),
          icon_url: z.string().optional(),
          primary_cta_label: z
            .string()
            .optional()
            .describe("Call-to-action button text, e.g. \"Get the app\"."),
          primary_cta_url: z.string().optional().describe("Where the call-to-action button links."),
          external_listing_id: z
            .string()
            .optional()
            .describe("App Store / Play Store listing id, if this product has one."),
          ios_bundle_id: z.string().optional(),
          android_package: z.string().optional(),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.create_product,
    },
    async (args, extra) => {
      const client = await makeClient({ ...extra, arguments: args });
      try {
        return toResult(await client.callTool("create_product", args as Record<string, unknown>));
      } catch (err) {
        return failed("create_product failed", err);
      }
    },
  );

  server.registerTool(
    "update_product",
    {
      title: "Update Product",
      description:
        "Patch your own product's fields — omitted arguments leave their column unchanged. Takes " +
        "appId (optional when your workspace has only one product); every other field is " +
        "snake_case, the same names create_product takes and for the same reason — the backend " +
        "reads them by exact key. Free — no AI call, just a row.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: z
        .object({
          appId: z
            .number()
            .int()
            .optional()
            .describe("Your product's id. Omit only with a single-app workspace."),
          name: z.string().optional(),
          slug: z.string().optional(),
          description: z.string().optional(),
          website_url: z.string().optional(),
          niche: z.string().optional(),
          product_type: z.string().optional(),
          icon_url: z.string().optional(),
          primary_cta_label: z.string().optional(),
          primary_cta_url: z.string().optional(),
          external_listing_id: z.string().optional(),
          ios_bundle_id: z.string().optional(),
          android_package: z.string().optional(),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.update_product,
    },
    async (args: { appId?: number } & Record<string, unknown>, extra) => {
      const client = await makeClient({ ...extra, arguments: args });
      try {
        return toResult(await client.callTool("update_product", args as Record<string, unknown>));
      } catch (err) {
        return failed("update_product failed", err);
      }
    },
  );

  server.registerTool(
    "get_scheduled_posts",
    {
      title: "Get Scheduled Posts",
      description:
        "Your own scheduled and draft posts in the content pipeline — title, status, scheduled " +
        "time, approval status. What is queued to publish, not what already has (see " +
        "get_post_performance for that). Does not publish or change anything. No cost to call.",
      _meta: viewMeta("get_scheduled_posts"),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: z
        .object({
          appId: z
            .number()
            .int()
            .optional()
            .describe("Your product's id. Omit only with a single-app workspace."),
          limit: z.number().int().optional().describe("Max rows (default 20, capped at 50)."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.get_scheduled_posts,
    },
    async (args: { appId?: number; limit?: number }, extra) => {
      const client = await makeClient({ ...extra, arguments: args });
      try {
        return toResult(await client.callTool("get_scheduled_posts", args));
      } catch (err) {
        return failed("get_scheduled_posts failed", err);
      }
    },
  );

  server.registerTool(
    "get_post_performance",
    {
      title: "Get Post Performance",
      description:
        "Your own already-published posts with their engagement counters — views, likes, " +
        "comments, shares, platform, post date. This is the raw performance history, not an " +
        "interpretation of it; pair with growth_brief for that. No cost to call.",
      _meta: viewMeta("get_post_performance"),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: z
        .object({
          appId: z
            .number()
            .int()
            .optional()
            .describe("Your product's id. Omit only with a single-app workspace."),
          limit: z.number().int().optional().describe("Max rows (default 15, capped at 50)."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.get_post_performance,
    },
    async (args: { appId?: number; limit?: number }, extra) => {
      const client = await makeClient({ ...extra, arguments: args });
      try {
        return toResult(await client.callTool("get_post_performance", args));
      } catch (err) {
        return failed("get_post_performance failed", err);
      }
    },
  );

  server.registerTool(
    "get_video_stats",
    {
      title: "Get Video Stats",
      description:
        "Your own most recently synced video performance stats across every connected creator — " +
        "views, likes, comments, shares, plus a running total. Reads the last sync; does not " +
        "trigger a new one. No cost to call.",
      _meta: viewMeta("get_video_stats"),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: z
        .object({
          appId: z
            .number()
            .int()
            .optional()
            .describe("Your product's id. Omit only with a single-app workspace."),
          limit: z.number().int().optional().describe("Max videos (default 20, capped at 50)."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.get_video_stats,
    },
    async (args: { appId?: number; limit?: number }, extra) => {
      const client = await makeClient({ ...extra, arguments: args });
      try {
        const result = toResult(await client.callTool("get_video_stats", args));
        // Reused rather than given a fourth rendering branch: a video row here
        // (id, title, platform, views, likes, comments, shares) is structurally
        // the same object ui-template.ts's shared "posts gallery" branch
        // already draws (`d.posts && Array.isArray(d.posts)` in renderView) for
        // get_post_performance. `videos` stays untouched for a caller reading
        // the declared field; `posts` is an alias added only so that existing
        // gallery renders it, the same trick show_comment_review plays on the
        // monitoring view's shape.
        const structured = result.structuredContent;
        if (structured && Array.isArray(structured.videos) && structured.posts === undefined) {
          return { ...result, structuredContent: { ...structured, posts: structured.videos } };
        }
        return result;
      } catch (err) {
        return failed("get_video_stats failed", err);
      }
    },
  );

  server.registerTool(
    "get_content_plan",
    {
      title: "Get Content Plan",
      description:
        "The saved weekly content plan for your own product, if one has been generated (see " +
        "generate_content_plan). Read-only and free even when a plan exists — generating a new " +
        "one is the paid step. Returns plan: null when none has been made yet. No cost to call.",
      _meta: viewMeta("get_content_plan"),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: z
        .object({
          // Optional because the backend resolves it: with one product it
          // picks that one, and with several it answers with the choices.
          // Declared required, this `.strict()` schema rejected the very
          // omission the sentence below invites before the call was made.
          appId: z
            .number()
            .int()
            .optional()
            .describe("Your product's id. Omit only with a single-app workspace."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.get_content_plan,
    },
    async (args: { appId?: number }, extra) => {
      const client = await makeClient({ ...extra, arguments: args });
      try {
        return toResult(await client.callTool("get_content_plan", args));
      } catch (err) {
        return failed("get_content_plan failed", err);
      }
    },
  );

  server.registerTool(
    "get_brand_playbook",
    {
      title: "Get Brand Playbook",
      description:
        "Your own product's brand playbook — name, description and the playbook text — if one has " +
        "been configured, in the dashboard or by a previous analyze_product run. Read-only: never " +
        "creates or edits a playbook itself. Returns available: false when none exists yet. Takes " +
        "appId (optional when your workspace has only one product). No cost to call.",
      _meta: viewMeta("get_brand_playbook"),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: z
        .object({
          appId: z
            .number()
            .int()
            .optional()
            .describe("Your product's id. Omit only with a single-app workspace."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.get_brand_playbook,
    },
    async (args: { appId?: number }, extra) => {
      const client = await makeClient({ ...extra, arguments: args });
      try {
        return toResult(await client.callTool("get_brand_playbook", args));
      } catch (err) {
        return failed("get_brand_playbook failed", err);
      }
    },
  );

  server.registerTool(
    "analyze_product",
    {
      title: "Analyze Product",
      description:
        "Start an AI analysis of your own product: fetches an excerpt of the product's own website " +
        "(website_url, if one is set on the product — a real outbound fetch to whatever domain " +
        "was configured, not only nooticr's own stored data), reads its recent posts and fleet " +
        "performance, and writes the result as the product's brand playbook — the same job the " +
        "dashboard's \"Analyze\" button starts, and the one get_brand_playbook reads from " +
        "afterwards. Takes appId (optional when your workspace has only one product). Runs in the " +
        "background: returns a jobId immediately rather than the finished analysis — poll it with " +
        "analyze_product_status. Billed like the dashboard's own analyze job: 10 of your " +
        "workspace's plan AI credits (first analysis free per workspace), a different balance from " +
        "your personal MCP credits and not tracked by check_nooticr_credits.",
      // Not view-less for lack of trying: the immediate reply is only a
      // jobId and state: "pending", nothing to draw yet. analyze_product_status,
      // which returns the finished playbook, is where the view belongs — see
      // scripts/host-contract.py's NO_APP entry for this tool.
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      inputSchema: z
        .object({
          appId: z
            .number()
            .int()
            .optional()
            .describe("Your product's id. Omit only with a single-app workspace."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.analyze_product,
    },
    async (args: { appId?: number }, extra) => {
      const client = await makeClient({ ...extra, arguments: args });
      try {
        return toResult(await client.callTool("analyze_product", args));
      } catch (err) {
        return failed("analyze_product failed", err);
      }
    },
  );

  server.registerTool(
    "analyze_product_status",
    {
      title: "Analyze Product Status",
      description:
        "Poll a job started by analyze_product. Takes jobId. Returns state (pending, thinking, " +
        "done, error) and, once done, the generated analysis/brand playbook. Free to poll — the " +
        "cost was already charged when analyze_product started the job.",
      _meta: viewMeta("analyze_product_status"),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: z
        .object({
          jobId: z.string().describe("The jobId analyze_product returned."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.analyze_product_status,
    },
    async (args: { jobId: string }, extra) => {
      const client = await makeClient({ ...extra, arguments: args });
      try {
        return toResult(await client.callTool("analyze_product_status", args));
      } catch (err) {
        return failed("analyze_product_status failed", err);
      }
    },
  );

  server.registerTool(
    "review_post",
    {
      title: "Review Post",
      description:
        "Score a post before you publish it: hook strength, an optional A-vs-B hook comparison, " +
        "aesthetic and storytelling notes, and rewritten hook/caption suggestions — looking at the " +
        "actual thumbnail/media when one is given. Pass postId to review something already sitting " +
        "in your pipeline (this also saves the review onto that post, same as the dashboard), or " +
        "appId plus the draft fields to review something that only exists as arguments. Nothing is " +
        "published. If the AI reviewer is unavailable the result carries degraded: true and a " +
        "warning — treat those scores as generic placeholders, never as real feedback. Free — " +
        "nothing is billed for this, same as the dashboard's own pre-publish review.",
      _meta: viewMeta("review_post"),
      // Not read-only: given a postId the backend saves the review and score
      // onto that scheduled post (`save_ai_review`), overwriting whatever was
      // there. Free, which is not the same thing — a host that auto-approves
      // read-only tools would let this rewrite pipeline data unattended.
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: z
        .object({
          postId: z.number().int().optional().describe("A post already in your pipeline. Alternative to appId + draft fields."),
          appId: z.number().int().optional().describe("Required when postId is omitted."),
          title: z.string().optional().describe("Draft hook/title A."),
          titleB: z.string().optional().describe("Optional alternative hook, to compare against title."),
          caption: z.string().optional(),
          contentType: z.string().optional(),
          thumbnailUrl: z.string().optional().describe("Looked at by the reviewer when given."),
          mediaItems: z.array(z.unknown()).optional(),
          platform: z.string().optional(),
          influencerId: z.number().int().optional(),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.review_post,
    },
    async (args, extra) => {
      const client = await makeClient({ ...extra, arguments: args });
      try {
        return toResult(await client.callTool("review_post", args as Record<string, unknown>));
      } catch (err) {
        return failed("review_post failed", err);
      }
    },
  );

  server.registerTool(
    "draft_post",
    {
      title: "Draft Post",
      description:
        "Generate a ready-to-use post draft (title, caption, hashtags, and a per-slide script) " +
        "for a topic on your own product, grounded in the product's name. Does not save or " +
        "schedule anything — this only returns the draft text for you to present, refine, or hand " +
        "to a tool that persists it. Billed like the dashboard's own Draft Post button: consumes " +
        "your workspace's plan AI credits, a different balance from your personal MCP credits and " +
        "not tracked by check_nooticr_credits.",
      _meta: viewMeta("draft_post"),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: z
        .object({
          appId: z
            .number()
            .int()
            .optional()
            .describe("Your product's id. Omit only with a single-app workspace."),
          topic: z.string().describe("What the post should be about."),
          contentType: z.string().optional().describe("e.g. video, image, carousel (default video)."),
          slideCount: z.number().int().optional().describe("For carousel/slideshow drafts."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.draft_post,
    },
    async (args: { appId?: number; topic: string; contentType?: string; slideCount?: number }, extra) => {
      const client = await makeClient({ ...extra, arguments: args });
      try {
        return toResult(await client.callTool("draft_post", args));
      } catch (err) {
        return failed("draft_post failed", err);
      }
    },
  );

  server.registerTool(
    "growth_brief",
    {
      title: "Growth Brief",
      description:
        "A plain-language growth brief for your own product: the single most important insight, " +
        "2-4 wins, 2-4 risks and 3-6 concrete next actions — grounded in your real post history " +
        "plus whatever analytics (GA4, Search Console, PostHog) and fleet analysis you have " +
        "synced. It changes nothing of yours, but it is not free: billed like the dashboard's own " +
        "Growth Brief button, from your workspace's plan AI credits rather than your personal " +
        "MCP credits.",
      _meta: viewMeta("growth_brief"),
      // Spending the workspace's plan AI credits (`CREDIT_GROWTH_BRIEF`) is
      // what puts this outside read-only, by the same rule that already
      // covers draft_post and generate_content_plan. It writes no content of
      // the user's, which is why the description says so in those words.
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: z
        .object({
          appId: z
            .number()
            .int()
            .optional()
            .describe("Your product's id. Omit only with a single-app workspace."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.growth_brief,
    },
    async (args: { appId?: number }, extra) => {
      const client = await makeClient({ ...extra, arguments: args });
      try {
        return toResult(await client.callTool("growth_brief", args));
      } catch (err) {
        return failed("growth_brief failed", err);
      }
    },
  );

  server.registerTool(
    "generate_content_plan",
    {
      title: "Generate Content Plan",
      description:
        "Generate a one-week content plan for your own product's creators: day-by-day posts with " +
        "a hook, caption, hashtags and a full production script for each, grounded in what already " +
        "worked in your post history. Saves the generated plan (fetch it later with the free " +
        "get_content_plan) but does not schedule or publish any post. Billed like the dashboard's " +
        "own Content Plan button: your workspace's plan AI credits, not your personal MCP credits.",
      _meta: viewMeta("generate_content_plan"),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: z
        .object({
          appId: z
            .number()
            .int()
            .optional()
            .describe("Your product's id. Omit only with a single-app workspace."),
          weekStart: z.string().optional().describe("ISO date. Defaults to next Monday."),
          influencerIds: z
            .array(z.number().int())
            .optional()
            .describe("Subset of your creators to plan for. Defaults to all live ones."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.generate_content_plan,
    },
    async (
      args: { appId?: number; weekStart?: string; influencerIds?: number[] },
      extra,
    ) => {
      const client = await makeClient({ ...extra, arguments: args });
      try {
        return toResult(await client.callTool("generate_content_plan", args));
      } catch (err) {
        return failed("generate_content_plan failed", err);
      }
    },
  );

  server.registerTool(
    "generate_captions",
    {
      title: "Generate Captions",
      description:
        "Generate timed on-screen caption cues for a video on your own product — a transcript " +
        "plus start/end-timed lines. Does not burn captions onto any video or touch stored media; " +
        "only returns the cue data. If no AI provider is configured the result carries " +
        "provider: \"mock\" placeholder captions instead of failing — check that field before " +
        "treating the captions as real. Billed like the dashboard's own Generate Captions button: " +
        "your workspace's plan AI credits, not your personal MCP credits.",
      _meta: viewMeta("generate_captions"),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: z
        .object({
          appId: z
            .number()
            .int()
            .optional()
            .describe("Your product's id. Omit only with a single-app workspace."),
          durationSec: z.number().optional().describe("Video length in seconds (default 8, max 180)."),
          title: z.string().optional(),
          caption: z.string().optional(),
          videoUrl: z.string().optional(),
          transcriptHint: z.string().optional().describe("Known dialogue/voiceover, if any, to ground the cues."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.generate_captions,
    },
    async (
      args: {
        appId?: number;
        durationSec?: number;
        title?: string;
        caption?: string;
        videoUrl?: string;
        transcriptHint?: string;
      },
      extra,
    ) => {
      const client = await makeClient({ ...extra, arguments: args });
      try {
        return toResult(await client.callTool("generate_captions", args));
      } catch (err) {
        return failed("generate_captions failed", err);
      }
    },
  );
}
