/**
 * AI employee teams (nooticr-server TM7): see the workspace's teams, build one
 * on the same draft the Build-my-team page edits, launch it, change its brief,
 * pause it, let it go. Every tool is a passthrough to the server's `POST /mcp`
 * dispatch, which answers with the team pages' own JSON and owns the quote, the
 * confirmation token, the manager check and the refusals.
 *
 * ## What stays on the dashboard
 *
 * A confirmed `hire_team` creates the team waiting for payment and answers
 * with the payment page for the dashboard's own copilot. A plugin handing that
 * link over is an in-app purchase of a digital good, which the hosts' commerce
 * policies forbid (#100, site.test.ts "nothing on the tool surface sells
 * anything"), so the edge drops it, as `hire_employee` does, and the user
 * finishes the hire on the Teams page. `add_team_member` and
 * `change_member_level` are not here at all: their confirmed call charges the
 * workspace's card on the spot, so there is no link to drop and nothing to
 * finish elsewhere (see BACKEND_ONLY_TOOLS).
 *
 * The two reads and the template catalogue draw a view; the draft, the quote
 * and the four writes return a form's state, a quote to read back in chat or a
 * confirmation, and stay view-less like their AI-employee siblings.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { NooticrClient, McpProxyResult } from "./nooticr.js";
import { OUTPUT_SCHEMAS, anyObject } from "./output-schemas.js";
import { bothChannels, failed } from "./passthrough.js";
import { viewMeta } from "./view-meta.js";
import { TWO_STEP_RULE } from "./employees.js";

interface MakeClient {
  (ctx: { authInfo?: AuthInfo; requestId?: string | number; arguments?: unknown }):
    | Promise<NooticrClient>
    | NooticrClient;
}

/** The goals list_team_templates and the Build-my-team page know. */
export const TEAM_GOALS = ["grow_store", "grow_brand_social", "run_client_accounts", "research_market", "book_meetings"] as const;

/** Where a team waiting for payment is finished, said the same way every time. */
export const FINISH_TEAM_ON_DASHBOARD =
  "The team is created and waiting for payment; nobody starts until payment is confirmed. Tell the " +
  "user to finish it from the Teams page of their Nooticr dashboard. Never take payment details in chat.";

const QUOTE_INSTRUCTIONS =
  "Nothing has been created and nothing charged. Tell the user who joins the team, each member's level " +
  "with its included limits and price (the quote's priceLabel), the totalLabel, the renewal and what waits " +
  "for their approval, using only the quote's own words for what the team does (workClaim), then call " +
  "again with confirm: true and this confirmationToken only if they agree. If requiresExtraConfirmation " +
  "is true, say the total again and get a second, separate yes before sending extraConfirmation: true. " +
  "The confirmed call creates the team waiting for payment, which the user completes on the Teams page " +
  "of their Nooticr dashboard.";

/**
 * A hire_team reply with the payment page taken out.
 *
 * The confirmed launch answers `{team, checkout: {url, expiresAt}, checkoutUrl}`
 * and a replay `{team, replayed: true, checkout}`. Both lose the link and say
 * where the hire is finished; a quote keeps everything but its last sentence,
 * which promised the payment page the edge is about to drop.
 */
export function withoutTeamPaymentLink(proxy: McpProxyResult): McpProxyResult {
  const structured = proxy.structured as Record<string, unknown> | undefined;
  if (!structured) return proxy;
  const rest: Record<string, unknown> = { ...structured };
  if (rest.requiresConfirmation === true && rest.quote) {
    rest.instructions = QUOTE_INSTRUCTIONS;
    return { ...proxy, structured: rest, contentBlocks: [] };
  }
  if (!("checkout" in rest) && !("checkoutUrl" in rest)) return proxy;
  delete rest.checkout;
  delete rest.checkoutUrl;
  rest.instructions = FINISH_TEAM_ON_DASHBOARD;
  // The backend's own text block may repeat the link, so it is not passed on.
  return { ...proxy, structured: rest, contentBlocks: [] };
}

/**
 * A refusal that hands over the payment page, written for the dashboard's own
 * chat: resuming a team still waiting for payment answers "finish payment
 * first ... The payment page: <url>". The link goes; where to finish stays.
 */
export function withoutPaymentPageIn(err: unknown): unknown {
  if (!(err instanceof Error) || !/payment page:/i.test(err.message)) return err;
  err.message = err.message.replace(
    /\s*The payment page:\s*\S+/gi,
    " The user finishes payment on the Teams page of their Nooticr dashboard.",
  );
  return err;
}

const teamId = z.string().describe("Team id from list_teams.");
const confirm = z.boolean().optional().describe("true only after the user's explicit yes.");

