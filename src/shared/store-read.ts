/**
 * Store connections (nooticr-server C1): get the link a workspace owner opens to
 * connect an Amazon seller account, a Shopify shop or a WooCommerce store, and
 * read that store's own catalogue (a PrestaShop store's too). Both are passthroughs to the server's `POST /mcp` dispatch; the
 * server owns the owner/admin check, the one-time link and the platform calls.
 *
 * The connected Amazon store's own scorecard (nooticr-server#1413) is here too:
 * its Sales and Traffic report, its account health and its FBA stock. All three
 * are read-only and need the matching grant on the connection; Amazon builds the
 * first two as reports, so a first call can answer `status: in_progress` with a
 * `reportId` and the `nextCall` to make about a minute later.
 *
 * The store *write* tools (propose/apply listing and price changes) are not
 * here: they stay in BACKEND_ONLY_TOOLS until exposing them to hosts is decided.
 * The link and the catalogue have no view yet: a catalogue would be a table the
 * design system has no card for. The three scorecard reads draw one, with the
 * design system's table and stat tiles.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { NooticrClient, McpProxyResult } from "./nooticr.js";
import { OUTPUT_SCHEMAS } from "./output-schemas.js";
import { viewMeta } from "./view-meta.js";
import { bothChannels, failed } from "./passthrough.js";

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

/**
 * The platforms `list_store_products` reads (nooticr-server commerce `Platform`).
 * `connect_store` takes every one but PrestaShop: that one connects with a
 * webservice key, which the server refuses to take through a chat, so offering
 * it here would only mint a refusal.
 */
