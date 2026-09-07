#!/usr/bin/env node
/**
 * Check `chatgpt-app-submission.json` against the schema it declares.
 *
 * This exists because the submission file was assembled by hand — the
 * `$chatgpt-app-submission` skill was not available where it was written — so
 * every VALUE in it is sourced from this repo and checked, while the FIELD
 * NAMES were a guess. The schema URL is known
 * (`developers.openai.com/apps-sdk/schemas/chatgpt-app-submission.v1.json`)
 * and was unreachable from that environment: the egress proxy returns 403 on
 * CONNECT for that host.
 *
 * So the reconciliation is one command on any machine that can reach it,
 * rather than a paragraph of instructions nobody runs.
 *
 * Deliberately dependency-free and deliberately shallow. It does NOT validate
 * types, formats, enums or nested shapes — that needs a real JSON Schema
 * validator, and adding ajv to this package to check one file that ships
 * nowhere is not a trade worth making. What it does catch is exactly the risk
 * the hand-assembly created:
 *
 *   - a key we invented that the schema does not have
 *   - a required key we never filled in
 *   - a key we left `null` (visible on purpose, so a gap cannot be uploaded
 *     silently — but `null` will fail a real validator if the field wants a
 *     string, which is the point)
 *
 * Anything it reports as OK still needs a real validator before submitting.
 * Exits 1 on a finding so it can gate a release step, and 2 when it could not
 * reach the schema — a check that passes because it could not look is worse
 * than no check.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = resolve(root, "chatgpt-app-submission.json");

const submission = JSON.parse(readFileSync(file, "utf8"));
const schemaUrl = submission.$schema;
if (!schemaUrl) {
  console.error("chatgpt-app-submission.json declares no $schema.");
  process.exit(1);
}

let schema;
try {
  const res = await fetch(schemaUrl, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  schema = await res.json();
} catch (err) {
  console.error(`Could not fetch ${schemaUrl}: ${err.message}`);
  console.error(
    "Exiting 2 rather than 0: this check is worthless if it cannot read the schema.\n" +
      "If the network blocks it, download the schema by hand and re-run with\n" +
      "  SUBMISSION_SCHEMA=/path/to/schema.json node scripts/check-submission-schema.mjs",
  );
  const local = process.env.SUBMISSION_SCHEMA;
  if (!local) process.exit(2);
  schema = JSON.parse(readFileSync(local, "utf8"));
  console.error(`Using local copy: ${local}\n`);
}

const properties = schema.properties ?? {};
const known = new Set(Object.keys(properties));
// `$schema` is a schema-level key, not a payload field; schemas rarely list it.
known.add("$schema");
const required = new Set(schema.required ?? []);

const ours = Object.keys(submission);
const findings = [];

if (!Object.keys(properties).length) {
  findings.push(
    "The document at $schema has no `properties` — it may not be a JSON Schema. " +
      "Inspect it by hand before trusting anything below.",
  );
}

for (const key of ours) {
  if (!known.has(key)) {
    findings.push(`unknown key "${key}" — the schema does not define it (we guessed this name)`);
  }
}
for (const key of required) {
  if (!(key in submission)) findings.push(`missing required key "${key}"`);
}
const nulls = ours.filter((k) => submission[k] === null);
for (const key of nulls) {
  const isRequired = required.has(key) ? " (and the schema requires it)" : "";
  findings.push(`"${key}" is null — needs a real value before submitting${isRequired}`);
}

const label = (n) => `${n} ${n === 1 ? "finding" : "findings"}`;
if (findings.length) {
  console.error(`${label(findings.length)} in chatgpt-app-submission.json:\n`);
  for (const f of findings) console.error(`  - ${f}`);
  console.error(
    "\nThis is a shallow name-and-presence check. Run a real JSON Schema " +
      "validator before uploading.",
  );
  process.exit(1);
}

console.log(
  `chatgpt-app-submission.json: ${ours.length} keys, all defined by the schema, ` +
    "every required key present, no nulls left.\n" +
    "Still a shallow check — types, formats and nested shapes are unverified.",
);
