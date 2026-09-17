/**
 * The same category read, on ten more marketplaces.
 *
 * `amazon.ts` answers one question — what buyers want and what stops them
 * buying — out of listings, star histograms and review text. Nothing in that
 * question is Amazon's. The server grew a marketplace-agnostic collector for
 * eleven sites and registered three tools over it; this file is the half that
 * was missing, and without it those tools existed, were billed, and could not
 * be called from Claude or ChatGPT at all.
 *
 * ## Why a registry rather than eleven tools
 *
 * One tool with a `marketplace` argument, not `scan_lazada_category` and ten
 * siblings. The sites differ in two data-shaped ways and nothing else: what a
 * product id looks like, and whether the site has storefronts a scan must pick
 * between. Both are text in a schema, so they belong in a table rather than in
 * eleven near-identical registrations a model has to choose between.
 *
 * ## Why the storefront parameter is per-site
 *
 * `MARKETS` mirrors `MARKETPLACES` in nooticr-server's `marketplace.rs`,
 * including which sites take a storefront and what each one calls it. That is
 * the part a flat optional string gets wrong: Otto is `de` or `at` and Lazada
 * is `sg | my | th | vn | ph | id`, so a schema that accepts any string invites
 * a model to send Otto an `sg` and be refused by the collector after the call
 * has been made. Describing the real set in the argument is what stops that
 * happening a round earlier, where it is free.
 *
 * ## What is untrusted here
 *
 * Every review body is a stranger's text, exactly as in `amazon.ts`. It is
 * material to reason over, never instructions — the same wording `ownIt` and
 * `reviewGuidance()` use, reached through the shared `categoryGuidance`.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NooticrClient } from "./nooticr.js";
import { OUTPUT_SCHEMAS } from "./output-schemas.js";
import { viewMeta } from "./view-meta.js";
import { withEvidence } from "./evidence-digest.js";
import { confirmSpend, declinedResult } from "./spend.js";
import { allReviews, categoryGuidance, listingCount, normaliseProducts, scanCost } from "./amazon.js";

type MakeClient = (ctx: Record<string, unknown>) => Promise<NooticrClient>;

/** A storefront selector, for the sites that have more than one. */
type Region = {
  /** The argument the collector reads it from. */
  field: "market" | "domain";
  /** What to pass, in the words the server's registry uses. */
  hint: string;
};

export type Market = {
  slug: string;
  label: string;
  /** What a product id looks like here — the answer to "what do I pass?". */
  idLabel: string;
  region?: Region;
};

/**
 * The eleven sites, mirroring `MARKETPLACES` in nooticr-server.
 *
 * Kept in the same order and the same words deliberately: a model reads this
 * text to decide what to send, and the server refuses on the same terms. Two
 * registries that drift are how a tool starts describing an argument the
 * collector no longer accepts.
 */
