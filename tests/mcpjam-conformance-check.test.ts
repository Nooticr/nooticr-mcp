/**
 * The conformance verdict is an exclusion of two pinned checks, not an
 * allowlist of five (#25). Driven through the real checker CI runs.
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SKYBRIDGE = 'ui://nooticr/analyze_post.html uses mimeType "text/html+skybridge" instead of "text/html;profile=mcp-app"';

type Check = { id: string; status: string; details?: { violations?: string[] } };

function result(checks: Check[]) {
  return {
    summary: "test",
    checks,
    discovery: { toolCount: 76, uiToolCount: 76, checkedUiResourceCount: 138 },
  };
}

const pinned = (status = "failed", violations = [SKYBRIDGE]): Check[] => [
  { id: "ui-listed-resources-valid", status, details: { violations } },
  { id: "ui-resource-contents-valid", status, details: { violations } },
];

const today: Check[] = [
  { id: "ui-tools-present", status: "passed" },
  { id: "ui-tool-metadata-valid", status: "passed" },
  ...pinned(),
];

function judge(d: unknown): { code: number; out: string } {
  const dir = mkdtempSync(join(tmpdir(), "conformance-"));
  const file = join(dir, "c.json");
  writeFileSync(file, JSON.stringify(d));
  const r = spawnSync("python3", ["scripts/mcpjam-conformance-check.py", file], { encoding: "utf8" });
  return { code: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
}

describe("mcpjam conformance checker", () => {
  it("accepts today's result: only the dual-mime deviation fails", () => {
    expect(judge(result(today)).code).toBe(0);
  });

  it("gates a check mcpjam adds later instead of never running it", () => {
    const passing = judge(result([...today, { id: "ui-new-check", status: "passed" }]));
    expect(passing.code).toBe(0);
    const failing = judge(result([...today, { id: "ui-new-check", status: "failed" }]));
    expect(failing.code).toBe(1);
    expect(failing.out).toContain("new conformance failure: ui-new-check");
  });

  it("treats a check that could not run as a failure", () => {
    const r = judge(result([...today, { id: "ui-tools-present-2", status: "error" }]));
    expect(r.code).toBe(1);
  });

  it("fails a pinned check that fails for another reason", () => {
    const r = judge(result([today[0], today[1], ...pinned("failed", ["resource has no body"])]));
    expect(r.code).toBe(1);
    expect(r.out).toContain("failed for a new reason");
  });

  it("fails when a pinned check starts passing: the twins lost their mime", () => {
    const r = judge(result([today[0], today[1], ...pinned("passed", [])]));
    expect(r.code).toBe(1);
    expect(r.out).toContain("now passes");
  });

  it("fails when a pinned check disappears from the run", () => {
    const r = judge(result([today[0], today[1], today[2]]));
    expect(r.code).toBe(1);
    expect(r.out).toContain("ui-resource-contents-valid was not run");
  });

  it("fails when discovery found nothing", () => {
    const r = judge({ ...result(today), discovery: {} });
    expect(r.code).toBe(1);
  });
});
