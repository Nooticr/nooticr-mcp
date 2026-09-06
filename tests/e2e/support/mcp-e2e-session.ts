/**
 * Shared boot/login/tool-call plumbing for real-pipeline visual E2E specs
 * (tests/e2e/agentic-visual*.e2e.ts). Not itself a test file (no `.e2e.ts`
 * suffix, so playwright.config.ts's testMatch skips it).
 *
 * Boots scripts/fixture-server.mjs on a caller-given port (each spec file
 * picks its own, so Playwright's fullyParallel running two spec files at
 * once never collides on one), provisions a workspace+app the same way
 * scripts/e2e-server-lib.sh does for the non-visual tiers, and connects a
 * real MCP SDK Client to this repo's real built CLI over stdio — the same
 * client library any real host embeds.
 */
import { existsSync } from "node:fs";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Page } from "@playwright/test";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export interface McpE2eSession {
  client: Client;
  baseUrl: string;
  close(): Promise<void>;
}

async function graphql(
  baseUrl: string,
  token: string,
  query: string,
  variables: Record<string, unknown>
): Promise<Record<string, { id: string }>> {
  const res = await fetch(`${baseUrl}/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as { data?: Record<string, { id: string }>; errors?: unknown };
  if (body.errors) throw new Error(`graphql error: ${JSON.stringify(body.errors)}`);
  return body.data!;
}

/** Boots the fixture backend on `port`, provisions a workspace+app, and
 * connects a real MCP client to this repo's real built CLI over stdio.
 * Callers make as many real tools/call requests as they need through
 * `session.client`, then must `session.close()`. */
export async function startMcpE2eSession(port: number): Promise<McpE2eSession> {
  if (!existsSync(path.join(REPO_ROOT, "dist/index.js"))) {
    execSync("npm run build", { cwd: REPO_ROOT, stdio: "inherit" });
  }

  const baseUrl = `http://localhost:${port}`;
  const fixture: ChildProcess = spawn("node", ["scripts/fixture-server.mjs", String(port)], {
    cwd: REPO_ROOT,
    stdio: "pipe",
  });

  let healthy = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${baseUrl}/health`)).ok) {
        healthy = true;
        break;
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!healthy) {
    fixture.kill();
    throw new Error(`fixture-server never became healthy at ${baseUrl}/health`);
  }

  const bootstrapLogin = await fetch(`${baseUrl}/auth/dev-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }).then((r) => r.json() as Promise<{ token: string }>);

  const ws = await graphql(
    baseUrl,
    bootstrapLogin.token,
    "mutation($name: String!, $createdBy: UUID!) { createWorkspace(name: $name, createdBy: $createdBy) { id } }",
    { name: `visual-e2e-${port}-${Date.now()}`, createdBy: NIL_UUID }
  );
  const workspaceId = ws.createWorkspace.id;

  await graphql(
    baseUrl,
    bootstrapLogin.token,
    "mutation($workspaceId: UUID!, $name: String!, $slug: String!) { createApp(workspaceId: $workspaceId, name: $name, slug: $slug) { id } }",
    { workspaceId, name: "Visual E2E App", slug: `visual-e2e-app-${port}` }
  );

  const scopedLogin = await fetch(`${baseUrl}/auth/dev-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspace_id: workspaceId }),
  }).then((r) => r.json() as Promise<{ token: string }>);

  const transport = new StdioClientTransport({
    command: "node",
    args: [path.join(REPO_ROOT, "dist", "index.js")],
    env: {
      ...process.env,
      NOOTICR_BASE_URL: baseUrl,
      NOOTICR_ACCESS_TOKEN: scopedLogin.token,
      NOOTICR_TRANSPORT: "stdio",
    },
  });
  const client = new Client({ name: "visual-e2e", version: "0.0.0" }, { capabilities: {} });
  await client.connect(transport);

  return {
    client,
    baseUrl,
    async close() {
      await client.close();
      fixture.kill();
    },
  };
}

/** Renders NOOTICR_UI_TEMPLATE with real structuredContent and installs the
 * same window.parent.postMessage interception tests/e2e/ui-template.e2e.ts
 * uses, so a test can assert on exactly what the widget sends its host. */
export async function renderRealResult(page: Page, structuredContent: unknown): Promise<void> {
  const { NOOTICR_UI_TEMPLATE } = await import("../../../src/shared/ui-template.js");
  await page.setViewportSize({ width: 390, height: 760 });
  await page.setContent(NOOTICR_UI_TEMPLATE);
  await page.evaluate(() => {
    (window as unknown as { __sent: unknown[] }).__sent = [];
    const orig = window.parent.postMessage.bind(window.parent);
    window.parent.postMessage = (m: unknown, o: string) => {
      (window as unknown as { __sent: unknown[] }).__sent.push(JSON.parse(JSON.stringify(m)));
      return orig(m as never, o as never);
    };
  });
  await page.evaluate(
    (d) => window.postMessage({ method: "ui/notifications/tool-result", params: { structuredContent: d } }, "*"),
    structuredContent
  );
  await page.waitForTimeout(600);
}

export async function sentMessages(page: Page): Promise<{ method: string; params?: unknown }[]> {
  return page.evaluate(
    () => (window as unknown as { __sent: { method: string; params?: unknown }[] }).__sent
  );
}

export async function clearSentMessages(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __sent: unknown[] }).__sent = [];
  });
}
