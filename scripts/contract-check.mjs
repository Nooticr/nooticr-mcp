#!/usr/bin/env node
/**
 * Contract check: the vendored capability manifest against the one the server
 * generates.
 *
 * This repo describes tools that another repo dispatches, so every platform
 * claim here is a claim about code over there. Both directions have gone wrong:
 * this side advertising what the server rejects, and the server gaining a
 * capability nothing here mentioned. The vendored copy is the contract, and a
 * copy is only worth something if something notices when it goes stale.
 *
 *   node scripts/contract-check.mjs --from ../nooticr-server/platform-capabilities.json
 *   node scripts/contract-check.mjs --from https://raw.githubusercontent.com/...
 *
 * Exit 0 identical · 1 drift · 2 could not compare (never silently pass).
 */
import { readFileSync } from "node:fs";

const VENDORED = new URL("../vendor/platform-capabilities.json", import.meta.url);
const from = process.argv.find((a) => a.startsWith("--from="))?.slice(7);

if (!from) {
  console.error("usage: contract-check.mjs --from=<path|url to the server's platform-capabilities.json>");
  process.exit(2);
}

async function load(src) {
  if (/^https?:/.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`${src} → HTTP ${res.status}`);
    return res.json();
  }
  return JSON.parse(readFileSync(src, "utf8"));
}

let upstream, vendored;
try {
  [upstream, vendored] = await Promise.all([load(from), load(VENDORED)]);
} catch (e) {
  // Exit 2, not 0: an unreachable upstream is an unknown answer, and a check
  // that passes when it could not look is worse than no check.
  console.error(`could not compare: ${e.message}`);
  process.exit(2);
}

const drift = [];
const caps = [...new Set([...Object.keys(upstream), ...Object.keys(vendored)])].sort();

for (const cap of caps) {
  const u = upstream[cap];
  const v = vendored[cap];
  if (!u) { drift.push(`${cap}: vendored here, gone from the server`); continue; }
  if (!v) { drift.push(`${cap}: the server has it, this repo has never heard of it`); continue; }

  const up = (u.platforms ?? []).join(",");
  const vp = (v.platforms ?? []).join(",");
  if (up !== vp) {
    const gained = (u.platforms ?? []).filter((p) => !(v.platforms ?? []).includes(p));
    const lost = (v.platforms ?? []).filter((p) => !(u.platforms ?? []).includes(p));
    if (gained.length) drift.push(`${cap}: the server now serves ${gained.join(", ")} — nothing here says so`);
    if (lost.length) drift.push(`${cap}: this repo still claims ${lost.join(", ")}, which the server dropped`);
  }
  if (!!u.listIsCeiling !== !!v.listIsCeiling) {
    drift.push(`${cap}: listIsCeiling is ${u.listIsCeiling} upstream, ${v.listIsCeiling} here`);
  }
  const uc = (u.commentsUnavailable ?? []).join(",");
  const vc = (v.commentsUnavailable ?? []).join(",");
  if (uc !== vc) drift.push(`${cap}: commentsUnavailable [${uc}] upstream vs [${vc}] here`);
}

if (drift.length) {
  console.log(`Contract drift (${drift.length}):\n`);
  for (const d of drift) console.log(`  ${d}`);
  console.log(`\nRegenerate upstream, copy it into vendor/, and rerun the claims test.`);
  process.exit(1);
}
console.log(`Contract intact: ${caps.length} capabilities agree with ${from}.`);
