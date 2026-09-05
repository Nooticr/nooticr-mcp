/**
 * Connection state and account linking — the last Tier 1 "now" item from
 * `docs/nooticr-gaps.html`: right now, when a user isn't connected to a
 * platform, a write-shaped tool call just fails opaquely instead of "you're
 * not connected to Instagram — here's a link." Both primitives already
 * existed server-side (crates/server/src/mcp_tools.rs); this file is what
 * makes them reachable from Claude/ChatGPT.
 *
 * Neither tool ever sees a credential. connect_social_account mints a link
 * to the provider's own consent screen — the user approves there, in their
 * own browser, and nothing is connected until they do. Same shape as
 * nooticr_login (tools.ts), which already hands back a bare URL rather than
 * using a client-side elicitation dialog: consistent with the rest of this
 * server, and the credential-safety property (nothing passes through the
 * model) holds either way, since the model only ever sees a URL to open.
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

export function registerConnectionTools(server: McpServer, makeClient: MakeClient): void {
  server.registerTool(
    "list_social_connections",
    {
      title: "List Social Connections",
      description:
        "List the social accounts your workspace has connected and what each connection is " +
        "allowed to do — read the account, publish a post, manage comments. Each answer is yes, " +
        "no, or unknown; unknown means the grant predates scope recording, so treat it as \"try " +
        "it\", not as a refusal. Also returns which platforms can be connected at all, which is a " +
        "smaller set than the networks nooticr can read. Call this before promising that " +
        "something can be posted or replied to. No cost to call.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: z.object({}).strict(),
      outputSchema: OUTPUT_SCHEMAS.list_social_connections,
    },
    async (_args, extra) => {
      const client = await makeClient({ ...extra, arguments: {} });
      try {
        return toResult(await client.callTool("list_social_connections", {}));
      } catch (err) {
        return failed("list_social_connections failed", err);
      }
    },
  );

  server.registerTool(
    "connect_social_account",
    {
      title: "Connect Social Account",
      description:
        "Get a link to open so you can connect one social account. Takes the platform, and " +
        "optionally influencerId or appId when your workspace has more than one creator profile " +
        "or product — omit both and this picks the only one if there is just one, or lists the " +
        "choices if there is more than one. The user approves at the provider; nothing is " +
        "connected until they do, and no credential ever passes through this tool. Each call " +
        "mints a fresh link, so do not reuse an old one. No cost to call.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: z
        .object({
          platform: z.string().describe("Which network to connect, e.g. tiktok, youtube."),
          influencerId: z.number().int().optional().describe("Which creator profile — call list_own_apps or list_social_connections first if unsure."),
          appId: z.number().int().optional().describe("Which product this connection is for."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.connect_social_account,
    },
    async (args: { platform: string; influencerId?: number; appId?: number }, extra) => {
      const client = await makeClient({ ...extra, arguments: args });
      try {
        return toResult(await client.callTool("connect_social_account", args));
      } catch (err) {
        return failed("connect_social_account failed", err);
      }
    },
  );
}
