#!/usr/bin/env node
/**
 * Compare the version served by the official MCP registry for `server.json`'s
 * name with the version in this repo and on npm.
 *
 * Exit codes (so a caller can tell "stale" from "couldn't check"):
 *   0  registry == repo (or the registry is ahead: warned, should never happen)
 *   1  drift: the registry is behind the repo
 *   2  the registry or npm could not be reached after retries
 *
 * Node >= 18 built-ins only.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = "https://registry.modelcontextprotocol.io/v0/servers";
const NPM = "https://registry.npmjs.org";

const parts = (v) => String(v).split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
export function compareVersions(a, b) {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

/** GET JSON, retrying 5xx / network errors up to `tries` times with backoff. */
async function getJson(url, { fetch, sleep, tries = 3 }) {
  let last;
  for (let i = 0; i < tries; i++) {
    if (i > 0) await sleep(500 * 2 ** (i - 1));
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (res.ok) return await res.json();
      last = new Error(`HTTP ${res.status} from ${url}`);
      if (res.status < 500) break;
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

/** The registry's `search` is a substring match: pick the exact name, latest first. */
function pickEntry(body, name) {
  const rows = (body?.servers ?? []).map((r) => ({
    server: r.server ?? r,
    meta: r._meta?.["io.modelcontextprotocol.registry/official"] ?? {},
  }));
  const mine = rows.filter((r) => r.server?.name === name);
  return mine.find((r) => r.meta.isLatest) ?? mine[0] ?? null;
}

export async function check({
  serverJson,
  packageJson,
  fetch = globalThis.fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  const name = serverJson.name;
  const repo = serverJson.version;
  const io = { fetch, sleep };
  let registry, publishedAt, npm;
  try {
    const body = await getJson(`${REGISTRY}?search=${encodeURIComponent(name)}`, io);
    const entry = pickEntry(body, name);
    registry = entry?.server.version ?? null;
    publishedAt = entry?.meta.publishedAt ?? null;
    const pkg = packageJson.name ?? "@nooticr/mcp";
    npm = (await getJson(`${NPM}/${pkg.replaceAll("/", "%2f")}/latest`, io)).version;
  } catch (e) {
    return { code: 2, line: null, text: `Could not check the registry or npm: ${e.message}` };
  }
  const cmp = registry ? compareVersions(registry, repo) : -1;
  const drift = cmp < 0;
  const behind = drift ? Math.max(0, parts(repo)[2] - (registry ? parts(registry)[2] : 0)) : 0;
  const line = {
    name,
    repo,
    npm,
    registry,
    registry_published_at: publishedAt,
    drift,
    behind_by_patch: behind,
  };
  let text;
  if (!registry) text = `${name} is not in the registry; repo is at ${repo}.`;
  else if (drift) text = `Registry serves ${registry} but the repo is at ${repo} (npm ${npm}): behind by ${behind} patch releases.`;
  else if (cmp > 0) text = `WARNING: registry (${registry}) is ahead of the repo (${repo}); this should never happen.`;
  else text = `Registry is in sync at ${registry}.`;
  return { code: drift ? 1 : 0, line, text };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const read = (p) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
  const r = await check({ serverJson: read("server.json"), packageJson: read("package.json") });
  if (r.line) console.log(JSON.stringify(r.line));
  (r.code === 0 ? console.log : console.error)(r.text);
  process.exit(r.code);
}
