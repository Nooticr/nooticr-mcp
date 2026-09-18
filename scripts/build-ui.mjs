#!/usr/bin/env node
/**
 * Build the MCP Apps UI stylesheet with Tailwind, and inline both it and the
 * marketplace brand marks, into src/shared/ui-template.ts.
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
 *
 * The marketplace marks are inlined from assets/brand/marketplaces/*.svg for
 * the same reason the CSS is: the view is one self-contained file and a remote
 * <img> renders as nothing. They are generated rather than pasted because the
 * alternative is twenty kilobytes of path data maintained by hand in a file
 * nobody reads to the end, and because nooticr-server's copy of this template
 * is produced from the same assets (scripts/sync-rust-ui.cjs) — two
 * hand-edited copies of a logo is how one of them ends up a version behind.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const INPUT = join(root, "src", "shared", "ui", "input.css");
const TARGET = join(root, "src", "shared", "ui-template.ts");
const LOGOS = join(root, "assets", "brand", "marketplaces");

const tmp = mkdtempSync(join(tmpdir(), "nooticr-ui-"));
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
let next = `${src.slice(0, si + open.length)}\n${css}\n${src.slice(ei)}`;

// ── The marketplace marks ──────────────────────────────────────────────────
//
// One object literal, slug to inline SVG, between the two markers below. A
// slug is the file name, which is the `marketplace` argument the tools take,
// so adding a site is dropping an SVG in the folder and nothing else.
const LOGO_OPEN = "  /* BEGIN MARKETPLACE MARKS */";
const LOGO_CLOSE = "  /* END MARKETPLACE MARKS */";
const lo = next.indexOf(LOGO_OPEN);
const lc = next.indexOf(LOGO_CLOSE, lo);
if (lo < 0 || lc < 0) {
  console.error(`build-ui: no ${LOGO_OPEN} … ${LOGO_CLOSE} block found in ui-template.ts`);
  process.exit(1);
}

const marks = readdirSync(LOGOS)
  .filter((f) => f.endsWith(".svg"))
  .sort()
  .map((f) => {
    const slug = f.slice(0, -4);
    const svg = readFileSync(join(LOGOS, f), "utf8").trim().replace(/\n\s*/g, "");
    // Each of these is fatal in one of the two hosts and silent in the other,
    // which is why they are checked here rather than left to a test: a
    // backslash is eaten by the TS template literal and kept by the Rust raw
    // string, a backtick or a ${ ends the TS literal, and an apostrophe closes
    // the single-quoted JS string these are emitted into.
    const hazards = [
      ["\\", "a backslash (the TS template literal eats it, the Rust one keeps it)"],
      ["`", "a backtick (it closes the TS template literal)"],
      ["$" + "{", "a ${ (it opens an interpolation in the TS template literal)"],
      ["'", "an apostrophe (it closes the single-quoted JS string)"],
    ];
    for (const [bad, why] of hazards) {
      if (svg.includes(bad)) {
        console.error(`build-ui: ${f} contains ${why} — re-export it without one.`);
        process.exit(1);
      }
    }
    // Ids go document-global the moment seven marks share one page, so a
    // clipPath called "a" in two of them clips the wrong logo — silently, and
    // only in whichever one loses the race.
    for (const m of svg.matchAll(/id="([^"]+)"/g)) {
      if (!m[1].startsWith(`${slug}-`)) {
        console.error(
          `build-ui: ${f} has id="${m[1]}", which is not prefixed with "${slug}-" — ` +
            "ids collide once the marks share a document. Re-run svgo with prefixIds.",
        );
        process.exit(1);
      }
    }
    return `    ${slug}:'${svg}'`;
  });

next =
  next.slice(0, lo + LOGO_OPEN.length) +
  "\n" +
  marks.join(",\n") +
  "\n" +
  next.slice(lc);

writeFileSync(TARGET, next);
console.log(
  `build-ui: inlined ${css.length} bytes of Tailwind CSS and ${marks.length} ` +
    "marketplace marks into src/shared/ui-template.ts",
);
