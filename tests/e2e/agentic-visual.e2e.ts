/**
 * Visual, click-driven end-to-end test — the bridge between the two halves
 * of this repo's testing that don't otherwise touch: ui-template.e2e.ts
 * drives real clicks against the widget with hand-crafted fixture data
 * (thorough on widget logic, never touches the real MCP pipeline);
 * scripts/mcp-smoke-client.mjs and run-agentic-evals.sh drive a real
 * tools/call round trip (thorough on the pipeline, never renders or clicks
 * anything). This spec does both, across two structurally different
 * clicks: boot a real backend (scripts/fixture-server.mjs by default — see
 * its header for what that does and doesn't stand in for), make a real
 * tools/call through this repo's real built CLI, take the *real*
 * structuredContent that came back, render the real widget with it, and
 * click the actual buttons a user would (pick two posts and press Compare;
 * press "Open on ...") — proving the whole chain, not just the widget in
 * isolation. Screenshots of each rendered/clicked state land under
 * test-results/visual-e2e/ (gitignored) for a human to actually look at.
 *
 * Needs dist/index.js built (this spec builds it itself if missing) and a
 * Chromium install (npx playwright install --with-deps chromium).
 *
 *   npx playwright test tests/e2e/agentic-visual.e2e.ts
 */
import { existsSync } from "node:fs";
import { execSync, type ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE_URL = "http://localhost:8080";
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

async function waitForHealth(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`fixture-server never became healthy at ${BASE_URL}/health`);
}

async function graphql(token: string, query: string, variables: Record<string, unknown>) {
  const res = await fetch(`${BASE_URL}/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as { data?: Record<string, { id: string }>; errors?: unknown };
  if (body.errors) throw new Error(`graphql error: ${JSON.stringify(body.errors)}`);
  return body.data!;
}

/** Boots the fixture backend, provisions a workspace, and makes one real
 * tools/call through the real built CLI — returning exactly the
 * structuredContent a host would receive, for the test below to render. */
async function fetchRealDiscoverPostsResult(): Promise<unknown> {
  if (!existsSync(path.join(REPO_ROOT, "dist/index.js"))) {
    execSync("npm run build", { cwd: REPO_ROOT, stdio: "inherit" });
  }

  const fixture: ChildProcess = spawn("node", ["scripts/fixture-server.mjs"], {
    cwd: REPO_ROOT,
    stdio: "pipe",
  });
  try {
    await waitForHealth();

    const bootstrapLogin = await fetch(`${BASE_URL}/auth/dev-login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).then((r) => r.json() as Promise<{ token: string }>);

    const ws = await graphql(
      bootstrapLogin.token,
      "mutation($name: String!, $createdBy: UUID!) { createWorkspace(name: $name, createdBy: $createdBy) { id } }",
      { name: `agentic-visual-${Date.now()}`, createdBy: NIL_UUID }
    );
    const workspaceId = ws.createWorkspace.id;

    const scopedLogin = await fetch(`${BASE_URL}/auth/dev-login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace_id: workspaceId }),
    }).then((r) => r.json() as Promise<{ token: string }>);

    const transport = new StdioClientTransport({
      command: "node",
      args: [path.join(REPO_ROOT, "dist", "index.js")],
      env: {
        ...process.env,
        NOOTICR_BASE_URL: BASE_URL,
        NOOTICR_ACCESS_TOKEN: scopedLogin.token,
        NOOTICR_TRANSPORT: "stdio",
      },
    });
    const client = new Client({ name: "agentic-visual-e2e", version: "0.0.0" }, { capabilities: {} });
    await client.connect(transport);
    try {
      const result = await client.callTool({
        name: "discover_social_posts",
        arguments: { niche: "visual-e2e-" + randomUUID().slice(0, 8) },
      });
      expect(result.isError, `discover_social_posts failed: ${JSON.stringify(result.content)}`).not.toBe(true);
      return result.structuredContent;
    } finally {
      await client.close();
    }
  } finally {
    fixture.kill();
  }
}

/** Renders NOOTICR_UI_TEMPLATE with real structuredContent and installs the
 * same window.parent.postMessage interception the rest of this suite uses,
 * so a test can assert on exactly what the widget sends its host. */
async function renderRealResult(page: Page, structuredContent: unknown): Promise<void> {
  const { NOOTICR_UI_TEMPLATE } = await import("../../src/shared/ui-template.js");
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

async function sentMessages(page: Page): Promise<{ method: string; params?: unknown }[]> {
  return page.evaluate(
    () => (window as unknown as { __sent: { method: string; params?: unknown }[] }).__sent
  );
}

test.describe.serial("real tool result rendered and clicked", () => {
  test("discovered posts render, get picked, and Compare emits the right tools/call", async ({ page }: { page: Page }) => {
    const structuredContent = await fetchRealDiscoverPostsResult();
    const posts = (structuredContent as { posts?: Array<{ externalUrl?: string }> }).posts ?? [];
    expect(posts.length, "fixture-server's discover_social_posts should return at least 2 posts").toBeGreaterThanOrEqual(2);

    // This is the real structuredContent from a real tools/call, not a
    // hand-crafted fixture — the one thing ui-template.e2e.ts can't cover.
    await renderRealResult(page, structuredContent);
    await page.screenshot({ path: "test-results/visual-e2e/01-real-discover-posts-rendered.png" });

    await page.locator(".mp-pick").nth(0).click();
    await page.locator(".mp-pick").nth(1).click();
    await expect(page.locator("#pickgo")).toBeEnabled();
    await page.screenshot({ path: "test-results/visual-e2e/02-real-posts-picked.png" });

    await page.evaluate(() => {
      (window as unknown as { __sent: unknown[] }).__sent = [];
    });
    await page.locator("#pickgo").click();
    await page.waitForTimeout(250);

    const sent = await sentMessages(page);
    const call = sent.find((m) => m.method === "tools/call");
    expect(call, `expected a tools/call, got: ${sent.map((m) => m.method).join(",")}`).toBeTruthy();
    expect(call!.params).toEqual({
      name: "compare_posts",
      arguments: { urls: [posts[0].externalUrl, posts[1].externalUrl] },
    });
  });

  // A second, structurally different click against a fresh real tools/call:
  // proves the "Open on ..." button — a ui/open-link message, not a
  // tools/call — also carries the real backend's URL through correctly, not
  // just the Compare flow above.
  test("an 'Open on...' click asks the host to open the real post URL", async ({ page }: { page: Page }) => {
    const structuredContent = await fetchRealDiscoverPostsResult();
    const posts = (structuredContent as { posts?: Array<{ externalUrl?: string }> }).posts ?? [];
    expect(posts.length).toBeGreaterThanOrEqual(1);

    await renderRealResult(page, structuredContent);
    await page.screenshot({ path: "test-results/visual-e2e/03-real-posts-rendered-again.png" });

    await page.locator(".mp-open").first().click();
    await page.waitForTimeout(200);

    const sent = await sentMessages(page);
    const open = sent.find((m) => m.method === "ui/open-link");
    expect(open, `expected ui/open-link, got: ${sent.map((m) => m.method).join(",")}`).toBeTruthy();
    expect(open!.params).toEqual({ url: posts[0].externalUrl });
  });
});
