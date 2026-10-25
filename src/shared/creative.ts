/**
 * The free read half of nooticr-server's `creative_*` family (CR1): list the
 * creative assets generated in the workspace and poll one asynchronous job.
 * Both are passthroughs to the server's `POST /mcp` dispatch, which owns the
 * tenancy check (another workspace's id answers "not found").
 *
 * The paid creative tools register here when they ship. The ElevenLabs half (CR2):
 * `creative_voices_search` is free; `creative_voiceover`, `creative_sfx` and `creative_music` are paid.
 * `creative_image` and `creative_image_edit` (CR3) and `creative_video` (CR4) are paid. All paid tools use the server's
 * quote-then-confirm handshake. `creative_test_render` is a server test fixture and is never registered;
 * `creative_allowance_status` is backend-only (see backend-only.ts). `creative_upscale` has no server handler yet.
 * Neither tool has a view yet: the asset list would be a gallery, which the
 * design system has no card for.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { NooticrClient, McpProxyResult } from "./nooticr.js";
import { OUTPUT_SCHEMAS } from "./output-schemas.js";
import { failed } from "./passthrough.js";

interface MakeClient {
  (ctx: { authInfo?: AuthInfo; requestId?: string | number; arguments?: unknown }):
    | Promise<NooticrClient>
    | NooticrClient;
}

function toResult(proxy: McpProxyResult) {
  const textBlock = proxy.contentBlocks.find((c) => c.type === "text");
  const structured = proxy.structured as Record<string, unknown> | undefined;
  // The assets and the job's finished outputs are in `structuredContent`; with no
  // view here the model reads them from the text, so carry the payload in both.
  const text = structured ? JSON.stringify(structured) : String(textBlock?.text ?? "");
  return { content: [{ type: "text" as const, text }], structuredContent: structured };
}

export const CREATIVE_ASSET_KINDS = ["voiceover", "sfx", "music", "image", "video", "composite"] as const;
/** As the server's BRIEF_STATUSES (crates/db/src/creative_briefs.rs). */
export const CREATIVE_BRIEF_STATUSES = ["open", "in_progress", "awaiting_pick", "picked", "delivered", "canceled", "failed"] as const;

