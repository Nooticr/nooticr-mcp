/**
 * The free read half of nooticr-server's `creative_*` family (CR1): list the
 * creative assets generated in the workspace and poll one asynchronous job.
 * Both are passthroughs to the server's `POST /mcp` dispatch, which owns the
 * tenancy check (another workspace's id answers "not found").
 *
 * The ElevenLabs half (CR2): `creative_voices_search` is free; `creative_voiceover`,
 * `creative_sfx` and `creative_music` are paid and use the server's quote-then-confirm
 * handshake. The remaining paid creative tools (image, video, ...) register here when
 * they ship; `creative_test_render` is a server test fixture and is never registered.
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

function failed(prefix: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: `${prefix}: ${msg}` }],
    isError: true as const,
  };
}

export const CREATIVE_ASSET_KINDS = ["voiceover", "sfx", "music", "image", "video", "composite"] as const;

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
        "(ISO timestamp). Pass the returned nextCursor as cursor for the next page. No cost to call.",
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
        "after pollAfterSeconds. No cost to call.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: z.object({ jobId: z.string().uuid().describe("jobId returned when the job was started.") }).strict(),
      outputSchema: OUTPUT_SCHEMAS.creative_job_status,
    },
    passthrough("creative_job_status"),
  );

  const voiceRef = z
    .object({ publicOwnerId: z.string(), voiceId: z.string() })
    .strict()
    .describe("A voiceRef from creative_voices_search.");
  const handshake = {
    briefId: z.string().optional(),
    confirm: z.boolean().optional().describe("Set true only once the user has agreed to the quoted credits."),
    confirmationToken: z.string().optional().describe("The token the quote returned."),
  };
  const paidAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
  const NO_LIKENESS = " No real people's likeness or voice, no copyrighted music, logos or characters.";

  server.registerTool(
    "creative_voices_search",
    {
      title: "Search Creative Voices",
      description:
        "Search ElevenLabs' voice library for a voice to use in creative_voiceover. Library voices " +
        "only, never a real person's cloned voice. Returns voiceRef, name, labels, language, accent " +
        "and previewUrl. No cost to call.",
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
        "cloning. quality: final (default) or draft (cheaper, faster). The first call is a free price " +
        "quote in credits (vendor cost plus markup, never above the quote); nothing is charged until " +
        "you confirm. Show the user the credits and ask before calling again with confirm: true and " +
        "the confirmationToken." + NO_LIKENESS,
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
        "credits and ask before calling again with confirm: true and the confirmationToken." + NO_LIKENESS,
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
        "creative_job_status every 10-20 s." + NO_LIKENESS,
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
}
