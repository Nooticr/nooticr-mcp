#!/usr/bin/env node
/**
 * Mutation testing: break something on purpose and require the suite to notice.
 *
 * A green suite says the tests passed, not that they would have caught
 * anything. Every guard added to this repo was hand-checked that way once —
 * reintroduce the bug, confirm the failure — and then never again. This runs
 * that check on every mutation, every time.
 *
 * A mutation that SURVIVES is the finding: a real defect that ships green.
 *
 *   node scripts/mutation-guard.mjs           # all
 *   node scripts/mutation-guard.mjs --only=x  # one, by id substring
 */
import { withMutation, commandFails } from "./lib/mutate.mjs";

const V = "npx vitest run --silent=true";

/**
 * Each entry is a bug that has actually happened here, phrased as the edit that
 * would reintroduce it. `catcher` is the narrowest command expected to fail —
 * narrow because the whole suite takes ~50s and this runs it once per mutation.
 */
const MUTATIONS = [
  {
    id: "over-advertise",
    why: "search_creators claiming a platform its enum rejects — the original bug",
    file: "src/shared/tools.ts",
    find: '"Searches tiktok, instagram, xiaohongshu. " +',
    replace: '"Searches tiktok, instagram, xiaohongshu, youtube. " +',
    catcher: `${V} tests/platform-claims.test.ts`,
  },
  {
    id: "under-advertise",
    why: "a capability the server has that no host is told about",
    file: "src/shared/tools.ts",
    find: "Xiaohongshu, Weibo, Bilibili or LinkedIn URL:",
    replace: "Xiaohongshu, Weibo or Bilibili URL:",
    catcher: `${V} tests/platform-claims.test.ts`,
  },
  {
    id: "drop-caveat",
    why: "Xiaohongshu's missing comment endpoint going quiet again",
    file: "src/shared/tools.ts",
    // The whole caveat, not one line of it: removing only the first line left
    // "post text only" behind, which the check accepted. A mutation that does
    // not fully break the claim tests the check against a straw man.
    find:
      '"One exception to the comment read: Xiaohongshu post comments cannot be fetched upstream, so a " +\n' +
      '    "Xiaohongshu sweep matches the post text only. Say so rather than reporting its silence as " +\n' +
      '    "nobody talking about the term there. " +',
    replace: '"" +',
    catcher: `${V} tests/platform-claims.test.ts`,
  },
  {
    id: "manifest-drift",
    why: "the vendored contract silently disagreeing with the server",
    file: "vendor/platform-capabilities.json",
    find: '"listIsCeiling": false',
    replace: '"listIsCeiling": true',
    // The unit tests read the manifest but cannot know what the server says;
    // only the contract check compares the two. Pointing this at vitest is how
    // the mutation survived its first run.
    catcher: "npm run contract:manifest",
  },
  {
    id: "sweep-loses-media",
    why: "the brand sweep drawing comments over a blank header again",
    file: "src/shared/ui-template.ts",
    find: "+mgroupMediaHtml(post,key,playing)",
    replace: '+""',
    catcher: "npx playwright test tests/e2e/ui-template.e2e.ts -g 'brand sweep'",
  },
  {
    id: "player-not-bound",
    why: "clicking a poster leaving a dead element because initPlayers never ran",
    file: "src/shared/ui-template.ts",
    find: "expandedMedia[mkey]=true;\n        renderMonitor();",
    replace: "renderMonitor();",
    catcher: "npx playwright test tests/e2e/ui-template.e2e.ts -g 'swaps in the real player'",
  },
];

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const chosen = only ? MUTATIONS.filter((m) => m.id.includes(only)) : MUTATIONS;
if (!chosen.length) {
  console.error(only ? `no mutation matching "${only}"` : "no mutations defined");
  process.exit(2);
}

const survived = [];
for (const m of chosen) {
  process.stdout.write(`· ${m.id} … `);

  // The catcher must PASS before the mutation, or its failure afterwards says
  // nothing. A typo in the command reads as "caught" for every mutation and
  // turns this whole harness into a green light — which is exactly what a
  // mis-set --silent flag did here on the first run.
  if (commandFails(m.catcher)) {
    console.log("BROKEN CATCHER (fails on a clean tree)");
    survived.push({ ...m, stale: true, brokenCatcher: true });
    continue;
  }

  let caught;
  try {
    caught = withMutation(m, () => commandFails(m.catcher));
  } catch (e) {
    // An anchor that no longer applies is a stale mutation, not a pass. Saying
    // "caught" here would be the harness lying in the one direction that costs
    // you the most.
    console.log(`STALE — ${e.message}`);
    survived.push({ ...m, stale: true });
    continue;
  }
  console.log(caught ? "caught" : "SURVIVED");
  if (!caught) survived.push(m);
}

console.log("");
if (survived.length) {
  console.log(`${survived.length}/${chosen.length} mutation(s) not caught:\n`);
  for (const m of survived) {
    console.log(`  ${m.id}${m.brokenCatcher ? " (broken catcher)" : m.stale ? " (stale anchor)" : ""}`);
    console.log(`    ${m.why}`);
    if (!m.stale) console.log(`    nothing failed: ${m.catcher}`);
  }
  process.exit(1);
}
console.log(`All ${chosen.length} mutations caught. The guards actually guard.`);