export const MARKETS: Market[] = [
  {
    slug: "amazon",
    label: "Amazon",
    idLabel: "an ASIN or a full Amazon product URL",
    region: {
      field: "domain",
      hint:
        "a country code or host — com (US), co.uk, de, fr, it, es, ca, co.jp, in, com.br, " +
        "com.mx, com.au, nl, se, pl, com.be, com.tr, ae, sa, eg, sg, cn. Default www.amazon.com",
    },
  },
  {
    slug: "aliexpress",
    label: "AliExpress",
    idLabel: "the numeric id from /item/<id>.html, or a full AliExpress product URL",
  },
  {
    slug: "cdiscount",
    label: "Cdiscount",
    idLabel: "the SKU from a product URL's /f-<category>-<sku>.html, or the full URL",
  },
  {
    slug: "flipkart",
    label: "Flipkart",
    idLabel: "the 16-character PID from a product URL's pid= parameter, or the full URL",
  },
  {
    slug: "mercadolibre",
    label: "Mercado Libre",
    idLabel: "a site id such as MLA904253674, or a full Mercado Libre product URL",
    region: {
      field: "market",
      hint:
        "one of eighteen markets, named however it comes to hand — MLB, br, Brazil or " +
        "mercadolivre.com.br. Inferred from the ids when omitted, and a job runs against one " +
        "market: an id from another is refused rather than mis-filed",
    },
  },
  {
    slug: "lazada",
    label: "Lazada",
    idLabel:
      "the number after -i in a product URL (13711387806 in /products/<slug>-i13711387806.html), " +
      "or the full URL",
    region: {
      field: "market",
      hint:
        "sg, my, th, vn, ph or id. An item id is scoped to one of them — the same id on another " +
        "Lazada host is a different product or nothing at all",
    },
  },
  {
    slug: "otto",
    label: "Otto",
    idLabel:
      "the tail of the product path — C1720803139 on otto.de, or the SKU AKLBB2029107352 on " +
      "ottoversand.at",
    region: {
      field: "market",
      hint:
        "de or at. The two are not interchangeable: an id from one does not address a product " +
        "on the other",
    },
  },
  {
    slug: "rakuten",
    label: "Rakuten",
    idLabel:
      "on Ichiba `<shopId>_<itemId>` (411453_10000003) or `<shop>/<manageNumber>`; on Taiwan " +
      "`<shop>/<productCode>`. A full product URL works too",
    region: {
      field: "market",
      hint:
        "jp (Ichiba) or tw. Taiwan publishes no review text, so a category study there reads on " +
        "price and rating alone",
    },
  },
  {
    slug: "trendyol",
    label: "Trendyol",
    idLabel:
      "the number after -p- in a product URL (819066262 in /brand/name-p-819066262), or the full URL",
    region: {
      field: "market",
      hint:
        "one of 47 storefronts — tr, de, ae, sa, at, be, fr, it, nl, pl, ro and the rest. An id " +
        "is scoped to one: the same number 404s on another country's",
    },
  },
  {
    slug: "jumia",
    label: "Jumia",
    idLabel:
      "a SKU such as OR537EA86PWGTNAFAMZ. A product URL does NOT contain it — the number at the " +
      "end of a product path is a different handle — so reach a product through `query` instead",
    region: { field: "market", hint: "ng, eg, ke, ma, ci, gh, sn, tn, ug or dz" },
  },
  {
    slug: "temu",
    label: "Temu",
    idLabel: "the goods id after -g- in a product URL, or the full URL",
  },
];

const BY_SLUG = new Map(MARKETS.map((m) => [m.slug, m]));

export function marketOf(slug: unknown): Market | undefined {
  return typeof slug === "string" ? BY_SLUG.get(slug.toLowerCase().trim()) : undefined;
}

/** "amazon | aliexpress | ..." — the set, for a description. */
const SLUGS = MARKETS.map((m) => m.slug).join(", ");

/**
 * The storefront argument, described site by site.
 *
 * One string rather than eleven schemas, because a tool takes one `marketplace`
 * per call and the host shows the whole description whichever it picks. Sites
 * with a single storefront are named as taking none, so a model does not
 * invent one for Temu.
 */
const MARKET_HINT =
  MARKETS.filter((m) => m.region)
    .map((m) => `${m.label}: ${m.region!.hint}`)
    .join(" · ") +
  ` · ${MARKETS.filter((m) => !m.region).map((m) => m.label).join(", ")} have one storefront each ` +
  "and take no market argument.";

/** The product ids each site addresses by, for `items`. */
const ID_HINT = MARKETS.map((m) => `${m.label}: ${m.idLabel}`).join(" · ");

function structured(res: { structured?: unknown }): Record<string, unknown> {
  return (res.structured ?? {}) as Record<string, unknown>;
}

