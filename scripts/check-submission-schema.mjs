#!/usr/bin/env node
/**
 * Validate `chatgpt-app-submission.json` against the ChatGPT App submission
 * schema, offline.
 *
 * The schema is vendored at `docs/chatgpt-app-submission.schema.json` rather
 * than fetched, for the reason `contract:manifest` gives about the platform
 * manifest: a check that cannot reach its source is a check that passes
 * because it could not look. `developers.openai.com` is not reachable from
 * every environment this repo is worked on — the egress proxy answers CONNECT
 * for it with a 403 — and a submission check that silently skips in exactly
 * those environments is worse than none.
 *
 * Hand-rolled rather than ajv. Every constraint the schema states is checked
 * below; the schema is small, stable and versioned in its own filename
 * (`.v1.json`), so a dependency to interpret 90 lines of it is not a trade
 * worth making in a package that ships `dist` only. If v2 arrives with
 * anything structurally new, re-vendor the schema and extend this — the
 * `$schema` const check will fail first and say so.
 *
 * Exits 1 on any finding, 0 when the file satisfies the schema.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(resolve(root, p), "utf8"));

const doc = read("chatgpt-app-submission.json");
const schema = read("docs/chatgpt-app-submission.schema.json");

const findings = [];
const fail = (where, msg) => findings.push(`${where}: ${msg}`);

/** The schema's own string shapes. `pattern: "\\S"` means "not all whitespace". */
const nonEmpty = (v) => typeof v === "string" && /\S/.test(v);
const nullableString = (v) => v === null || v === undefined || typeof v === "string";
const nullableStringArray = (v) =>
  v === null || v === undefined || (Array.isArray(v) && v.every((x) => typeof x === "string"));

// ── top level ──
const wantSchema = schema.properties.$schema.const;
if (doc.$schema !== wantSchema) {
  fail("$schema", `must be exactly ${wantSchema} (found ${doc.$schema ?? "nothing"})`);
}
const wantVersion = schema.properties.schema_version.const;
if (doc.schema_version !== wantVersion) {
  fail("schema_version", `must be ${wantVersion} (found ${JSON.stringify(doc.schema_version)})`);
}
for (const key of schema.required) {
  if (!(key in doc)) fail(key, "required by the schema and absent");
}

// ── app_info ──
if (doc.app_info !== undefined) {
  const a = doc.app_info;
  if (typeof a !== "object" || a === null) fail("app_info", "must be an object");
  else {
    if ("display_name" in a && !nonEmpty(a.display_name))
      fail("app_info.display_name", "must be a non-blank string");
    if ("subtitle" in a) {
      if (!nonEmpty(a.subtitle)) fail("app_info.subtitle", "must be a non-blank string");
      else if (a.subtitle.length > 30)
        fail("app_info.subtitle", `max 30 characters, found ${a.subtitle.length}`);
    }
    if ("description" in a) {
      if (!nonEmpty(a.description)) fail("app_info.description", "must be a non-blank string");
      else if (a.description.length > 4000)
        fail("app_info.description", `max 4000 characters, found ${a.description.length}`);
    }
    const categories = schema.$defs.appInfo.properties.category.enum;
    if ("category" in a && !categories.includes(a.category))
      fail("app_info.category", `must be one of ${categories.join(", ")} (found ${a.category})`);
  }
}

// ── tools: every entry needs three annotations and three justifications ──
if (doc.tools === undefined || typeof doc.tools !== "object" || doc.tools === null) {
  fail("tools", "must be an object keyed by tool name");
} else {
  const hints = schema.$defs.tool.properties.annotations.required;
  const reasons = schema.$defs.tool.properties.justifications.required;
  const names = Object.keys(doc.tools);
  if (!names.length) fail("tools", "is empty — the form has nothing to import");
  for (const name of names) {
    const t = doc.tools[name];
    if (typeof t !== "object" || t === null) {
      fail(`tools.${name}`, "must be an object");
      continue;
    }
    if (typeof t.annotations !== "object" || t.annotations === null) {
      fail(`tools.${name}.annotations`, "required and must be an object");
    } else {
      for (const h of hints) {
        if (typeof t.annotations[h] !== "boolean")
          fail(`tools.${name}.annotations.${h}`, "required and must be a boolean");
      }
    }
    if (typeof t.justifications !== "object" || t.justifications === null) {
      fail(`tools.${name}.justifications`, "required and must be an object");
    } else {
      for (const r of reasons) {
        if (!nonEmpty(t.justifications[r]))
          fail(`tools.${name}.justifications.${r}`, "required and must be a non-blank string");
      }
    }
  }
}

