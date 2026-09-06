import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

/**
 * Where to find a browser when Playwright's own download is not available.
 *
 * CI runs `npx playwright install`, gets the exact build the installed
 * `@playwright/test` asks for, and never reaches any of this. Sandboxed
 * environments are the problem: several ship a working Chromium at a fixed
 * path but block `cdn.playwright.dev`, so `install` 403s and the default
 * launch then fails looking for a headless-shell build number that will never
 * arrive. The suite was reported as "cannot run" in exactly that situation
 * while a perfectly good browser sat on disk.
 *
 * So: honour an explicit override, else take a known preinstalled binary if one
 * is there, else change nothing and let Playwright do what it always did. The
 * fallback can only turn a hard failure into a run — it never overrides a
 * browser Playwright installed for itself, because this is only consulted when
 * the file exists and CI's own install puts its binaries elsewhere.
 */
function preinstalledChromium(): string | undefined {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    "/opt/pw-browsers/chromium",
  ].filter((p): p is string => Boolean(p));
  return candidates.find((p) => existsSync(p));
}

const executablePath = preinstalledChromium();

/** Browser E2E for the mcp.nooticr.com pages. Unit tests stay on vitest. */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    trace: "on-first-retry",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
