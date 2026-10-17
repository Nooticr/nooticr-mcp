/**
 * Store connections (nooticr-server C1): get the link a workspace owner opens to
 * connect an Amazon seller account or a Shopify shop, and read that store's own
 * catalogue. Both are passthroughs to the server's `POST /mcp` dispatch; the
 * server owns the owner/admin check, the one-time link and the platform calls.
 *
 * The store *write* tools (propose/apply listing and price changes) are not
 * here: they stay in BACKEND_ONLY_TOOLS until exposing them to hosts is decided.
 * Neither tool has a view yet: a catalogue would be a table the design system
 * has no card for.
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
  // No view draws structuredContent here, so the model reads it from the text.
  const text = structured ? JSON.stringify(structured) : String(textBlock?.text ?? "");
  return { content: [{ type: "text" as const, text }], structuredContent: structured };
}

function failed(prefix: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `${prefix}: ${msg}` }], isError: true as const };
}

const platform = z.enum(["amazon", "shopify"]);

export function registerStoreReadTools(server: McpServer, makeClient: MakeClient): void {
  const passthrough = (name: string) => async (args: Record<string, unknown>, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => {
    const client = await makeClient({ ...extra, arguments: args });
    try {
      return toResult(await client.callTool(name, args));
    } catch (err) {
      return failed(`${name} failed`, err);
    }
  };

  server.registerTool(
    "connect_store",
    {
      title: "Connect Store",
      description:
        "Get a link a workspace owner or admin opens to connect an Amazon seller account " +
        "(platform \"amazon\", optional region na/eu/fe) or a Shopify shop (platform \"shopify\", " +
        "shop \"your-store.myshopify.com\"). Optionally appId ties the store to one product. The " +
        "owner approves at Amazon or Shopify; nothing is connected until they do, and no " +
        "credential passes through this tool. Nooticr only asks for access to listing copy and " +
        "prices. Each call mints a fresh link. No cost to call. Use when the user wants to connect their Amazon or Shopify store.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: z
        .object({
          platform: platform.describe("Which store platform to connect."),
          shop: z.string().optional().describe("Shopify shop domain, e.g. your-store.myshopify.com."),
          region: z.enum(["na", "eu", "fe"]).optional().describe("Amazon region; defaults to na."),
          appId: z.string().optional().describe("Product id to tie the store to."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.connect_store,
    },
    passthrough("connect_store"),
  );

  server.registerTool(
    "list_store_products",
    {
      title: "List Store Products",
      description:
        "Read the connected store's own catalogue: title, bullets, description, status, price, " +
        "currency and Amazon listing issues. connectionId is optional when one store is " +
        "connected; with several, the answer lists them and asks you to choose. query (Amazon: " +
        "exact SKU; Shopify: product search), limit (up to 50), cursor from nextCursor, " +
        "productRef to read one product by SKU or GID, includeIssues, includePricing (Amazon). " +
        "For Amazon, source \"report\" reads the whole catalogue through a report: it answers " +
        "status in_progress with a reportId and poll arguments until done. Read-only. No cost to call. Use when the user asks about the products in their connected store.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: z
        .object({
          connectionId: z.string().optional().describe("Store connection id; optional when one store is connected."),
          platform: platform.optional(),
          query: z.string().optional().describe("Amazon: exact SKU. Shopify: product search query."),
          limit: z.number().int().min(1).max(50).optional(),
          cursor: z.string().optional().describe("nextCursor from the previous page."),
          includeIssues: z.boolean().optional(),
          includePricing: z.boolean().optional(),
          productRef: z.string().optional().describe("Amazon SKU or Shopify product GID to read one product."),
          marketplaceId: z.string().optional().describe("Amazon marketplace id; defaults to the first."),
          source: z.enum(["live", "report"]).optional(),
          reportId: z.string().optional().describe("Report id from an in_progress answer."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.list_store_products,
    },
    passthrough("list_store_products"),
  );
}
