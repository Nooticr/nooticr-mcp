/**
 * The free read half of nooticr-server's `creative_*` family (CR1): list the
 * creative assets generated in the workspace and poll one asynchronous job.
 * Both are passthroughs to the server's `POST /mcp` dispatch, which owns the
 * tenancy check (another workspace's id answers "not found").
 *
 * The paid creative tools (CR2-CR6) register here when they ship;
 * `creative_test_render` is a server test fixture and is never registered.
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
}