// ── test cases ──
/**
 * The schema states `minItems` and no maximum, but the uploader reads that
 * number as an exact count: a file with seven positive cases is rejected with
 * "test_cases must include exactly 5 entries". So `minItems` is the count
 * here, not a floor — the same way the `$schema` const is the uploader's
 * value rather than the document's. Too many entries is as much a finding as
 * too few, and only the upload can tell you, which is why it is checked here.
 */
function checkCases(key, exact, requiredKeys, longDescription) {
  const rows = doc[key];
  if (rows === undefined) {
    // Not required by the schema, but a submission without them is not one
    // anybody should upload — so say so rather than pass it silently.
    fail(key, `absent — the schema allows it, but the form expects exactly ${exact}`);
    return;
  }
  if (!Array.isArray(rows)) return fail(key, "must be an array");
  if (rows.length !== exact)
    fail(key, `must include exactly ${exact} entries, found ${rows.length}`);
  rows.forEach((r, i) => {
    const at = `${key}[${i}]`;
    if (typeof r !== "object" || r === null) return fail(at, "must be an object");
    for (const k of requiredKeys) {
      if (!nonEmpty(r[k])) fail(`${at}.${k}`, "required and must be a non-blank string");
    }
    if (longDescription && typeof r.description === "string" && r.description.length > 4000)
      fail(`${at}.description`, `max 4000 characters, found ${r.description.length}`);
    if (!nullableStringArray(r.file_attachment_urls))
      fail(`${at}.file_attachment_urls`, "must be an array of strings, or null");
    for (const k of ["expected_output", "expected_output_url"]) {
      if (!nullableString(r[k])) fail(`${at}.${k}`, "must be a string or null");
    }
  });
}
// A positive case must name the tools it triggers; a negative one may be null,
// which is the point of a negative case.
//
// 5 and 3 are the two `minItems` values, read as exact counts per above. Only
// the positive count is confirmed by a rejection message; the negative one is
// the same rule applied to the other array, on the reasoning that one
// validator serves both. If the uploader turns out to accept more negatives,
// this is where to relax it — and `docs/chatgpt-app-submission.md` keeps the
// two cases that were dropped to reach 3, so they can go straight back in.
checkCases("test_cases", schema.properties.test_cases.minItems,
  schema.$defs.positiveTestCase.required, true);
checkCases("negative_test_cases", schema.properties.negative_test_cases.minItems,
  schema.$defs.negativeTestCase.required, false);
if (Array.isArray(doc.negative_test_cases)) {
  doc.negative_test_cases.forEach((r, i) => {
    if (r && "tools_triggered" in r && !nullableString(r.tools_triggered))
      fail(`negative_test_cases[${i}].tools_triggered`, "must be a string or null");
  });
}

const n = findings.length;
if (n) {
  console.error(`${n} ${n === 1 ? "finding" : "findings"} in chatgpt-app-submission.json:\n`);
  for (const f of findings) console.error(`  - ${f}`);
  process.exit(1);
}

const toolCount = Object.keys(doc.tools).length;
console.log(
  // The const, not `$id`. They differ on purpose — see the schema's own
  // `$comment` — and printing `$id` here reported a URL the file does not
  // declare, which reads as a mismatch the moment anyone compares the two.
  `chatgpt-app-submission.json satisfies ${wantSchema}\n` +
    `  ${toolCount} tools, each with three annotations and three justifications\n` +
    `  ${doc.test_cases?.length ?? 0} positive and ${doc.negative_test_cases?.length ?? 0} negative test cases\n` +
    "Schema-valid is not the same as accurate: the justifications and test cases " +
    "are claims about behaviour and still want a human read.",
);
