/**
 * nooticr-server's `sheets_*` family (BK2, Google Sheets): create, list, read
 * and write spreadsheets in the customer's connected Google account. Plain
 * passthroughs to the server's `POST /mcp` dispatch, which owns the Google
 * connection, the approval rule for files the customer picked, and the
 * 10000-cell limit. Argument names match the server's schema exactly.
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

const appId = z.number().int().optional().describe("Product id; optional when the workspace has one product.");
const spreadsheetId = z.string().describe("Spreadsheet id from sheets_create or sheets_list.");
const cell = z
  .union([z.number(), z.boolean(), z.string(), z.null(), z.object({ formula: z.string() }).strict()])
  .describe(
    "A number, boolean, text or an ISO date (2026-01-31) or datetime; null leaves the cell empty. " +
      'Text that looks like a formula or number stays text; use {"formula": "=SUM(A1:A3)"} for a formula.',
  );
const rows = z.array(z.array(cell));

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true } as const;

export function registerSheetsTools(server: McpServer, makeClient: MakeClient): void {
  const passthrough = (name: string) => async (args: Record<string, unknown>, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => {
    const client = await makeClient({ ...extra, arguments: args });
    try {
      return toResult(await client.callTool(name, args));
    } catch (err) {
      return failed(`${name} failed`, err);
    }
  };

  server.registerTool(
    "sheets_create",
    {
      title: "Create Spreadsheet",
      description:
        "Create a Google spreadsheet in the connected Google account, with the named sheets and a header row on each. " +
        "Returns its id and URL; Nooticr owns the file, so later writes need no approval. " +
        "Requires the product's Google Sheets connection. Free.",
      annotations: WRITE,
      inputSchema: z
        .object({
          appId,
          title: z.string(),
          sheets: z
            .array(z.object({ name: z.string(), headers: z.array(z.string()).optional() }))
            .optional()
            .describe("Tabs to create."),
        })
        .strict(),
      outputSchema: OUTPUT_SCHEMAS.sheets_create,
    },
    passthrough("sheets_create"),
  );

  server.registerTool(
    "sheets_list",
    {
      title: "List Spreadsheets",
      description:
        "List the spreadsheets this connection can see: the ones Nooticr created and the ones the customer picked. " +
        "Each says whether it was created or picked and whether the employee may edit it without approval. Free.",
      annotations: READ,
      inputSchema: z.object({ appId, limit: z.number().int().min(1).max(100).optional() }).strict(),
      outputSchema: OUTPUT_SCHEMAS.sheets_list,
    },
    passthrough("sheets_list"),
  );

  server.registerTool(
    "sheets_read",
    {
      title: "Read Spreadsheet Range",
      description:
        'Read a range (A1 notation, e.g. "Ledger!A1:F200") of a spreadsheet. ' +
        "Numbers come back as numbers and dates as formatted text; at most 10000 cells. Free.",
      annotations: READ,
      inputSchema: z.object({ appId, id: spreadsheetId, range: z.string() }).strict(),
      outputSchema: OUTPUT_SCHEMAS.sheets_read,
    },
    passthrough("sheets_read"),
  );

  server.registerTool(
    "sheets_append_rows",
    {
      title: "Append Spreadsheet Rows",
      description:
        "Append rows after the last row of a sheet (tab). Values are typed: numbers stay numbers and ISO dates become sheet dates. " +
        "At most 10000 cells per call. Free on a file Nooticr created or one the customer allowed you to edit; " +
        "on any other file the customer picked it waits for their approval.",
      annotations: WRITE,
      inputSchema: z.object({ appId, id: spreadsheetId, sheet: z.string().describe("Tab name."), rows }).strict(),
      outputSchema: OUTPUT_SCHEMAS.sheets_append_rows,
    },
    passthrough("sheets_append_rows"),
  );

  server.registerTool(
    "sheets_update_range",
    {
      title: "Update Spreadsheet Range",
      description:
        'Overwrite a range (A1 notation, e.g. "Ledger!B2:C3") with values. Typed like sheets_append_rows; ' +
        "at most 10000 cells per call. Same approval rule as sheets_append_rows: free on a file Nooticr created or one the customer allowed you to edit, otherwise it waits for their approval.",
      annotations: WRITE,
      inputSchema: z.object({ appId, id: spreadsheetId, range: z.string(), values: rows }).strict(),
      outputSchema: OUTPUT_SCHEMAS.sheets_update_range,
    },
    passthrough("sheets_update_range"),
  );

  server.registerTool(
    "sheets_add_sheet",
    {
      title: "Add Spreadsheet Tab",
      description: "Add an empty sheet (tab) to a spreadsheet. Same approval rule as sheets_append_rows: free on a file Nooticr created or one the customer allowed you to edit, otherwise it waits for their approval.",
      annotations: WRITE,
      inputSchema: z.object({ appId, id: spreadsheetId, name: z.string() }).strict(),
      outputSchema: OUTPUT_SCHEMAS.sheets_add_sheet,
    },
    passthrough("sheets_add_sheet"),
  );
}
