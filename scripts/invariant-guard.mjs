#!/usr/bin/env node
/**
 * The propose/verify loop: an LLM proposes invariants, a verifier earns them.
 *
 * The model is never trusted. It reads the codebase's own prose — this repo
 * states its invariants in comments ("Advertising a platform that cannot work
 * just spends a paid call to fail", "A failed comment fetch is not a failed
 * post") — and proposes each as an executable check PLUS the mutant that check
 * claims to catch. This script then demands two things of every candidate:
 *
 *   1. the check passes on the clean tree      (it is not simply broken)
 *   2. the check FAILS on its own mutant       (it actually bites)
 *
 * Only candidates clearing both are written to invariants/earned.json. A
 * confident, plausible, wrong invariant fails step 2 and is discarded — which
 * is the whole point, because the proposing model is wrong a fair share of the
 * time. Three of the checks written by hand in this repo were wrong on their
 * first run and only the failures said so.
 *
 *   node scripts/invariant-guard.mjs                  # verify candidates
 *   node scripts/invariant-guard.mjs --print-prompt   # what to send an LLM
 *
 * Exit 0 when every candidate is earned or honestly rejected; 1 if a candidate
 * is malformed.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { withMutation, commandFails } from "./lib/mutate.mjs";

const CANDIDATES = new URL("../invariants/candidates.json", import.meta.url);
const EARNED = new URL("../invariants/earned.json", import.meta.url);

const PROMPT = `You are proposing regression guards for this repository.

Read the source and its comments. Where a comment states an invariant the code
is supposed to hold — a rule, a constraint, a "must", a warning about what went
wrong before — propose it as an executable check.

Return JSON: an array of objects with these fields.

  id       kebab-case, unique
  claim    the invariant in one sentence, in the codebase's own terms
  source   file:line the prose came from, so a human can check your reading
  check    a shell command that exits 0 when the invariant holds
  mutant   { file, find, replace } — the smallest edit that BREAKS the claim

Rules that matter more than coverage:

- The mutant must break the claim and nothing else. If you cannot write one,
  omit the candidate: an invariant nothing can violate is not an invariant.
- "find" must appear EXACTLY ONCE in the file. Ambiguous anchors are rejected.
- Prefer an existing test command over inventing one.
- Do not propose what is already guarded. Check the tests first.

Every candidate is verified before it is kept: your check must pass on the
clean tree and fail on your own mutant. A candidate that cannot do both is
discarded, so guessing costs you nothing but earns you nothing.`;

if (process.argv.includes("--print-prompt")) {
  console.log(PROMPT);
  process.exit(0);
}

if (!existsSync(CANDIDATES)) {
  console.error(`no candidates at ${CANDIDATES.pathname}`);
  console.error(`generate them with an LLM using: node scripts/invariant-guard.mjs --print-prompt`);
  process.exit(1);
}

const candidates = JSON.parse(readFileSync(CANDIDATES, "utf8"));
if (!Array.isArray(candidates)) {
  console.error("candidates.json must be an array");
  process.exit(1);
}

const earned = [];
const rejected = [];

for (const c of candidates) {
  for (const field of ["id", "claim", "check", "mutant"]) {
    if (!c[field]) {
      console.error(`candidate missing "${field}": ${JSON.stringify(c).slice(0, 90)}`);
      process.exit(1);
    }
  }
  process.stdout.write(`· ${c.id} … `);

  // 1. Does it hold right now? A check that fails on a clean tree is either a
  //    real finding or a broken check, and either way it is not a guard yet.
  if (commandFails(c.check)) {
    console.log("REJECTED (fails on clean tree)");
    rejected.push({ ...c, why: "the check does not pass before any mutation" });
    continue;
  }

  // 2. Does it bite? This is the step that separates a guard from a sentence.
  let bites;
  try {
    bites = withMutation(c.mutant, () => commandFails(c.check));
  } catch (e) {
    console.log(`REJECTED (${e.message})`);
    rejected.push({ ...c, why: e.message });
    continue;
  }
  if (!bites) {
    console.log("REJECTED (mutant survives)");
    rejected.push({ ...c, why: "the mutant broke the claim and the check still passed" });
    continue;
  }

  console.log("earned");
  earned.push(c);
}

writeFileSync(EARNED, JSON.stringify(earned, null, 2) + "\n");

console.log("");
console.log(`${earned.length} earned, ${rejected.length} rejected, of ${candidates.length} proposed.`);
for (const r of rejected) console.log(`  ${r.id}: ${r.why}`);
console.log(`\nEarned invariants written to invariants/earned.json`);
