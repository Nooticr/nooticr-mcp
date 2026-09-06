// A thin MCP client over this repo's REAL built CLI (dist/index.js, stdio) —
// the same binary a user installs, not an in-process createMcpServer.
//
// Why a shared one: three things here need to speak to the built server for
// real (the chain map, the quest runner's pre-flight, the fixture coverage
// check) and each had started to grow its own copy of the connect/callTool
// dance. One implementation means a change to how the CLI is launched (a new
// env var, a transport switch) lands in one place.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CLI_ENTRY = path.join(REPO_ROOT, "dist", "index.js");

/**
 * Connect to the built CLI, pointed at whatever backend the caller booted.
 *
 * `capabilities` is deliberately empty by default: a client that declares no
 * `elicitation` is how the confirm-gated tools (create_brand_watch,
 * catch_up_watchlist) get exercised on their degrade path, which is the path
 * a real host without elicitation support takes.
 */
export async function connectBuiltServer({
  baseUrl = process.env.NOOTICR_BASE_URL,
  token = process.env.NOOTICR_ACCESS_TOKEN,
  capabilities = {},
  name = "quest-harness",
} = {}) {
  if (!baseUrl) throw new Error("NOOTICR_BASE_URL is not set — boot a backend first (scripts/e2e-server-lib.sh).");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [CLI_ENTRY],
    env: {
      ...process.env,
      NOOTICR_BASE_URL: baseUrl,
      NOOTICR_ACCESS_TOKEN: token ?? "",
      NOOTICR_TRANSPORT: "stdio",
    },
    stderr: "ignore",
  });
  const client = new Client({ name, version: "0.0.0" }, { capabilities });
  await client.connect(transport);
  return client;
}

/** Every text block a tool result carries, joined — the guidance channel. */
export function resultText(result) {
  return (result?.content ?? [])
    .filter((b) => b?.type === "text")
    .map((b) => b.text)
    .join("\n");
}
