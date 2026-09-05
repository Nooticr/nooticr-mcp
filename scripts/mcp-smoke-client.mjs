#!/usr/bin/env node
// Deterministic, no-LLM MCP protocol smoke test — see docs/testing/agentic-e2e-testing.md.
//
// scripts/run-agentic-evals.sh proves "does a real model call the right
// tool"; this proves the layer underneath that, which the agentic path
// can't isolate on its own: does the real built CLI (dist/index.js),
// pointed at a real nooticr-server booted in test mode, actually speak MCP
// correctly and get real answers back — tools/list count, a real credit
// balance, a real workspace's app in list_own_apps, real media for the
// E2E fixture URL. No API key, no model, nothing non-deterministic: this
// is scripted assertions over the real MCP SDK Client/StdioClientTransport,
// the same client library any real host embeds.
//
// Usage: node scripts/mcp-smoke-client.mjs
// Env (all required, written by scripts/e2e-server-lib.sh):
//   NOOTICR_BASE_URL, NOOTICR_ACCESS_TOKEN

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STUB_URL = "https://e2e.nooticr.test/import/tiktok/e2e-stub";

let failures = 0;
function check(label, cond, detail) {
  if (cond) {
    console.log(`  ok   - ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL - ${label}${detail ? `: ${detail}` : ""}`);
  }
}

function structured(result) {
  return result.structuredContent ?? result.structured ?? undefined;
}

async function main() {
  for (const v of ["NOOTICR_BASE_URL", "NOOTICR_ACCESS_TOKEN"]) {
    if (!process.env[v]) {
      console.error(`error: ${v} is not set — run this through scripts/e2e-server-lib.sh, not directly.`);
      process.exit(1);
    }
  }

  const transport = new StdioClientTransport({
    command: "node",
    args: [path.join(REPO_ROOT, "dist", "index.js")],
    env: {
      ...process.env,
      NOOTICR_BASE_URL: process.env.NOOTICR_BASE_URL,
      NOOTICR_ACCESS_TOKEN: process.env.NOOTICR_ACCESS_TOKEN,
      NOOTICR_TRANSPORT: "stdio",
    },
  });
  const client = new Client({ name: "mcp-smoke-client", version: "0.0.0" }, { capabilities: {} });

  console.log("==> connecting (spawns dist/index.js over stdio)");
  await client.connect(transport);

  console.log("==> tools/list");
  const list = await client.listTools();
  check("advertises at least one tool", list.tools.length > 0, `got ${list.tools.length}`);
  check(
    "advertises check_nooticr_credits",
    list.tools.some((t) => t.name === "check_nooticr_credits")
  );
  check(
    "advertises list_own_apps",
    list.tools.some((t) => t.name === "list_own_apps")
  );
  check(
    "advertises get_social_media",
    list.tools.some((t) => t.name === "get_social_media")
  );

  console.log("==> tools/call check_nooticr_credits");
  const credits = await client.callTool({ name: "check_nooticr_credits", arguments: {} });
  check("did not error", credits.isError !== true, JSON.stringify(credits.content));
  const creditsOut = structured(credits);
  check(
    "returned a numeric balance",
    creditsOut && typeof creditsOut.balance === "number",
    JSON.stringify(creditsOut)
  );

  console.log("==> tools/call list_own_apps (workspace created by e2e-server-lib.sh)");
  const apps = await client.callTool({ name: "list_own_apps", arguments: {} });
  check("did not error", apps.isError !== true, JSON.stringify(apps.content));
  const appsOut = structured(apps);
  check(
    "returned at least the one app that was created",
    Array.isArray(appsOut?.apps) && appsOut.apps.length > 0,
    JSON.stringify(appsOut)
  );

  console.log(`==> tools/call get_social_media on the E2E fixture URL (${STUB_URL})`);
  const media = await client.callTool({ name: "get_social_media", arguments: { url: STUB_URL } });
  check("did not error", media.isError !== true, JSON.stringify(media.content));
  const mediaOut = structured(media);
  check("returned a contentType", typeof mediaOut?.contentType === "string", JSON.stringify(mediaOut));

  await client.close();

  console.log("");
  if (failures > 0) {
    console.error(`==> ${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("==> all mechanical smoke checks passed.");
}

main().catch((err) => {
  console.error("error:", err?.stack ?? err);
  process.exit(1);
});