function toolError(what: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { isError: true as const, content: [{ type: "text" as const, text: `${what}: ${message}` }] };
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * The scan, in the shape the view and the digest read.
 *
 * The Amazon twin of this hardcodes its own slug and `domain`; a scan here
 * carries whichever site it ran against and the storefront under the one name
 * `market`, because each collector calls it something different and a caller
 * should not have to know which.
 */
function marketplaceResult(payload: Record<string, unknown>, m: Market, focus?: string) {
  const products = normaliseProducts(payload.products);
  const rollup = (payload.rollup ?? {}) as Record<string, unknown>;
  const reviews = allReviews(products);
  const progress = (payload.progress ?? {}) as Record<string, unknown>;
  const total = num(progress.total) ?? products.length;
  const done = num(progress.done) ?? products.length;
  const label =
    String(payload.query ?? "") ||
    (products.length === 1 ? String(products[0]?.title ?? "this listing") : "this set of listings");
  const guidance = categoryGuidance({
    label,
    products: products.length,
    reviews: reviews.length,
    ratingsRepresented: num(rollup.ratingsRepresented) ?? 0,
    brands: Array.isArray(rollup.brands) ? (rollup.brands as string[]) : [],
    complete: payload.complete !== false,
    scanId: String(payload.scanId ?? ""),
    pending: Math.max(0, total - done),
    focus,
    site: m.label,
    statusTool: "marketplace_scan_status",
    // There is no free insights view for these sites yet, and pointing a model
    // at show_amazon_category_insights would have it draw a Lazada scan as an
    // Amazon one. Better to say nothing than to name the wrong tool.
    insightsTool: null,
  });

  const structuredPayload = {
    guidance,
    mode: "evidence",
    marketplace: m.slug,
    scanId: payload.scanId ?? null,
    status: payload.status ?? null,
    complete: payload.complete !== false,
    query: payload.query ?? null,
    market: payload.market ?? payload.domain ?? null,
    progress,
    rollup,
    products,
    reviews,
    errors: payload.errors ?? [],
    mcpCredits: payload.mcpCredits ?? null,
  };

  return {
    content: [{ type: "text" as const, text: withEvidence(guidance, structuredPayload) }],
    structuredContent: structuredPayload,
  };
}

/** The `marketplace` argument, shared by all three tools. */
const marketplaceArg = z
  .enum(MARKETS.map((m) => m.slug) as [string, ...string[]])
  .describe(`Which site to read. One of: ${SLUGS}.`);

export function registerMarketplaceTools(server: McpServer, makeClient: MakeClient): void {
  server.registerTool(
    "scan_marketplace_category",
    {
      title: "Scan Marketplace Category",
      _meta: viewMeta("scan_marketplace_category"),
      description:
        "Collect a category from any of eleven marketplaces and read it: products with prices, " +
        "star histograms, the review text itself, and the arithmetic over them (price spread, " +
        "rating spread, which aspects recur across how many brands, and the share of each " +
        "product's ratings sitting at 1-2 stars). `marketplace` picks the site — one of " +
        `${SLUGS}. ` +
        "Pass `query` to search the category, `items` to pin named competitors by id or URL, or " +
        "both. You write the read: purchase drivers, barriers, what the incumbents do well, the " +
        "gaps, and how a new entrant could position. " +
        "Costs 3 nooticr credits per product collected — a product with reviews is a real browser " +
        "render behind the site's bot defences. " +
        "Collection runs in the background: this returns everything ready within `waitSeconds` " +
        "plus a scanId to continue with marketplace_scan_status, which is free and worth " +
        "repeating until the scan is done. " +
        "For Amazon specifically, scan_amazon_category returns the same shape plus Amazon's own " +
        "review-aspect counts.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      outputSchema: OUTPUT_SCHEMAS.scan_marketplace_category,
      inputSchema: z
        .object({
          marketplace: marketplaceArg,
          query: z.string().optional().describe("Category or keyword to search, e.g. 'cast iron skillet'."),
          items: z
            .array(z.string())
            .optional()
            .describe(`Named competitors, by product id or URL. ${ID_HINT}`),
          limit: z.number().int().optional().describe("Products to collect (default 10, max 50)."),
          reviews: z
            .boolean()
            .optional()
            .describe(
              "Collect review text too (default true). False is faster and much cheaper to run, " +
                "but leaves only the aggregates.",
            ),
          market: z
            .string()
            .optional()
            .describe(`The storefront to read, for the sites that have more than one. ${MARKET_HINT}`),
          domain: z
            .string()
            .optional()
            .describe("Amazon only: the marketplace host, e.g. www.amazon.co.uk. Other sites use `market`."),
          waitSeconds: z
            .number()
            .int()
            .optional()
            .describe(
              "How long to wait before returning partial results (default 45, max 55). " +
                "Capped under the 60s at which hosts abandon a tool call — asking for longer " +
                "returns nothing and loses the scanId, not a bigger answer. " +
                "Poll marketplace_scan_status for the rest instead; it is free and repeatable.",
            ),
          focus: z
            .string()
            .optional()
            .describe("An extra question to answer from the reviews, e.g. 'what do buyers say about sizing?'"),
        })
        .strict(),
    },
    async (args: Record<string, unknown>, extra) => {
      const client = await makeClient({ ...extra, arguments: args });
      const m = marketOf(args.marketplace);
      if (!m) return toolError("scan_marketplace_category failed", new Error(`unknown marketplace — one of ${SLUGS}`));
      try {
        // `focus` steers the guidance, not the collection — sending it upstream
        // would be an argument the backend silently drops.
        const { focus, ...upstream } = args;
        // Priced and confirmed before the scan starts, on the same terms as
        // the Amazon one: a started scan has already spent the expensive half.
        const credits = scanCost(args);
        const decision = await confirmSpend(server.server, {
          credits,
          summary:
            `Collect ${listingCount(args)} ${m.label} product(s)` +
            (typeof args.query === "string" && args.query ? ` for "${args.query}"` : "") +
            `, with their reviews.`,
          cheaper: 'Lower "limit", or name the competitors you care about in "items".',
        });
        if (!decision.proceed) {
          return declinedResult(
            credits,
            `Collecting ${listingCount(args)} ${m.label} product(s)`,
            'Lower "limit", or name the competitors you care about in "items".',
          );
        }
        const res = await client.callTool("scan_marketplace_category", upstream);
        return marketplaceResult(structured(res), m, typeof focus === "string" ? focus : undefined);
      } catch (err) {
        return toolError("scan_marketplace_category failed", err);
      }
    },
  );

  server.registerTool(
    "marketplace_scan_status",
    {
      title: "Marketplace Scan Status",
      _meta: viewMeta("marketplace_scan_status"),
      description:
        "Pick up a scan_marketplace_category collection that was still running, by scanId and the " +
        "same marketplace — the products and reviews collected since, with the same rollup and " +
        "the same instructions for reading them. Free: it is the poll scan_marketplace_category " +
        "asked for, and charging for the second half of one answer would bill a wait this server " +
        "chose. Call it when a scan came back incomplete, then write your read from the full set.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      outputSchema: OUTPUT_SCHEMAS.marketplace_scan_status,
      inputSchema: z
        .object({
          marketplace: marketplaceArg,
          scanId: z.string().describe("The scanId scan_marketplace_category returned."),
          waitSeconds: z
            .number()
            .int()
            .optional()
            .describe(
              "How long to wait for more products before answering (default 30, max 55). " +
                "Call it again as often as you need rather than asking for one long wait.",
            ),
          focus: z.string().optional().describe("Same optional steer as scan_marketplace_category."),
        })
        .strict(),
    },
    async (args: Record<string, unknown>, extra) => {
      const client = await makeClient({ ...extra, arguments: args });
      const m = marketOf(args.marketplace);
      if (!m) return toolError("marketplace_scan_status failed", new Error(`unknown marketplace — one of ${SLUGS}`));
      try {
        const { focus, ...upstream } = args;
        const res = await client.callTool("marketplace_scan_status", upstream);
        return marketplaceResult(structured(res), m, typeof focus === "string" ? focus : undefined);
      } catch (err) {
        return toolError("marketplace_scan_status failed", err);
      }
    },
  );

  server.registerTool(
    "get_marketplace_product",
    {
      title: "Get Marketplace Product",
      _meta: viewMeta("get_marketplace_product"),
      description:
        "Fetch one product from any of eleven marketplaces by id or URL: price, rating, the full " +
        "star histogram, specs, and the review text. `marketplace` picks the site — one of " +
        `${SLUGS}. ` +
        "Costs 3 nooticr credits. " +
        "Use for a single product; for a category or a competitive set, scan_marketplace_category " +
        "collects many in one job and rolls them up.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      outputSchema: OUTPUT_SCHEMAS.get_marketplace_product,
      inputSchema: z
        .object({
          marketplace: marketplaceArg,
          id: z.string().optional().describe(`The product id. ${ID_HINT}`),
          url: z.string().optional().describe("The full product URL, if you have that instead."),
          reviews: z.boolean().optional().describe("Collect review text too (default true)."),
          market: z
            .string()
            .optional()
            .describe(`The storefront the product is on, for sites that have more than one. ${MARKET_HINT}`),
          domain: z
            .string()
            .optional()
            .describe("Amazon only: the marketplace host. Other sites use `market`."),
        })
        .strict(),
    },
    async (args: Record<string, unknown>, extra) => {
      const client = await makeClient({ ...extra, arguments: args });
      const m = marketOf(args.marketplace);
      if (!m) return toolError("get_marketplace_product failed", new Error(`unknown marketplace — one of ${SLUGS}`));
      try {
        const res = await client.callTool("get_marketplace_product", args);
        return marketplaceResult(structured(res), m);
      } catch (err) {
        return toolError("get_marketplace_product failed", err);
      }
    },
  );
}
