#!/usr/bin/env node
/**
 * Build the MCP Apps UI stylesheet with Tailwind and inline it into
 * src/shared/ui-template.ts.
 *
 * The served view must stay a single self-contained file (no external
 * requests — the Claude/ChatGPT iframes are sandboxed), and
 * tests/ui-resource.test.ts pins "no backslashes at all" in the resolved
 * template (dual-host TS/Rust safety). So this script FAILS the build if the
 * compiled CSS contains a backslash (escaped selectors from responsive /
 * arbitrary-value utilities) or a remote URL.
 *
 * Only simple integer-scale utilities (no `:` variants, no `/` opacity
 * modifiers, no arbitrary values, no dotted fractional spacing) may be used
 * in scanned markup — all of those emit backslash-escaped selectors. Dark mode is
 * handled by flipping :root vars in a prefers-color-scheme block, never by
 * dark:. Arbitrary values and dotted utilities are fine inside @apply in
 * input.css — they inline declarations without emitting selectors.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const INPUT = join(root, "src", "shared", "ui", "input.css");
const TARGET = join(root, "src", "shared", "ui-template.ts");

const tmp = mkdtempSync(join(tmpdir(), "orchyn-ui-"));
const out = join(tmp, "compiled.css");

execFileSync(
  process.execPath,
  [join(root, "node_modules", "@tailwindcss", "cli", "dist", "index.mjs"),
    "-i", INPUT, "-o", out, "--minify"],
  { cwd: root, stdio: "inherit" },
);

let css = readFileSync(out, "utf8").trim();
// Drop the /*! license banner */ — the dependency is declared in
// package.json; the served view must carry no remote URLs at all.
css = css.replace(/\/\*![\s\S]*?\*\//g, "").trim();

const backslashes = css.match(/\\/g);
if (backslashes) {
  const i = css.indexOf("\\");
  console.error(`build-ui: compiled CSS contains ${backslashes.length} backslash(es) — refusing to inline.`);
  console.error(`first at: …${css.slice(Math.max(0, i - 80), i + 80)}…`);
  console.error("Only use simple Tailwind utilities (no :variants, /opacity, or arbitrary values).");
  process.exit(1);
}
const remote = css.match(/https?:\/\//);
if (remote) {
  console.error("build-ui: compiled CSS references a remote URL — the view must be self-contained.");
  process.exit(1);
}

const src = readFileSync(TARGET, "utf8");
const open = "<style>";
const close = "</style>";
const si = src.indexOf(open);
const ei = src.indexOf(close, si);
if (si < 0 || ei < 0 || ei < si) {
  console.error("build-ui: no <style>…</style> block found in ui-template.ts");
  process.exit(1);
}
const next = `${src.slice(0, si + open.length)}\n${css}\n${src.slice(ei)}`;
writeFileSync(TARGET, next);
console.log(`build-ui: inlined ${css.length} bytes of Tailwind CSS into src/shared/ui-template.ts`);
