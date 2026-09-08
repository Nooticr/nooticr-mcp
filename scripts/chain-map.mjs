#!/usr/bin/env node
// What actually steers a host from one tool to the next — read off the real
// built server, not off the source.
//
// This repo's whole design rests on one sentence in evidence.ts: "A tool
// result is the only channel to the calling model ... the guidance below is
// not documentation; it is the steering, and it lands in the model's
// context." Everything downstream of that — every show_* tool existing at
// all — assumes a chain: an evidence tool hands the model material and a
// sentence naming what to call next, and the model calls it.
//
// Nothing checked that the chain was real. This does, in three passes that
// each catch a different way it can be broken:
//
//   1. SELECTION edges — a tool DESCRIPTION naming another tool ("use
//      analyze_post_fast instead when ..."). These steer before any call.
//   2. GUIDANCE edges — the real text a real tools/call returns, read by
//      calling every tool for real against the fixture backend. A guidance
//      string that names a tool that does not exist, or that no longer
//      matches the argument the target actually takes, shows up here and
//      nowhere else.
//   3. GUIDANCE DELIVERY — for each tool, WHERE that guidance lives in the
//      result:
//      a `content` text block, `structuredContent`, or both. This is the
//      pass that matters most and the one nobody would think to write:
//      hosts that render structuredContent (Claude Code among them) replace
//      the content text blocks with the serialised structuredContent, so
//      guidance that lives only in a text block never reaches the model.
//      See docs/testing/tool-chaining-quests.md for the measurement.
//   4. EVIDENCE DELIVERY — the mirror of 3. A host rendering a UI view does
//      the opposite of Claude Code: it hands the model the text blocks and
//      gives structuredContent to the widget. So material that lives only in
//      the payload reaches no model there, and a tool whose guidance says
//      "here are 4 comments, classify each one" is describing something the
//      model cannot see. See #59.
//
// Usage (needs a backend booted and NOOTICR_BASE_URL/NOOTICR_ACCESS_TOKEN
// exported — scripts/run-quests.sh does that for you):
//   node scripts/chain-map.mjs [--json out.json] [--quiet] [--gate]
import fs from "node:fs";
import { connectBuiltServer, resultText } from "./quest-lib/mcp-client.mjs";
import { argsFor } from "./quest-lib/probe-args.mjs";

const argv = process.argv.slice(2);
const jsonOut = argv.includes("--json") ? argv[argv.indexOf("--json") + 1] : null;
const quiet = argv.includes("--quiet");
// Off by default: this is a map first, and a map that exits 1 stops being read.
// With --gate it is a check, for the two findings that are never acceptable —
// a guidance edge no host will deliver, and a show_* view nothing names.
const gate = argv.includes("--gate");
const say = (...a) => { if (!quiet) console.log(...a); };

/**
 * A tool name inside prose, not inside a longer identifier. `show_post_analysis`
 * must not match inside `show_post_analysis_v2`, and a bare mention in a sentence
 * ("call show_post_analysis with the url") must match with or without backticks.
 */
function mentions(text, names, self) {
  if (!text) return [];
  const found = new Set();
  for (const name of names) {
    if (name === self) continue;
    if (new RegExp(`(^|[^a-zA-Z0-9_])${name}([^a-zA-Z0-9_]|$)`).test(text)) found.add(name);
  }
  return [...found];
}

/** Tool-shaped tokens in prose that are NOT real tools — a stale pointer. */
function danglingIn(text, names) {
  if (!text) return [];
  const out = new Set();
  // Only look at snake_case tokens that read like one of ours: a verb_noun
  // shape with at least one underscore, mentioned near a calling verb.
  for (const m of text.matchAll(/\b([a-z][a-z0-9]*(?:_[a-z0-9]+){1,3})\b/g)) {
    const token = m[1];
    if (names.includes(token)) continue;
    if (!/^(call|calls|calling|use|uses|using|run|see)\b/i.test(text.slice(Math.max(0, m.index - 14), m.index))) continue;
    out.add(token);
  }
  return [...out];
}

const client = await connectBuiltServer({ name: "chain-map" });
const { tools } = await client.listTools();
const names = tools.map((t) => t.name);
say(`chain-map: ${tools.length} tools on the real built server\n`);

const edges = [];
const delivery = [];
const dangling = [];
const probeFailures = [];
// Tools whose material never reaches a host that shows only text blocks.
const evidenceLost = [];

