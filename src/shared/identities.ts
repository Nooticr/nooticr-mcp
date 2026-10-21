/**
 * Creator identities (nooticr-server #36): "this TikTok account and this
 * Instagram account are one person", stored once per workspace. Every tool
 * here is a passthrough to the server's `POST /mcp` dispatch, which owns the
 * tenancy check and the one rule that matters: an account belongs to at most
 * one identity, and an account already in another one is refused with that
 * identity named, never moved.
 *
 * suggest_creator_identity (tools.ts) finds the candidates and stores nothing;
 * save_creator_identity is where a confirmed suggestion goes. Without the four
 * store tools, the two watch tools would ask for an `identityId` no host could
 * get.
 *
 * watch_creator_identity and unwatch_creator_identity write the account
 * watchlist the server keeps, the same one BackendWatchStore reads
 * (watchlist.ts). On a session that falls back to a local store (no
 * workspace, or an old server) they fail with the server's own reason, which
 * is the truth: identities exist only in the account.
 *
 * None of these has a view: five are pure state mutations, and the list would
 * be a table of people and their accounts that the design system has no card
 * for. delete_creator_identity is not confirm-gated: the confirmations here
 * (confirmSpend) are for credits, and nothing else destructive and free asks
 * either (stop_brand_watch, unwatch_creator). It removes only the grouping;
 * the accounts and their watchlist entries stay, and the identity can be saved
 * again.
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

const IDENTITY_ID = z.string().describe("Id from list_creator_identities.");

/** The server's `identity_accounts` schema: at most 20 accounts per call. */
const ACCOUNTS = z
  .array(
    z
      .object({
        platform: z.string().describe("Social network: tiktok, instagram, youtube, ..."),
        handle: z.string().describe("Account handle, with or without @."),
        evidence: z
          .array(z.object({}).passthrough())
          .optional()
          .describe("What showed these are one person, e.g. suggest_creator_identity's evidence."),
      })
      .strict(),
  )
  .min(1)
  .max(20);

export function registerIdentityTools(server: McpServer, makeClient: MakeClient): void {
  const passthrough = (name: string) => async (args: Record<string, unknown>, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => {
    const client = await makeClient({ ...extra, arguments: args });
    try {
      return toResult(await client.callTool(name, args));
    } catch (err) {
      return failed(`${name} failed`, err);
    }
  };

  server.registerTool(
    "save_creator_identity",
    {
      title: "Save Creator Identity",
      description:
        "Use once the user has confirmed that several accounts on different networks are one person, " +
        "for instance from suggest_creator_identity's evidence. Save them as one creator identity: " +
        "`name` (who they are), `accounts` (each {platform, handle, evidence?}) and an optional `note`. " +
        "Stores exactly the accounts given and infers nothing: an account already in another identity " +
        "is refused with that identity named, never moved. Shared by the whole workspace. Never save a " +
        "suggestion nobody confirmed. No cost to call.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: z
        .object({
          name: z.string().describe("Who these accounts are."),
          accounts: ACCOUNTS,
          note: z.string().optional().describe("Optional note."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.save_creator_identity,
    },
    passthrough("save_creator_identity"),
  );

  server.registerTool(
    "list_creator_identities",
    {
      title: "List Creator Identities",
      description:
        "Use to find a saved creator identity's id, or to answer which accounts are known to be the same " +
        "person. Every creator identity this workspace has saved: its id, name, note and accounts " +
        "(platform, handle, and the evidence recorded when each was added). Read-only. No cost to call.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: z.object({}).strict(),
      outputSchema: OUTPUT_SCHEMAS.list_creator_identities,
    },
    passthrough("list_creator_identities"),
  );

  server.registerTool(
    "update_creator_identity",
    {
      title: "Update Creator Identity",
      description:
        "Use when a saved creator identity is wrong or incomplete. Change it by `identityId`: rename it " +
        "(`name`), change its `note` or clear it with an empty string, add accounts (`addAccounts`) or remove them " +
        "(`removeAccounts`). An added account already in another identity is refused with that identity " +
        "named. An identity keeps at least one account; to drop the last, use delete_creator_identity. " +
        "No cost to call.",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      inputSchema: z
        .object({
          identityId: IDENTITY_ID,
          name: z.string().optional().describe("New name."),
          note: z.string().optional().describe("New note; an empty string clears it."),
          addAccounts: ACCOUNTS.optional(),
          removeAccounts: ACCOUNTS.optional(),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.update_creator_identity,
    },
    passthrough("update_creator_identity"),
  );

  server.registerTool(
    "delete_creator_identity",
    {
      title: "Delete Creator Identity",
      description:
        "Use when the user says a saved creator identity groups accounts that are not one person, or no " +
        "longer wants it. Delete it by `identityId`. Only the grouping goes: the accounts, and any " +
        "watchlist entries for them, are untouched. No cost to call.",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      inputSchema: z.object({ identityId: IDENTITY_ID }).strict(),
      outputSchema: OUTPUT_SCHEMAS.delete_creator_identity,
    },
    passthrough("delete_creator_identity"),
  );

  server.registerTool(
    "watch_creator_identity",
    {
      title: "Watch Creator Identity",
      description:
        "Use to watch a person rather than one account. Puts every account of a saved creator identity " +
        "(`identityId`, optional `note`) on your watchlist, each as its own entry with its own " +
        "baselines; list_watchlist then groups them under the identity in `byIdentity`. Accounts added " +
        "to the identity later are not watched until this is called again. Nothing is fetched. No cost " +
        "to call.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: z
        .object({
          identityId: IDENTITY_ID,
          note: z.string().optional().describe("Optional note for each entry."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.watch_creator_identity,
    },
    passthrough("watch_creator_identity"),
  );

  server.registerTool(
    "unwatch_creator_identity",
    {
      title: "Unwatch Creator Identity",
      description:
        "Use when the user no longer wants a person on their watchlist. Takes every account of a saved " +
        "creator identity (`identityId`) off your watchlist, with their baselines. Accounts watched on " +
        "their own and not in the identity stay. No cost to call.",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      inputSchema: z.object({ identityId: IDENTITY_ID }).strict(),
      outputSchema: OUTPUT_SCHEMAS.unwatch_creator_identity,
    },
    passthrough("unwatch_creator_identity"),
  );
}
