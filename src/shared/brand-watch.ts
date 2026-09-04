/**
 * Scheduled brand monitoring — a thin registration over a backend that
 * already implements the whole feature (crates/server/src/brand_watch.rs
 * in nooticr-server), including its own quote-then-confirm protocol for the
 * recurring charge a watch starts.
 *
 * Nothing here decides pricing, cadence limits, or confirmation validity —
 * that all lives server-side and stays the single source of truth, checked
 * again on the confirming call so the two cannot be read differently. These
 * three tools exist because the backend has had this since before this file
 * did and no external MCP client could reach it: the highest value-per-hour
 * gap in `docs/nooticr-gaps.html`'s Tier 1, and a registration exercise
 * rather than a build.
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

const CADENCES = ["hourly", "every_6_hours", "every_12_hours", "daily", "weekly"] as const;

/** Same shaping every other proxied tool uses: text block plus structured payload. */
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

export function registerBrandWatch(server: McpServer, makeClient: MakeClient): void {
  server.registerTool(
    "create_brand_watch",
    {
      title: "Create Brand Watch",
      description:
        "Run a brand-mentions sweep on a schedule and email the user what is new, instead of them " +
        "remembering to ask. Two calls by design, because this starts a charge that recurs while " +
        "nobody is watching: call it once with no confirmation to get back the cost per run, the " +
        "cadence and what those multiply out to per day, put those numbers to the user in your " +
        "reply, and only then call it again with confirm: true and the confirmationToken you were " +
        "handed. The first call creates nothing. A call with confirm: true and no matching token " +
        "creates nothing either — if the user cannot be asked, or does not answer, leave it " +
        "uncreated rather than starting a recurring charge nobody agreed to. Each run bills exactly " +
        "what the same sweep costs when a person asks for it: 2 credits per network, 5 for " +
        "Xiaohongshu. budgetCredits is a hard per-run ceiling enforced on the server, not a " +
        "suggestion — a sweep that would cost more is trimmed to the networks that fit, never " +
        "widened. A run that turns up nothing new sends no mail. cadence is hourly, every_6_hours, " +
        "every_12_hours, daily or weekly, and defaults to daily. No cost to call.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: z
        .object({
          term: z.string().describe("What to watch for — a brand name or phrase (max 120 chars)."),
          platforms: z
            .array(z.string())
            .optional()
            .describe("Networks to sweep. Omit for every searchable network."),
          cadence: z.enum(CADENCES).optional().describe("How often to run. Defaults to daily."),
          budgetCredits: z
            .number()
            .int()
            .optional()
            .describe(
              "Hard per-run credit ceiling (min 2, max 1000). Defaults to the full sweep's cost.",
            ),
          deliverTo: z
            .string()
            .optional()
            .describe("Email for the digest. Defaults to the account's own email."),
          confirm: z
            .boolean()
            .optional()
            .describe("Set true only on the second call, once the user has agreed to the quoted cost."),
          confirmationToken: z
            .string()
            .optional()
            .describe("The token the first call returned. Required alongside confirm: true."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.create_brand_watch,
    },
    async (args, extra) => {
      const client = await makeClient({ ...extra, arguments: args });
      try {
        return toResult(
          await client.callTool("create_brand_watch", args as Record<string, unknown>),
        );
      } catch (err) {
        return failed("create_brand_watch failed", err);
      }
    },
  );

  server.registerTool(
    "list_brand_watches",
    {
      title: "List Brand Watches",
      description:
        "Every scheduled brand-monitoring watch this user has: term, networks, cadence, cost per " +
        "run, credits spent so far, how many runs it has made, when the next one is due, and " +
        "whether it is stopped and why. Read this before creating a watch — a second watch on the " +
        "same term is a second recurring charge for the same answer. No cost to call.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: z.object({}).strict(),
      outputSchema: OUTPUT_SCHEMAS.list_brand_watches,
    },
    async (_args, extra) => {
      const client = await makeClient({ ...extra, arguments: {} });
      try {
        return toResult(await client.callTool("list_brand_watches", {}));
      } catch (err) {
        return failed("list_brand_watches failed", err);
      }
    },
  );

  server.registerTool(
    "stop_brand_watch",
    {
      title: "Stop Brand Watch",
      description:
        "Stop a scheduled brand-monitoring watch, by watchId or by term. Takes effect immediately: " +
        "the run that was due does not happen and nothing further is charged. Free, and " +
        "deliberately still works at a zero balance — a user who has run out of credits is exactly " +
        "the user who needs to turn off what is spending them. No cost to call.",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      inputSchema: z
        .object({
          watchId: z.string().optional().describe("The watch's id, from list_brand_watches."),
          term: z.string().optional().describe("Alternative to watchId — the term it was watching."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.stop_brand_watch,
    },
    async (args, extra) => {
      const client = await makeClient({ ...extra, arguments: args });
      try {
        return toResult(await client.callTool("stop_brand_watch", args as Record<string, unknown>));
      } catch (err) {
        return failed("stop_brand_watch failed", err);
      }
    },
  );
}