const storePlatform = z.enum(["amazon", "shopify", "woocommerce", "prestashop"]);
const connectPlatform = z.enum(["amazon", "shopify", "woocommerce"]);

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
        "(platform \"amazon\", optional region na/eu/fe), a Shopify shop (platform \"shopify\", " +
        "shop \"your-store.myshopify.com\") or a WooCommerce store (platform \"woocommerce\", shop " +
        "\"https://your-store.com\"). Optionally appId ties the store to one product. The owner " +
        "approves at the store; nothing is connected until they do, and no credential passes " +
        "through this tool. A PrestaShop store is connected in the dashboard's Settings with a key, " +
        "never through chat. Nooticr only asks for access to listing copy and " +
        "prices. Each call mints a fresh link. No cost to call. Use when the user wants to connect their Amazon, Shopify or WooCommerce store.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: z
        .object({
          platform: connectPlatform.describe("Which store platform to connect. PrestaShop is connected in Settings, never here."),
          shop: z.string().optional().describe("Shopify shop domain (your-store.myshopify.com), or the WooCommerce store's https address."),
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
        "connected; with several, the answer lists them and asks you to choose. platform is amazon, " +
        "shopify, woocommerce or prestashop. query (Amazon: exact SKU; Shopify: product search; " +
        "WooCommerce, PrestaShop: words in the product name), limit (up to 50), cursor from " +
        "nextCursor, productRef to read one product by Amazon SKU, Shopify GID or WooCommerce/" +
        "PrestaShop product id, includeIssues, includePricing (Amazon). " +
        "For Amazon, source \"report\" reads the whole catalogue through a report: it answers " +
        "status in_progress with a reportId and poll arguments until done. Read-only. No cost to call. Use when the user asks about the products in their connected store.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: z
        .object({
          connectionId: z.string().optional().describe("Store connection id; optional when one store is connected."),
          platform: storePlatform.optional(),
          query: z.string().optional().describe("Amazon: exact SKU. Shopify: product search query. WooCommerce, PrestaShop: words in the product name."),
          limit: z.number().int().min(1).max(50).optional(),
          cursor: z.string().optional().describe("nextCursor from the previous page."),
          includeIssues: z.boolean().optional(),
          includePricing: z.boolean().optional(),
          productRef: z.string().optional().describe("Amazon SKU, Shopify product GID, or WooCommerce/PrestaShop product id, to read one product."),
          marketplaceId: z.string().optional().describe("Amazon marketplace id; defaults to the first."),
          source: z.enum(["live", "report"]).optional(),
          reportId: z.string().optional().describe("Report id from an in_progress answer."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.list_store_products,
    },
    passthrough("list_store_products"),
  );

  const connection = {
    connectionId: z.string().optional().describe("Amazon store connection id; optional when one is connected."),
    marketplaceId: z.string().optional().describe("Amazon marketplace id; defaults to the first."),
  };
  // A report still being built is an answer, not a failure, and its nextCall
  // is in structuredContent; bothChannels carries it in the text as well.
  const report = (name: string) => async (args: Record<string, unknown>, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => {
    const client = await makeClient({ ...extra, arguments: args });
    try {
      return bothChannels(await client.callTool(name, args));
    } catch (err) {
      return failed(`${name} failed`, err);
    }
  };

  server.registerTool(
    "get_sales_and_traffic",
    {
      title: "Get Sales And Traffic",
      description:
        "Use when the user asks how their own Amazon store sold or converted over a window. Reads the " +
        "connected store's Sales and Traffic report for whole days (startDate and endDate as " +
        "YYYY-MM-DD, at most 90 days, ending before today; both left out = the last 7 days): totals " +
        "and per day, and per product (ASIN, SKU) its sessions, page views, unitSessionPct (Amazon's " +
        "conversion: units ordered per session), buyBoxPct, units ordered and sales, busiest first. " +
        "B2B is included in the totals, never added to them. Optional skus (SKUs or ASINs) narrows the " +
        "products. Amazon builds a report: the first call can answer status: in_progress with a " +
        "reportId and a nextCall; make it about a minute later. Read-only, no buyer data. No cost to call.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: z
        .object({
          ...connection,
          startDate: z.string().optional().describe("First day, YYYY-MM-DD; with endDate. Both left out: the last 7 days."),
          endDate: z.string().optional().describe("Last day, YYYY-MM-DD, before today; at most 90 days after startDate."),
          skus: z.array(z.string()).optional().describe("Only these SKUs or ASINs."),
          reportId: z.string().optional().describe("Report id from an in_progress answer."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.get_sales_and_traffic,
      _meta: viewMeta("get_sales_and_traffic"),
    },
    report("get_sales_and_traffic"),
  );

  server.registerTool(
    "get_account_health",
    {
      title: "Get Account Health",
      description:
        "Use when the user asks whether their own Amazon seller account is at risk. Reads the " +
        "connected seller's account health: the health rating and the order defect rate (per " +
        "fulfilment channel), late shipment, pre-fulfilment cancel and valid tracking rates, each with " +
        "Amazon's own target and whether it is breached, and breaches listing the rates past target. " +
        "A report: the first call can answer status: in_progress with a reportId and a nextCall. " +
        "Read-only. No cost to call.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: z
        .object({ ...connection, reportId: z.string().optional().describe("Report id from an in_progress answer.") })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.get_account_health,
      _meta: viewMeta("get_account_health"),
    },
    report("get_account_health"),
  );

  server.registerTool(
    "get_fba_inventory",
    {
      title: "Get FBA Inventory",
      description:
        "Use when the user asks how much stock their own Amazon store holds at Amazon's warehouses. " +
        "Reads the connected store's FBA stock per SKU: fulfillable, inbound (working, shipped and " +
        "receiving together), reserved, unfulfillable and total units. Optional skus (up to 50 seller " +
        "SKUs) and cursor (nextCursor from the previous page). Read-only: nothing about stock or " +
        "shipments is ever changed. No cost to call.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: z
        .object({
          ...connection,
          skus: z.array(z.string()).max(50).optional().describe("Only these seller SKUs."),
          cursor: z.string().optional().describe("nextCursor from the previous page."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.get_fba_inventory,
      _meta: viewMeta("get_fba_inventory"),
    },
    report("get_fba_inventory"),
  );
}