for (const tool of tools) {
  for (const to of mentions(tool.description, names, tool.name)) {
    edges.push({ from: tool.name, to, kind: "tool-description" });
  }
  for (const [arg, schema] of Object.entries(tool.inputSchema?.properties ?? {})) {
    for (const to of mentions(schema?.description, names, tool.name)) {
      edges.push({ from: tool.name, to, kind: "arg-description", via: arg });
    }
  }
  dangling.push(...danglingIn(tool.description, names).map((token) => ({ where: `${tool.name}.description`, token })));
}

for (const tool of tools) {
  let result;
  try {
    result = await client.callTool({ name: tool.name, arguments: argsFor(tool) });
  } catch (err) {
    probeFailures.push({ tool: tool.name, error: String(err?.message ?? err).slice(0, 200) });
    continue;
  }
  const text = resultText(result);
  const structured = result.structuredContent ?? null;
  const structuredJson = structured ? JSON.stringify(structured) : "";

  // Pass 3, per tool rather than per edge: does the GUIDANCE PROSE survive,
  // not merely does the target tool's name appear somewhere in the payload.
  // That distinction is the whole finding — analyze_post's structuredContent
  // lists get_post_transcript in `evidenceFrom`, which is data, and an
  // earlier version of this check read that as "the steering survived".
  // Compare against the PARSED values, not the serialised JSON. Checking
  // `JSON.stringify(structured).includes(text.slice(0, 60))` reported a false
  // negative for every tool whose guidance opens with a newline or a quote,
  // because the JSON form escapes them and the raw text does not — five
  // evidence tools looked like they had lost their guidance when they were
  // carrying it correctly.
  // Pass 4: does the EVIDENCE survive a host that delivers only text blocks?
  //
  // The mirror of pass 3, and the failure it catches is the one that shipped:
  // Claude Code drops these text blocks and reads `structuredContent`, so
  // guidance had to go in the payload (#44/#51) — but a host rendering a UI
  // view does the opposite, handing the model the text blocks and giving
  // `structuredContent` to the widget. A tool whose guidance says "here are 4
  // comments, classify each one" and whose comments live only in the payload
  // asks a model to reason over material it was never shown (#59).
  //
  // Matched on an IDENTIFYING field rather than "any long string": a run is
  // a date and two integers, an app is an id and a short name, and a
  // length-based heuristic reports both as missing while they are rendered
  // correctly.
  const IDENTIFYING = [
    "id", "externalUrl", "url", "permalink", "caption", "text", "title",
    "username", "handle", "creatorHandle", "name", "term", "appId", "ranAt", "tag",
  ];
  for (const [key, rows] of Object.entries(structured ?? {})) {
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const first = rows.find((r) => r && typeof r === "object");
    if (!first) continue;
    const marks = IDENTIFYING
      .map((f) => first[f])
      .filter((v) => typeof v === "string" || typeof v === "number")
      .map((v) => String(v))
      .filter((v) => v.length > 0);
    if (!marks.length) continue;
    // Normalised and prefix-matched on purpose: a rendering that collapses
    // whitespace, or shows an ISO timestamp as its date, is still a rendering.
    // Requiring the byte-identical value reported three tools as having lost
    // material they were displaying correctly.
    const flat = text.replace(/\s+/g, " ");
    const shows = (m) => {
      const norm = m.replace(/\s+/g, " ").trim();
      if (!norm) return false;
      // An ISO timestamp rendered as its date is rendered. `mention_trend`
      // shows one point per run as `2026-09-08 · found 16 · reported 0`, and
      // demanding the milliseconds back would be asking the digest to be
      // less readable to satisfy the check.
      if (/^\d{4}-\d{2}-\d{2}T/.test(norm) && flat.includes(norm.slice(0, 10))) return true;
      return flat.includes(norm.length > 24 ? norm.slice(0, 24) : norm);
    };
    if (!marks.some(shows)) {
      evidenceLost.push({ tool: tool.name, key, count: rows.length });
    }
  }

  const needle = text.slice(0, 60);
  const carriesGuidance = (value) => {
    if (typeof value === "string") return value.includes(needle);
    if (Array.isArray(value)) return value.some(carriesGuidance);
    if (value && typeof value === "object") return Object.values(value).some(carriesGuidance);
    return false;
  };
  // A text block that is simply the serialised payload loses nothing when a
  // host swaps it for that payload — the watchlist tools are built that way,
  // and reading them as "guidance lost" was wrong.
  let textIsThePayload = false;
  if (structured) {
    try {
      textIsThePayload = JSON.stringify(JSON.parse(text)) === structuredJson;
    } catch {
      textIsThePayload = false;
    }
  }
  const guidanceSurvives = !structured || textIsThePayload || carriesGuidance(structured);
  for (const to of mentions(text, names, tool.name)) {
    edges.push({ from: tool.name, to, kind: "guidance-text", guidanceSurvives });
  }
  dangling.push(...danglingIn(text, names).map((token) => ({ where: `${tool.name} guidance`, token })));

  delivery.push({
    tool: tool.name,
    textChars: text.length,
    hasStructuredContent: Boolean(structured),
    // A tool whose steering lives only in a text block loses it on any host
    // that renders structuredContent instead.
    guidanceOnlyInTextBlock: Boolean(structured) && text.length > 0 && !guidanceSurvives,
    isError: Boolean(result.isError),
  });
}
await client.close();