export function registerCreativeTools(server: McpServer, makeClient: MakeClient): void {
  const passthrough = (name: string) => async (args: Record<string, unknown>, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => {
    const client = await makeClient({ ...extra, arguments: args });
    try {
      return toResult(await client.callTool(name, args));
    } catch (err) {
      return failed(`${name} failed`, err);
    }
  };

  server.registerTool(
    "creative_assets_list",
    {
      title: "List Creative Assets",
      description:
        "List the creative assets (voice-overs, sound effects, music, images, videos, composites) " +
        "generated in this workspace, newest first. Optional filters: appId, kind, briefId, since " +
        "(ISO timestamp). Pass the returned nextCursor as cursor for the next page. No cost to call. Use to find assets generated earlier, for example to pass their ids to creative_image_edit.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: z
        .object({
          appId: z.number().int().optional().describe("Only this product's assets."),
          kind: z.enum(CREATIVE_ASSET_KINDS).optional(),
          briefId: z.string().uuid().optional(),
          since: z.string().datetime({ offset: true }).optional().describe("ISO 8601 timestamp."),
          limit: z.number().int().min(1).max(100).optional(),
          cursor: z.string().optional().describe("nextCursor from the previous page."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.creative_assets_list,
    },
    passthrough("creative_assets_list"),
  );

  server.registerTool(
    "creative_job_status",
    {
      title: "Creative Job Status",
      description:
        "Status of an asynchronous creative job by jobId: queued, running, done, failed or " +
        "canceled, with the finished assets and the credits quoted, charged and refunded. Poll " +
        "after pollAfterSeconds. No cost to call. Use after a creative tool returns a jobId, until the job is done or failed.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: z.object({ jobId: z.string().uuid().describe("jobId returned when the job was started.") }).strict(),
      outputSchema: OUTPUT_SCHEMAS.creative_job_status,
    },
    passthrough("creative_job_status"),
  );

  const imageSize = z
    .enum(["1024x1536", "1024x1024", "1536x1024", "1088x1920", "1088x1360"])
    .optional()
    .describe("Default 1024x1536 (portrait).");
  const voiceRef = z
    .object({ publicOwnerId: z.string(), voiceId: z.string() })
    .strict()
    .describe("A voiceRef from creative_voices_search.");
  const handshake = {
    briefId: z.string().uuid().optional().describe("Optional. The id of the creative brief this is for, from creative_brief_list. Leave it out when there is none, as for a request made in chat."),
    confirm: z.boolean().optional().describe("Set true only once the user has agreed to the quoted credits."),
    confirmationToken: z.string().optional().describe("The token the quote returned."),
  };
  const paidAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
  const NO_LIKENESS = " No real people's likeness or voice, no copyrighted music, logos or characters.";

    server.registerTool(
    "creative_image",
    {
      title: "Create Images",
      description:
        "Generate 1-4 still images with GPT Image (low quality setting) and store them as " +
        "creative assets. The prompt is up to 4000 characters; do not put long text in it (put " +
        "long text in a caption overlay) and do not ask for real named people. The first call is a free " +
        "price quote in credits; nothing is charged until you confirm. Show the user the credits and " +
        "ask before calling again with the same arguments plus confirm: true and the " +
        "confirmationToken. Settles to the real usage, never above the quote. Returns assets and " +
        "creativeCredits. Use when the user asks for new still images for a post or campaign.",
      annotations: paidAnnotations,
      inputSchema: z
        .object({
          appId: z.number().int(),
          prompt: z.string().min(1).max(4000),
          size: imageSize,
          n: z.number().int().min(1).max(4).optional(),
          transparent: z.boolean().optional(),
          ...handshake,
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.creative_image,
    },
    passthrough("creative_image"),
  );

  server.registerTool(
    "creative_image_edit",
    {
      title: "Edit Images",
      description:
        "Edit or combine 1-4 existing creative image assets (imageAssetIds, from creative_assets_list " +
        "or a previous creative_image) with GPT Image (low quality), with an optional maskAssetId, and " +
        "store the result as a new asset. The first call is a free price quote in credits; nothing is " +
        "charged until you confirm. Show the user the credits and ask before calling again with " +
        "confirm: true and the confirmationToken. Returns assets and creativeCredits. Use when the user wants to change or combine images already generated in this workspace.",
      annotations: paidAnnotations,
      inputSchema: z
        .object({
          appId: z.number().int(),
          prompt: z.string().min(1).max(4000),
          imageAssetIds: z.array(z.string().uuid()).min(1).max(4).describe("1-4 image asset ids, from creative_assets_list or a previous creative_image."),
          maskAssetId: z.string().uuid().optional().describe("Optional. An image asset id, from creative_assets_list, to use as the edit mask."),
          size: imageSize,
          ...handshake,
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.creative_image_edit,
    },
    passthrough("creative_image_edit"),
  );

  server.registerTool(
    "creative_voices_search",
    {
      title: "Search Creative Voices",
      description:
        "Search ElevenLabs' voice library for a voice to use in creative_voiceover. Library voices " +
        "only, never a real person's cloned voice. Returns voiceRef, name, labels, language, accent " +
        "and previewUrl. No cost to call. Use before creative_voiceover to pick a voice.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: z
        .object({
          query: z.string().optional(),
          language: z.string().optional().describe("e.g. en, fr, es."),
          accent: z.string().optional(),
          gender: z.enum(["male", "female", "neutral"]).optional(),
          age: z.enum(["young", "middle_aged", "old"]).optional(),
          useCase: z.enum(["narration", "social_media", "advertisement", "conversational", "characters"]).optional(),
          limit: z.number().int().min(1).max(20).optional(),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.creative_voices_search,
    },
    passthrough("creative_voices_search"),
  );

  server.registerTool(
    "creative_voiceover",
    {
      title: "Create Voice-over",
      description:
        "Voice-over with word timings (for burned-in captions); the text is spoken verbatim, up to 2500 " +
        "characters. Pass a voiceRef (or voiceId) from creative_voices_search; library voices only, no " +
        "cloning. quality: final (default) or draft (lower price, shorter render time). The first call is a free price " +
        "quote in credits (vendor cost plus markup, never above the quote); nothing is charged until " +
        "you confirm. Show the user the credits and ask before calling again with confirm: true and " +
        "the confirmationToken." + NO_LIKENESS + " Use when the user needs spoken narration for a video.",
      annotations: paidAnnotations,
      inputSchema: z
        .object({
          appId: z.number().int(),
          text: z.string().min(1).max(2500),
          voiceRef: voiceRef.optional(),
          voiceId: z.string().optional(),
          quality: z.enum(["final", "draft"]).optional(),
          stability: z.number().min(0).max(1).optional(),
          style: z.number().min(0).max(1).optional(),
          speed: z.number().min(0.7).max(1.2).optional(),
          ...handshake,
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.creative_voiceover,
    },
    passthrough("creative_voiceover"),
  );

  server.registerTool(
    "creative_sfx",
    {
      title: "Create Sound Effect",
      description:
        "Generate a short sound effect (0.5-10 s) from a description of up to 300 characters; the text " +
        "is a prompt, not spoken. The first call is a free price quote in credits; nothing is charged until you confirm. Show the user the " +
        "credits and ask before calling again with confirm: true and the confirmationToken." + NO_LIKENESS + " Use when the user needs a short sound effect for a video.",
      annotations: paidAnnotations,
      inputSchema: z
        .object({
          appId: z.number().int(),
          description: z.string().min(1).max(300),
          durationSeconds: z.number().min(0.5).max(10).optional(),
          ...handshake,
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.creative_sfx,
    },
    passthrough("creative_sfx"),
  );

  server.registerTool(
    "creative_music",
    {
      title: "Create Music Bed",
      description:
        "Instrumental music bed, 5-60 seconds, as an asynchronous job. Describe mood, tempo and " +
        "instruments, not artists or songs. May be switched off on this deployment (it then says so " +
        "and offers stock music). The first call is a free price quote in credits; nothing is charged until you confirm. Show the user the " +
        "credits and ask before calling again with confirm: true and the confirmationToken, then poll " +
        "creative_job_status every 10-20 s." + NO_LIKENESS + " Use when the user needs background music for a video.",
      annotations: paidAnnotations,
      inputSchema: z
        .object({
          appId: z.number().int(),
          prompt: z.string().min(1).max(500),
          durationSeconds: z.number().int().min(5).max(60),
          ...handshake,
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.creative_music,
    },
    passthrough("creative_music"),
  );
  server.registerTool(
    "creative_video",
    {
      title: "Create Video Clip",
      description:
        "Generate one short video clip (3-30 s, draft quality) and store it as a creative asset, as an asynchronous job. Optional firstFrameAssetId (an image asset to start from) or up to 3 referenceAssetIds (images to stay consistent with), not both. Audio is ambient sound only; voice-over and music come from creative_voiceover and creative_music. Generates only: it cannot edit an uploaded video. The clip is rendered at the nearest length the video model offers; the first call is a free price quote in credits for that length, and says which length. Nothing is charged until you confirm. Show the user the credits and ask before calling again with the same arguments plus confirm: true and the confirmationToken, then poll creative_job_status every 10-20 s." + NO_LIKENESS + " Use when the user needs a short generated video clip.",
      annotations: paidAnnotations,
      inputSchema: z
        .object({
          appId: z.number().int(),
          prompt: z.string().min(1).max(2000),
          durationSeconds: z.number().int().min(3).max(30).optional().describe("Length to aim for; default 6. Rendered at the nearest length the model offers."),
          aspect: z.enum(["9:16", "16:9"]).optional().describe("Default 9:16 (vertical)."),
          firstFrameAssetId: z.string().uuid().optional().describe("An image asset to start the clip from."),
          referenceAssetIds: z.array(z.string().uuid()).min(1).max(3).optional().describe("Up to 3 image assets to stay consistent with."),
          audio: z.enum(["ambient", "none"]).optional().describe("Default ambient. Never dialogue or music."),
          ...handshake,
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.creative_video,
    },
    passthrough("creative_video"),
  );

  // CR6: the compose step. Paid, one flat render; ffmpeg on the server, so the only
  // outside call is optional stock music.
  const composeSegment = z
    .object({
      assetId: z.string().uuid().describe("An asset id, from creative_assets_list or the creative tool that made it."),
      start: z.number().min(0).optional(),
      end: z.number().min(0).optional(),
      motion: z.enum(["zoom_in", "zoom_out", "pan_left", "pan_right", "none"]).optional(),
      overlayText: z.string().max(120).optional(),
    })
    .strict();
  server.registerTool(
    "creative_compose",
    {
      title: "Compose Video",
      description:
        "Assemble this workspace's creative assets (clips, stills, a voice-over, music, sound effects) into one " +
        "finished vertical video (9:16, 4:5 or 1:1) or a feed still: voice-synced captions inside the platform's " +
        "safe zone, the product's brand colours and font, music under the voice, SFX on the cuts and an optional " +
        "end card. Up to 12 segments, 60 seconds and 6 SFX; every asset must belong to the same product. Set " +
        "draft: true for a lower-priced 540-wide preview. music may be {assetId} or {source: \"stock\", query} for free " +
        "stock music. The first call is a free price quote in credits for one flat render; nothing is charged until " +
        "you confirm. Show the user the credits and ask before calling again with the same arguments plus confirm: " +
        "true and the confirmationToken, then poll creative_job_status. The result is a composite asset; it never " +
        "publishes. Use when the user has generated clips, images or audio and wants them cut into one post.",
      annotations: paidAnnotations,
      inputSchema: z
        .object({
          appId: z.number().int(),
          aspect: z.enum(["9:16", "4:5", "1:1"]).optional(),
          draft: z.boolean().optional().describe("A lower-priced 540-wide preview."),
          segments: z.array(composeSegment).min(1).max(12),
          voiceoverAssetId: z.string().uuid().optional().describe("Optional. A voice-over asset id, from creative_voiceover or creative_assets_list."),
          captions: z
            .union([
              z.enum(["voiceover", "none"]),
              z.array(z.object({ text: z.string(), start: z.number(), end: z.number() }).strict()),
            ])
            .optional()
            .describe("\"voiceover\" (from the voice-over's word timings; the default when one is given), \"none\", or your own lines with start/end in seconds."),
          music: z
            .union([
              z.object({ assetId: z.string().uuid().describe("A music asset id, from creative_music or creative_assets_list.") }).strict(),
              z.object({ source: z.literal("stock"), query: z.string() }).strict(),
              z.null(),
            ])
            .optional(),
          sfx: z.array(z.object({ assetId: z.string().uuid().describe("A sound-effect asset id, from creative_sfx or creative_assets_list."), at: z.number().min(0) }).strict()).max(6).optional(),
          safeZone: z.enum(["tiktok", "reels", "shorts", "feed"]).optional(),
          brandKit: z.boolean().optional(),
          endCard: z.object({ text: z.string().max(60), seconds: z.number().min(0.5).max(5).optional() }).strict().optional(),
          output: z.enum(["video", "image"]).optional(),
          ...handshake,
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.creative_compose,
    },
    passthrough("creative_compose"),
  );

  // CR8: read-only view of the workspace's creative spend limits.
  server.registerTool(
    "creative_settings_get",
    {
      title: "Creative Spend Limits",
      description:
        "This workspace's limits on creative spend: the daily and monthly credit caps in force, the per-call cap, " +
        "whether generated music is on, and what has been spent in the last 24 hours and this calendar month. Only " +
        "a workspace owner or admin can change these, in the dashboard settings; no tool here can. No cost to call. " +
        "Use to explain a creative call refused for a cap.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: z
        .object({ appId: z.number().int().optional().describe("Optional: the workspace of this product.") })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.creative_settings_get,
    },
    passthrough("creative_settings_get"),
  );

  // CR7: the creative brief queue. Free; the server holds the status rules and the
  // picking (a person picks winners in the dashboard, never a tool).
  server.registerTool(
    "creative_brief_create",
    {
      title: "Create Creative Brief",
      description:
        "File a creative brief: ask for short videos, images or voice-overs for one product. The workspace's " +
        "Creative Producer employee works the queue; when none is hired, a teammate picks the brief up in " +
        "Creatives. pick: \"human\" (default) waits for a person to choose the winning drafts; \"producer\" lets " +
        "the producer choose. No cost to call. Use when the user wants creative made for a product rather than " +
        "generating it themselves.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: z
        .object({
          appId: z.number().int().describe("The product the creative is for."),
          brief: z.string().min(1).max(6000).describe("What to make and why (1-6000 characters)."),
          platforms: z.array(z.string()).min(1).max(8).describe("Where it will be posted, 1 to 8, e.g. tiktok, instagram, youtube."),
          audience: z.string().optional(),
          hook: z.string().optional().describe("The hook or angle to lead with."),
          voiceNotes: z.string().optional().describe("Brand-voice notes."),
          variants: z.number().int().min(1).max(4).optional(),
          pick: z.enum(["human", "producer"]).optional(),
          budgetCredits: z.number().int().min(1).max(2000).optional(),
          slotAt: z.string().optional().describe("ISO 8601 time to post at."),
          influencerId: z.number().int().optional().describe("The account to post as."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.creative_brief_create,
    },
    passthrough("creative_brief_create"),
  );

  server.registerTool(
    "creative_brief_list",
    {
      title: "List Creative Briefs",
      description:
        "This workspace's creative briefs with their draft, picked and delivered assets. Filtered by status they " +
        "come oldest first (the order the queue is worked in); unfiltered, newest first. limit is at most 50. No " +
        "cost to call. Use to see what creative is queued, waiting for a pick, or delivered.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: z
        .object({
          status: z.enum(CREATIVE_BRIEF_STATUSES).optional(),
          appId: z.number().int().optional(),
          limit: z.number().int().min(1).max(50).optional(),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.creative_brief_list,
    },
    passthrough("creative_brief_list"),
  );

  server.registerTool(
    "creative_brief_update",
    {
      title: "Update Creative Brief",
      description:
        "Move a creative brief along and attach what was made: open -> in_progress -> awaiting_pick, delivered or " +
        "failed; picked -> in_progress -> delivered; canceled by a person or by whoever asked for the brief. The " +
        "asset and action id lists replace what the brief held. Winners are picked by a person in the dashboard, " +
        "never here. No cost to call. Use when work on a brief moves on or produces drafts.",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      inputSchema: z
        .object({
          briefId: z.string().uuid().describe("Id from creative_brief_list or creative_brief_create."),
          status: z.enum(["in_progress", "awaiting_pick", "delivered", "failed", "canceled"]).optional(),
          notes: z.string().optional(),
          draftAssetIds: z.array(z.string().uuid()).max(12).optional(),
          deliveredAssetIds: z.array(z.string().uuid()).max(12).optional(),
          actionIds: z.array(z.string().uuid()).max(12).optional(),
          creditsSpent: z.number().int().min(0).optional(),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.creative_brief_update,
    },
    passthrough("creative_brief_update"),
  );
}
