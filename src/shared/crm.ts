/**
 * Creator CRM (nooticr-server E1): the workspace's creator pipeline. Every tool
 * here is a passthrough to the server's `POST /mcp` dispatch; the server owns
 * the tenancy check, the status rules (an AI employee may only use prospect,
 * shortlisted or paused, cannot log outreach_sent, and cannot leave
 * do_not_contact) and the history. `status_change` is not a loggable kind: only
 * crm_update_status writes it.
 *
 * None of these has a view: the pipeline would be a table the design system has
 * no card for, and the other three are pure state mutations.
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
  // No view here, so the model reads the payload from the text: carry it in both.
  const text = structured ? JSON.stringify(structured) : String(textBlock?.text ?? "");
  return { content: [{ type: "text" as const, text }], structuredContent: structured };
}

/** Pipeline statuses, as the server's CRM_STATUSES. */
export const CRM_STATUSES = ["prospect", "shortlisted", "contacted", "replied", "negotiating", "active", "paused", "declined", "do_not_contact"] as const;
/** Kinds crm_log_interaction accepts, as the server's CRM_INTERACTION_KINDS (no status_change). */
export const CRM_INTERACTION_KINDS = ["note", "vetting", "outreach_draft", "outreach_sent", "reply", "deliverable"] as const;

export function registerCrmTools(server: McpServer, makeClient: MakeClient): void {
  const passthrough = (name: string) => async (args: Record<string, unknown>, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => {
    const client = await makeClient({ ...extra, arguments: args });
    try {
      return toResult(await client.callTool(name, args));
    } catch (err) {
      return failed(`${name} failed`, err);
    }
  };

  server.registerTool(
    "crm_upsert_creator",
    {
      title: "Upsert Creator",
      description:
        "Use when you want to track a creator or record new numbers for one already tracked. " +
        "Add a creator to this workspace's creator pipeline, or update the one already there " +
        "(matched by platform + handle, case-insensitive). Only the fields you pass change. New " +
        "creators start as 'prospect'; use crm_update_status to change that. Put every number you " +
        "cite in `evidence` as [{tool, url, metric, value, at}]. engagementRate is a fraction " +
        "(0.052 = 5.2%). No cost to call.",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      inputSchema: z
        .object({
          platform: z.string().describe("tiktok, instagram, youtube, ..."),
          handle: z.string(),
          displayName: z.string().optional(),
          profileUrl: z.string().optional(),
          followers: z.number().int().min(0).optional(),
          avgViews: z.number().int().min(0).optional(),
          engagementRate: z.number().min(0).max(1).optional(),
          niche: z.string().optional(),
          country: z.string().optional(),
          contactEmail: z.string().optional().describe("Only an address the creator published."),
          fitScore: z.number().int().min(0).max(100).optional(),
          fitReasons: z.array(z.string()).optional(),
          risks: z.array(z.string()).optional(),
          evidence: z.array(z.object({}).passthrough()).optional(),
          nextStep: z.string().optional(),
          nextStepDue: z.string().optional().describe("YYYY-MM-DD"),
          appId: z.number().int().optional().describe("Product this creator is for."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.crm_upsert_creator,
    },
    passthrough("crm_upsert_creator"),
  );

  server.registerTool(
    "crm_list_creators",
    {
      title: "List Creators",
      description:
        "Use when someone asks who is in their creator pipeline or which next steps are due. " +
        "List the workspace's creator pipeline, most recently updated first, each with its last " +
        "interaction. Filter by status, appId, query (handle or name) or dueBefore (next step due " +
        "on or before YYYY-MM-DD). limit is at most 100. No cost to call.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: z
        .object({
          status: z.enum(CRM_STATUSES).optional(),
          appId: z.number().int().optional(),
          query: z.string().optional(),
          limit: z.number().int().min(1).max(100).optional(),
          dueBefore: z.string().optional().describe("YYYY-MM-DD"),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.crm_list_creators,
    },
    passthrough("crm_list_creators"),
  );

  server.registerTool(
    "crm_update_status",
    {
      title: "Update Creator Status",
      description:
        "Use when a creator moves forward or back in the pipeline, for example after a reply or a decision. " +
        "Move a creator to a new pipeline status and record why (writes a status_change entry). " +
        "A creator marked do_not_contact stays that way unless a person changes it. AI employees " +
        "may only use prospect, shortlisted or paused. No cost to call.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: z
        .object({
          creatorId: z.string().describe("Id from crm_list_creators."),
          status: z.enum(CRM_STATUSES),
          note: z.string().describe("Why."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.crm_update_status,
    },
    passthrough("crm_update_status"),
  );

  server.registerTool(
    "crm_log_interaction",
    {
      title: "Log Creator Interaction",
      description:
        "Use when something happens with a creator that the pipeline should remember. " +
        "Record something that happened with a creator: a note, vetting result, outreach draft " +
        "(put the message in body), reply or deliverable. AI employees cannot log outreach_sent: a " +
        "person sends outreach and logs it. No cost to call.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: z
        .object({
          creatorId: z.string(),
          kind: z.enum(CRM_INTERACTION_KINDS),
          summary: z.string().describe("At most 4000 characters."),
          body: z.string().optional().describe("At most 8000 characters, e.g. the drafted message."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.crm_log_interaction,
    },
    passthrough("crm_log_interaction"),
  );
}
