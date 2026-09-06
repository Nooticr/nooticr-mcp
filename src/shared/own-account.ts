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
 * Billing is not uniform across these tools, and that is deliberate, not a
 * bug to paper over:
 *  - list_own_apps and get_content_plan are free reads.
 *  - create_product and update_product write a plain row in the caller's own
 *    workspace. No upstream call and no AI call, so no charge.
 *  - review_post calls AI but the dashboard's own pre-publish review has
 *    never billed for it, so neither does this.
 *  - draft_post, growth_brief, generate_content_plan and generate_captions
 *    spend the workspace's plan AI credits — a different balance from the
 *    personal MCP credits every other tool in this file spends, and one
 *    check_nooticr_credits does not report on. Their descriptions say so
 *    explicitly rather than implying "free" by omitting a credit count.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { NooticrClient, McpProxyResult } from "./nooticr.js";
import { OUTPUT_SCHEMAS } from "./output-schemas.js";

interface MakeClient {
  (ctx: { authInfo?: AuthInfo; requestId?: string | number; arguments?: unknown }):
    | Promise<NooticrClient>
    | NooticrClient;
}

/** Same view-per-tool shape jobs.ts uses — kept local to avoid an import
 * cycle back into tools.ts, which is what registers these tools' URIs. */
const viewMeta = (tool: string) => ({
  ui: { resourceUri: `ui://nooticr/${tool}` },
  "ui/resourceUri": `ui://nooticr/${tool}`,
  "openai/outputTemplate": `ui://nooticr/${tool}.html`,
});

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

/**
 * The optional product fields, shared by create and update.
 *
 * Declared once rather than twice because the two must not drift: `update`
 * takes exactly the fields `create` takes, and the moment one grows a field
 * the other does not, a patch silently stops being able to change something a
 * create could set.
 */
const PRODUCT_FIELDS = {
  description: z.string().optional(),
  website_url: z
    .string()
    .optional()
    .describe(
      "The product's own site. analyze_product later fetches an excerpt of this page as part " +
        "of its analysis.",
    ),
  niche: z.string().optional(),
  product_type: z.string().optional().describe('e.g. "app", "saas", "physical".'),
  icon_url: z.string().optional(),
  primary_cta_label: z.string().optional().describe('Call-to-action button text, e.g. "Get the app".'),
  primary_cta_url: z.string().optional().describe("Where the call-to-action button links."),
  external_listing_id: z
    .string()
    .optional()
    .describe("App Store / Play Store listing id, if this product has one."),
  ios_bundle_id: z.string().optional(),
  android_package: z.string().optional(),
} as const;

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

  server.registerTool(
    "create_product",
    {
      title: "Create Product",
      description:
        "Create a product in your own workspace — the row every other own-account tool needs " +
        "before it has anything to work with; a fresh workspace has none. Takes no workspace " +
        "argument: it always creates in the workspace of the session calling it, never one " +
        "you could name. name and slug are required; every other field is optional and all of " +
        "them are snake_case, read by exact key — a camelCase websiteUrl is not an alias, it " +
        "is a field that lands nowhere. Subject to your plan's product limit; the error names " +
        "the limit if you hit it. Does not generate a brand playbook — that is analyze_product, " +
        "and that is the call that costs. Free — no AI call, just a row.",
      _meta: viewMeta("create_product"),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: z
        .object({
          name: z.string().describe("Product name."),
          slug: z.string().describe("URL-safe slug, unique within your workspace."),
          ...PRODUCT_FIELDS,
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
        "Patch your own product's fields — omitted arguments leave their column unchanged, so " +
        "this cannot blank a field by not mentioning it. Takes appId, optional when your " +
        "workspace has exactly one product; every other field is snake_case, the same names " +
        "create_product takes and read the same way. The result lists which fields were " +
        "actually written, so a name you spelled wrong shows up as a field that did not " +
        "change rather than as a silent no-op. Free — no AI call, just a row.",
      _meta: viewMeta("update_product"),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: z
        .object({
          appId: z
            .number()
            .int()
            .optional()
            .describe("Your product's id. Omit only with a single-product workspace."),
          name: z.string().optional(),
          slug: z.string().optional(),
          ...PRODUCT_FIELDS,
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.update_product,
    },
    async (args, extra) => {
      const client = await makeClient({ ...extra, arguments: args });
      try {
        return toResult(await client.callTool("update_product", args as Record<string, unknown>));
      } catch (err) {
        return failed("update_product failed", err);
      }
    },
  );
}
