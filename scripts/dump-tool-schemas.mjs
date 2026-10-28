#!/usr/bin/env node
/**
 * Writes every tool's published schema as stable, key-sorted JSON.
 *
 * What a host reads before it calls anything is `tools/list`: each tool's
 * `inputSchema` and `outputSchema`, rendered from zod by the MCP SDK. Those
 * renderings change with zod (and with how the SDK converts it) without a
 * single compile error, so a dependency bump is checked by dumping this before
 * and after and diffing the two. Prompts are included because their arguments
 * come from zod too.
 *
 * Reads the built server, so run `npm run build` (or `tsc`) first:
 *
 *   node scripts/dump-tool-schemas.mjs > before.json
 *   # ...upgrade...
 *   node scripts/dump-tool-schemas.mjs > after.json && diff before.json after.json
 *
 * Pass a path instead of redirecting to write it there.
 */
import { writeFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../dist/shared/tools.js";

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]),
    );
  }
  return value;
}

// Never reached: listing tools does not call the backend.
const dummyClient = { callTool: async () => ({ contentBlocks: [], structured: {} }) };

const client = new Client({ name: "dump-tool-schemas", version: "0.0.0" });
const server = createMcpServer(async () => dummyClient);
const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
await Promise.all([client.connect(clientSide), server.connect(serverSide)]);

const tools = [];
let cursor;
do {
  const page = await client.listTools(cursor ? { cursor } : {});
  tools.push(...page.tools);
  cursor = page.nextCursor;
} while (cursor);

const prompts = [];
cursor = undefined;
do {
  const page = await client.listPrompts(cursor ? { cursor } : {});
  prompts.push(...page.prompts);
  cursor = page.nextCursor;
} while (cursor);

const dump = sortKeys({
  tools: tools
    .map((t) => ({ name: t.name, inputSchema: t.inputSchema, outputSchema: t.outputSchema ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name)),
  prompts: prompts
    .map((p) => ({ name: p.name, arguments: p.arguments ?? [] }))
    .sort((a, b) => a.name.localeCompare(b.name)),
});

const out = JSON.stringify(dump, null, 2) + "\n";
const path = process.argv[2];
if (path) writeFileSync(path, out);
else process.stdout.write(out);
await client.close();
