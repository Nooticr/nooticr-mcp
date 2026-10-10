/**
 * Replying to comments on the user's own posts (nooticr-server R1).
 *
 * Three tools, in the order a reply travels: list what is waiting, draft one
 * reply (stored, nothing sent), post it. The first two never write to a
 * network. `post_comment_reply` does, as the user's own account, so it needs
 * the exact draft the user saw: the draftId, `confirm: true` and the
 * confirmationToken that `draft_comment_reply` returned. The server enforces
 * that; the schema here requires all three so a model cannot omit one.
 *
 * Thin passthroughs, like connections.ts: the server owns the rules.
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

const platform = z.enum(["youtube", "instagram"]);

export function registerReplyTools(server: McpServer, makeClient: MakeClient): void {
  server.registerTool(
    "list_comments_to_answer",
    {
      title: "List Comments To Answer",
      description:
        "List recent comments on the user's own connected account that nobody has answered yet, " +
        "newest first. Only the user's own posts, through their own connection: YouTube works once " +
        "connected with capabilities: [\"manage_comments\"] (see connect_social_account); networks " +
        "that cannot be answered come back under `unsupported` with the reason. Optional platform, " +
        "influencerId, postId, sinceDays (1-30, default 7), limit (1-100, default 30), " +
        "includeAnswered. Read-only: it sends nothing. No cost to call.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      outputSchema: OUTPUT_SCHEMAS.list_comments_to_answer,
      inputSchema: z
        .object({
          platform: platform.optional().describe("Only this network."),
          influencerId: z.number().int().optional().describe("Creator profile id when more than one account is connected."),
          postId: z.string().optional().describe("Only comments on this video/media id."),
          sinceDays: z.number().int().min(1).max(30).optional().describe("How far back to look (default 7)."),
          limit: z.number().int().min(1).max(100).optional().describe("Most comments to return (default 30)."),
          includeAnswered: z.boolean().optional().describe("Also list comments that already have a reply."),
        })
        .strict(),
    },
    async (args: Record<string, unknown>, extra) => {
      const client = await makeClient({ ...extra, arguments: args });
      try {
        return toResult(await client.callTool("list_comments_to_answer", args));
      } catch (err) {
        return failed("list_comments_to_answer failed", err);
      }
    },
  );

  server.registerTool(
    "draft_comment_reply",
    {
      title: "Draft Comment Reply",
      description:
        "Draft a reply to one comment from list_comments_to_answer and store it; nothing is " +
        "posted. Pass `text` to use the user's own wording (no cost), or omit it and nooticr " +
        "writes one (costs 1 nooticr credit); `guidance` steers the writing. Replies may not contain links, " +
        "emails, phone numbers or @-mentions of anyone but the commenter. Returns a draftId and a " +
        "confirmationToken: show the reply to the user first, then post it with post_comment_reply.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      outputSchema: OUTPUT_SCHEMAS.draft_comment_reply,
      inputSchema: z
        .object({
          platform: platform.describe("The network the comment is on."),
          commentId: z.string().describe("Comment id from list_comments_to_answer."),
          postId: z.string().describe("Post id the comment is on."),
          text: z.string().optional().describe("The reply to store, in the user's words. Omit to have one written (1 credit)."),
          influencerId: z.number().int().optional().describe("Creator profile id when more than one account is connected."),
          guidance: z.string().optional().describe("What the reply should say or avoid; a URL here is the only URL the reply may contain."),
        })
        .strict(),
    },
    async (args: Record<string, unknown>, extra) => {
      const client = await makeClient({ ...extra, arguments: args });
      try {
        return toResult(await client.callTool("draft_comment_reply", args));
      } catch (err) {
        return failed("draft_comment_reply failed", err);
      }
    },
  );

  server.registerTool(
    "post_comment_reply",
    {
      title: "Post Comment Reply",
      description:
        "Post a stored reply draft to the comment, as the user's own account. Only after the user " +
        "has seen and agreed to the exact text: pass the draftId, confirm: true and the " +
        "confirmationToken from draft_comment_reply. Each comment is answered at most once and " +
        "daily limits apply. It writes to a third-party network and cannot be undone from here. " +
        "No cost to call.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      outputSchema: OUTPUT_SCHEMAS.post_comment_reply,
      inputSchema: z
        .object({
          draftId: z.string().describe("Draft id from draft_comment_reply."),
          confirm: z.boolean().describe("true only once the user has agreed to the exact text."),
          confirmationToken: z.string().describe("Token returned with the draft."),
        })
        .strict(),
    },
    async (args: Record<string, unknown>, extra) => {
      const client = await makeClient({ ...extra, arguments: args });
      try {
        return toResult(await client.callTool("post_comment_reply", args));
      } catch (err) {
        return failed("post_comment_reply failed", err);
      }
    },
  );
}