const byKind = (k) => edges.filter((e) => e.kind === k);
const pointedAt = new Set(edges.map((e) => e.to));
const pointsFrom = new Set(edges.map((e) => e.from));
const isolated = names.filter((n) => !pointedAt.has(n) && !pointsFrom.has(n));
const orphanShow = names.filter((n) => n.startsWith("show_") && !pointedAt.has(n));
const lostGuidance = byKind("guidance-text").filter((e) => !e.guidanceSurvives);
const atRisk = delivery.filter((d) => d.guidanceOnlyInTextBlock);

say(`selection edges (descriptions): ${byKind("tool-description").length + byKind("arg-description").length}`);
say(`guidance edges (real tool results): ${byKind("guidance-text").length}`);
say(`  ... of which survive on a structuredContent-rendering host: ${byKind("guidance-text").length - lostGuidance.length}`);
say(`tools whose guidance text is dropped by such a host: ${atRisk.length}/${delivery.length}`);
say(`tools in no edge at all: ${isolated.length}${isolated.length ? ` (${isolated.join(", ")})` : ""}`);
say(`show_* tools nothing points to: ${orphanShow.length}${orphanShow.length ? ` (${orphanShow.join(", ")})` : ""}`);
// A `show_*` renders material the MODEL wrote and handed back, so its payload
// echoing arguments is not evidence it fetched and must not be read as lost.
const evidenceReallyLost = evidenceLost.filter((e) => !e.tool.startsWith("show_"));
say(
  `tools whose evidence a text-only host never sees: ${evidenceReallyLost.length}` +
    (evidenceReallyLost.length
      ? ` (${evidenceReallyLost.map((e) => `${e.tool}.${e.key}`).join(", ")})`
      : ""),
);
say(`dangling tool-shaped pointers: ${dangling.length}${dangling.length ? ` (${[...new Set(dangling.map((d) => d.token))].join(", ")})` : ""}`);
if (probeFailures.length) say(`tools that could not be probed: ${probeFailures.map((p) => p.tool).join(", ")}`);

if (!quiet) {
  say("\nguidance chains (from -> to), as the real server returns them:");
  for (const e of byKind("guidance-text").sort((a, b) => a.from.localeCompare(b.from))) {
    say(`  ${e.from} -> ${e.to}${e.guidanceSurvives ? "" : "   [lost on structuredContent hosts]"}`);
  }
}

const report = { toolCount: tools.length, edges, delivery, isolated, orphanShow, evidenceLost, dangling, probeFailures };
if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));
  say(`\nwrote ${jsonOut}`);
}
if (gate) {
  // Both of these shipped once: main added show_standings and show_trend with
  // no tool naming either, and mention_trend carried its guidance in a text
  // block a structuredContent host drops. Each was locally correct, each
  // passed every other check, and neither is visible in a single call.
  const failures = [];
  for (const e of lostGuidance) {
    failures.push(`${e.from} -> ${e.to}: guidance lives only in a content text block, which a host rendering structuredContent drops`);
  }
  for (const n of orphanShow) {
    failures.push(`${n}: no tool's guidance names it, so nothing will ever steer a host to it`);
  }
  for (const e of evidenceReallyLost) {
    failures.push(
      `${e.tool}: ${e.count} ${e.key} live only in structuredContent, so a host that renders the view leaves the model with a description of material it cannot read`,
    );
  }
  if (failures.length) {
    console.error(`\nchain-map --gate: ${failures.length} failure(s)`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  say("\nchain-map --gate: every guidance edge survives, every show_* view is named.");
}
process.exit(0);
