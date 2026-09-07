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
//   3. DELIVERY — for each tool, WHERE that guidance lives in the result:
//      a `content` text block, `structuredContent`, or both. This is the
//      pass that matters most and the one nobody would think to write:
//      hosts that render structuredContent (Claude Code among them) replace
//      the content text blocks with the serialised structuredContent, so
//      guidance that lives only in a text block never reaches the model.
//      See docs/testing/tool-chaining-quests.md for the measurement.
//
// Usage (needs a backend booted and NOOTICR_BASE_URL/NOOTICR_ACCESS_TOKEN
// exported — scripts/run-quests.sh does that for you):
//   node scripts/chain-map.mjs [--json out.json] [--quiet]
import fs from "node:fs";
import { connectBuiltServer, resultText } from "./quest-lib/mcp-client.mjs";
import { argsFor } from "./quest-lib/probe-args.mjs";

const argv = process.argv.slice(2);
const jsonOut = argv.includes("--json") ? argv[argv.indexOf("--json") + 1] : null;
const quiet = argv.includes("--quiet");
const say = (...a) => { if (!quiet) console.log(...a); };

/**
 * A tool name inside prose, not inside a longer identifier. `show_analysis`
 * must not match inside `show_analysis_v2`, and a bare mention in a sentence
 * ("call show_analysis with the url") must match with or without backticks.
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
  const guidanceSurvives = !structured || structuredJson.includes(text.slice(0, 60));
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
say(`dangling tool-shaped pointers: ${dangling.length}${dangling.length ? ` (${[...new Set(dangling.map((d) => d.token))].join(", ")})` : ""}`);
if (probeFailures.length) say(`tools that could not be probed: ${probeFailures.map((p) => p.tool).join(", ")}`);

if (!quiet) {
  say("\nguidance chains (from -> to), as the real server returns them:");
  for (const e of byKind("guidance-text").sort((a, b) => a.from.localeCompare(b.from))) {
    say(`  ${e.from} -> ${e.to}${e.guidanceSurvives ? "" : "   [lost on structuredContent hosts]"}`);
  }
}

const report = { toolCount: tools.length, edges, delivery, isolated, orphanShow, dangling, probeFailures };
if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));
  say(`\nwrote ${jsonOut}`);
}
process.exit(0);
