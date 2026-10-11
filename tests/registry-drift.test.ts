import { describe, it, expect, vi } from "vitest";
// @ts-expect-error plain .mjs script, no types
import { check, compareVersions } from "../scripts/registry-drift.mjs";

const serverJson = { name: "com.nooticr/mcp", version: "1.26.56" };
const packageJson = { name: "@nooticr/mcp" };

const registryBody = (version: string) => ({
  servers: [
    { server: { name: "com.nooticr/mcp-other", version: "9.9.9" }, _meta: {} },
    {
      server: { name: "com.nooticr/mcp", version },
      _meta: { "io.modelcontextprotocol.registry/official": { isLatest: true, publishedAt: "2026-09-05T00:00:00Z" } },
    },
  ],
});
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const fail = (status: number) => ({ ok: false, status, json: async () => ({}) });

function run(registry: Array<ReturnType<typeof ok>>) {
  const queue = [...registry];
  const fetch = vi.fn(async (url: string) =>
    url.includes("registry.npmjs.org") ? ok({ version: "1.26.56" }) : queue.shift() ?? fail(500),
  );
  return check({ serverJson, packageJson, fetch, sleep: async () => {} }).then((r: any) => ({ r, fetch }));
}

describe("registry-drift", () => {
  it("in sync -> exit 0", async () => {
    const { r } = await run([ok(registryBody("1.26.56"))]);
    expect(r.code).toBe(0);
    expect(r.line).toMatchObject({ drift: false, registry: "1.26.56", npm: "1.26.56", behind_by_patch: 0 });
  });
  it("drift -> exit 1 with patch count", async () => {
    const { r } = await run([ok(registryBody("1.26.19"))]);
    expect(r.code).toBe(1);
    expect(r.line).toMatchObject({ drift: true, registry: "1.26.19", behind_by_patch: 37, registry_published_at: "2026-09-05T00:00:00Z" });
  });
  it("registry ahead -> exit 0 with a warning", async () => {
    const { r } = await run([ok(registryBody("1.27.0"))]);
    expect(r.code).toBe(0);
    expect(r.text).toMatch(/WARNING/);
  });
  it("registry 500 x3 -> exit 2", async () => {
    const { r, fetch } = await run([fail(500), fail(500), fail(500)]);
    expect(r.code).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("registry 500 then 200 -> handled", async () => {
    const { r } = await run([fail(500), ok(registryBody("1.26.56"))]);
    expect(r.code).toBe(0);
  });
  it("compares versions numerically", () => {
    expect(compareVersions("1.26.9", "1.26.10")).toBeLessThan(0);
  });
});