export function registerTeamTools(server: McpServer, makeClient: MakeClient): void {
  const passthrough = (name: string) => async (args: Record<string, unknown>, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => {
    const client = await makeClient({ ...extra, arguments: args });
    try {
      return bothChannels(await client.callTool(name, args));
    } catch (err) {
      return failed(`${name} failed`, withoutPaymentPageIn(err));
    }
  };

  server.registerTool(
    "list_teams",
    {
      title: "List Teams",
      description:
        "Use when the user asks which AI employee teams the workspace has or how they are doing. " +
        "Each team's status (and why it is paused), its members and their state, the approvals " +
        "waiting, open hand-off tasks and the share of its included monthly work used. Fired and " +
        "cancelled teams are left out unless includeFired is true. Where a teamId comes from. " +
        "Read-only. No cost to call.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: z.object({ includeFired: z.boolean().optional().describe("Also list fired and cancelled teams.") }).strict(),
      outputSchema: OUTPUT_SCHEMAS.list_teams,
      _meta: viewMeta("list_teams"),
    },
    passthrough("list_teams"),
  );

  server.registerTool(
    "get_team_status",
    {
      title: "Get Team Status",
      description:
        "Use when the user asks about one AI employee team in detail (teamId from list_teams): its " +
        "members with their level, state and payment state, this week's plan, hand-off task counts, " +
        "approvals waiting, the share of included work used, the brief's version and what it is " +
        "still missing, and whether this user may change the team (canManage). The brief's text " +
        "itself is read on the team page. Read-only. No cost to call.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: z.object({ teamId }).strict(),
      outputSchema: OUTPUT_SCHEMAS.get_team_status,
      _meta: viewMeta("get_team_status"),
    },
    passthrough("get_team_status"),
  );

  server.registerTool(
    "list_team_templates",
    {
      title: "List Team Templates",
      description:
        "Use when the user wants to build an AI employee team and needs to see what can be built. " +
        "The teams this workspace can launch, as the Build-my-team page lists them: each team's " +
        "roles, whether each role can start now (availability, and what it needs when not), and its " +
        "levels with their monthly prices. With goal (grow_store, grow_brand_social, " +
        "run_client_accounts, research_market, book_meetings), the answer also names the team the " +
        "page suggests for that goal and why; segment breaks ties. Read-only: hires nothing. No " +
        "cost to call.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: z
        .object({
          goal: z.enum(TEAM_GOALS).optional().describe("The user's goal; adds the team suggested for it."),
          segment: z.string().optional().describe("Optional segment to break ties between teams for the goal."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.list_team_templates,
      _meta: viewMeta("list_team_templates"),
    },
    passthrough("list_team_templates"),
  );

  server.registerTool(
    "get_team_draft",
    {
      title: "Get Team Draft",
      description:
        "Use when the user is building a team, before saving to their draft or launching it. The " +
        "user's team draft, the same one the Build-my-team page edits: the chosen team, the answers " +
        "so far, the step it is on, what a launch still needs (progress.minimumsMissing), the page " +
        "link that opens it, and, when the draft can be priced, its quote as it stands (no token: " +
        "hire_team mints the one a launch needs). draft is null when there is none. Read-only. No " +
        "cost to call.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: z.object({}).strict(),
      outputSchema: OUTPUT_SCHEMAS.get_team_draft,
    },
    passthrough("get_team_draft"),
  );

  server.registerTool(
    "update_team_draft",
    {
      title: "Update Team Draft",
      description:
        "Use when the user answers a question about the team they are building. Saves to their team " +
        "draft, the one the Build-my-team page edits: answers is merged into the saved answers (e.g. " +
        "{\"goal\":\"grow_store\"} or {\"brief\":{\"company\":{\"name\":\"Acme\"}}}; null removes a " +
        "key), templateSlug picks the team, step moves the page's step. Creates the draft when there " +
        "is none. Never put passwords, tokens or keys in it. Returns the draft and the page link. " +
        "Launches and charges nothing. No cost to call.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: z
        .object({
          answers: anyObject().optional().describe("Merged into the saved answers (JSON merge patch); null removes a key."),
          templateSlug: z.string().optional().describe("Team template slug from list_team_templates."),
          step: z.enum(["goal", "team", "brief", "connections", "guardrails", "review"]).optional(),
          expectedUpdatedAt: z.string().optional().describe("The draft's updatedAt as last read, to refuse a stale write."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.update_team_draft,
    },
    passthrough("update_team_draft"),
  );

  server.registerTool(
    "hire_team",
    {
      title: "Hire Team",
      description:
        "Use when the user wants to launch an AI employee team. " +
        TWO_STEP_RULE +
        " The quote says who joins, each member's level with its included limits and monthly price " +
        "(priceLabel), the team's totalLabel, what waits for approval and who is deferred and why; " +
        "read it back in plain language and never claim \"24/7\" or \"unlimited\", only the quote's " +
        "workClaim strings. When requiresExtraConfirmation is true, get a second, separate yes before " +
        "sending extraConfirmation: true. fromDraft: true launches the user's team draft " +
        "(get_team_draft) in place of the fields below. The confirmed call creates the team waiting " +
        "for payment, which the user finishes on the Teams page of their Nooticr dashboard; nobody " +
        "starts before that. Repeating a confirmed launch returns the same team. No cost to call.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: z
        .object({
          fromDraft: z.boolean().optional().describe("Launch the user's team draft (get_team_draft) in place of the fields below."),
          launchId: z.string().optional().describe("A new id for this launch (uuid); the draft has its own. Repeating it returns the same team."),
          template: z.string().optional().describe("Team template slug from list_team_templates."),
          presetKey: z.string().optional().describe("Which of the template's member sets."),
          name: z.string().optional().describe("The team's name."),
          goal: z.string().optional().describe("What the team is for, in a sentence."),
          products: z
            .union([z.literal("all"), z.array(z.number().int())])
            .optional()
            .describe('"all", or the product ids the team covers.'),
          brief: anyObject().optional().describe("The brief: company {name}, audience {markets}, channels, products, and more."),
          members: z
            .array(
              z
                .object({
                  roleKey: z.string(),
                  include: z.boolean().optional(),
                  level: z.string().optional(),
                  name: z.string().optional(),
                  productScope: z.enum(["inherit", "all", "selected"]).optional(),
                  products: z.array(z.number().int()).optional(),
                })
                .strict(),
            )
            .optional()
            .describe("Per role: whether it joins, its level, name and products."),
          limitPct: z.number().int().min(10).max(100).optional().describe("The share of the included monthly work the team may use."),
          approvalPreset: z.enum(["public_only", "everything"]).optional(),
          tz: z.string().optional().describe("IANA time zone."),
          currency: z.enum(["usd", "eur"]).optional(),
          confirm,
          confirmationToken: z.string().optional().describe("The token from the quote."),
          extraConfirmation: z
            .boolean()
            .optional()
            .describe("Only after a second, separate yes when the quote says requiresExtraConfirmation."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.hire_team,
    },
    async (args: Record<string, unknown>, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => {
      const client = await makeClient({ ...extra, arguments: args });
      try {
        return bothChannels(withoutTeamPaymentLink(await client.callTool("hire_team", args)));
      } catch (err) {
        return failed("hire_team failed", withoutPaymentPageIn(err));
      }
    },
  );

  server.registerTool(
    "update_team_brief",
    {
      title: "Update Team Brief",
      description:
        "Use when the user wants to change what an AI employee team works from (teamId from " +
        "list_teams). patch is merged into the brief (null removes a field) and stored as its next " +
        "version; the answer says which member picks it up and when. apply: \"wake_now\" also starts " +
        "the members that are idle, within the team's usual limits. baseVersion, the version you " +
        "read with get_team_status, refuses a change made over someone else's. The company name, " +
        "markets and channels cannot be removed. Only the person who launched the team or a " +
        "workspace admin can. Confirm the change with the user first. No cost to call.",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      inputSchema: z
        .object({
          teamId,
          patch: anyObject().describe("Brief fields to change (JSON merge patch); null removes one."),
          note: z.string().optional().describe("Why, in a few words."),
          apply: z.enum(["next_run", "wake_now"]).optional(),
          baseVersion: z.number().int().optional().describe("The brief version you read, to refuse a stale change."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.update_team_brief,
    },
    passthrough("update_team_brief"),
  );

  server.registerTool(
    "pause_team",
    {
      title: "Pause Team",
      description:
        "Use when the user wants an AI employee team to stop for now, or to start again (teamId from " +
        "list_teams). Pausing stops every member from starting runs and cancels runs in progress; " +
        "work waiting for approval stays. The subscription keeps billing while paused: say so. " +
        "resume: true resumes only what the team paused (a member paused on its own stays paused), " +
        "and is refused, with what to do, while the team waits for payment, its subscription is " +
        "inactive or its monthly work limit is reached. Only the person who launched the team or a " +
        "workspace admin can. No cost to call.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: z
        .object({ teamId, resume: z.boolean().optional().describe("Resume instead of pausing.") })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.pause_team,
    },
    passthrough("pause_team"),
  );

  server.registerTool(
    "fire_team",
    {
      title: "Fire Team",
      description:
        "Use when the user wants to let an AI employee team go (teamId from list_teams). The first " +
        "call, without confirm, only says what will happen and changes nothing: threads stay " +
        "readable, approvals still waiting expire, the subscription is cancelled at the end of the " +
        "paid period and the members work until then (immediate: true lets them go now), and nothing " +
        "is refunded. Call again with confirm: true only after the user explicitly agrees — never " +
        "confirm on the user's behalf. mode \"disband_keep_members\" is not available yet. Only the " +
        "person who launched the team or a workspace admin can. No cost to call.",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      inputSchema: z
        .object({
          teamId,
          mode: z.enum(["fire_members", "disband_keep_members"]).optional(),
          immediate: z.boolean().optional().describe("Let the members go now rather than at the end of the paid period."),
          confirm,
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.fire_team,
    },
    passthrough("fire_team"),
  );
}
