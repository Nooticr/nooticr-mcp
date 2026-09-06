#!/usr/bin/env node
// Quests: does a real host, given a real user request, actually walk this
// server's tools from the question to the tool that finishes the job?
//
// Everything else in this repo's test surface checks one call at a time.
// tests/*.test.ts drive createMcpServer in-process; the host-contract and
// conformance steps drive the built server but only ask it about metadata;
// the mechanical smoke tiers make tool calls that a script chose. None of
// them can see the failure this exists for: the guidance a result carries
// says "when you are done, call show_analysis" and the host never does, so
// the analysis lands in chat, the view is never drawn, and every test stays
// green because every individual call worked.
//
// The backend is a fixture on purpose (scripts/fixture-server.mjs). What is
// under test is this repo — descriptions, guidance text, argument shapes —
// so the responses upstream of it should be boring, fixed, and free. A quest
// failing must mean the harness steered wrong, never that a scrape came back
// different today.
//
// Usage (scripts/run-quests.sh boots a backend and sets the env for you):
//   node scripts/run-quests.mjs [options]
//     --filter <substring>     only quests whose id contains this
//     --runs <n>               override every quest's run count
//     --host <coding|chat>     default host profile (per-quest `host` wins)
//     --model <id>             model the driving host runs
//     --concurrency <n>        quests in flight at once (default 3)
//     --gate                   exit non-zero when a quest is below threshold
//     --emit-mcpjam <file>     write the corpus as an MCPJam v1 eval suite
//     --out <dir>              where the report and transcripts land
import fs from "node:fs";
import path from "node:path";
import { judgeQuest, observedGraph } from "./quest-lib/assert.mjs";
import { runQuest, claudeAvailable } from "./quest-lib/drivers/claude.mjs";
import { toMcpjamSuite } from "./quest-lib/mcpjam-suite.mjs";
import { REPO_ROOT, CLI_ENTRY } from "./quest-lib/mcp-client.mjs";
import { STUB_URL } from "./quest-lib/probe-args.mjs";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);

const outDir = path.resolve(flag("out", path.join(REPO_ROOT, "quests", "report")));
const corpus = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "quests", "quests.json"), "utf8"));
const substitute = (s) => s.replaceAll("{STUB}", STUB_URL);
let quests = corpus.quests.map((q) => ({ ...q, prompt: substitute(q.prompt) }));

const filter = flag("filter", null);
if (filter) quests = quests.filter((q) => q.id.includes(filter));
const runsOverride = flag("runs", null);
if (runsOverride) quests = quests.map((q) => ({ ...q, runs: Number(runsOverride) }));

if (has("emit-mcpjam")) {
  const file = flag("emit-mcpjam", path.join(outDir, "mcpjam-suite.json"));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(toMcpjamSuite(quests), null, 2));
  console.log(`wrote ${file} (MCPJam Cloud eval suite, schemaVersion 1)`);
  if (!has("gate") && !has("run")) process.exit(0);
}

if (!claudeAvailable()) {
  console.error("quests: no `claude` on PATH. The driver is the Claude Code CLI — see");
  console.error("        docs/testing/tool-chaining-quests.md for why the host under test is a real host.");
  process.exit(2);
}
if (!fs.existsSync(CLI_ENTRY)) {
  console.error(`quests: ${CLI_ENTRY} is missing — run \`npm run build\` first.`);
  process.exit(2);
}
if (!process.env.NOOTICR_BASE_URL) {
  console.error("quests: NOOTICR_BASE_URL is unset. Use scripts/run-quests.sh, which boots a backend first.");
  process.exit(2);
}

const artifactDir = path.join(outDir, "transcripts");
fs.mkdirSync(artifactDir, { recursive: true });

// The host is launched from a scratch cwd, so this has to be absolute or the
// server never starts and every quest fails identically for the wrong reason.
const mcpConfigPath = path.join(outDir, "mcp-config.generated.json");
fs.writeFileSync(
  mcpConfigPath,
  JSON.stringify({
    mcpServers: {
      nooticr: {
        command: process.execPath,
        args: [CLI_ENTRY],
        env: {
          NOOTICR_BASE_URL: process.env.NOOTICR_BASE_URL,
          NOOTICR_ACCESS_TOKEN: process.env.NOOTICR_ACCESS_TOKEN ?? "",
          NOOTICR_TRANSPORT: "stdio",
        },
      },
    },
  }, null, 2)
);

const ctx = {
  serverName: "nooticr",
  mcpConfigPath,
  artifactDir,
  claudeBin: process.env.QUEST_CLAUDE_BIN ?? "claude",
  model: flag("model", process.env.QUEST_MODEL ?? "claude-sonnet-5"),
  host: flag("host", "coding"),
  maxTurns: Number(flag("max-turns", 14)),
  timeoutMs: Number(flag("timeout-ms", 300000)),
};

const totalRuns = quests.reduce((n, q) => n + (q.runs ?? 1), 0);
console.log(`quests: ${quests.length} quests, ${totalRuns} runs, driver=claude(${ctx.model}), backend=${process.env.NOOTICR_BASE_URL}`);
console.log(`        every run is a real model call — see docs/testing/tool-chaining-quests.md on cost.\n`);

/** Run at most `limit` jobs at once; a driver failure is a failed run, not a dead suite. */
async function pool(jobs, limit) {
  const results = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (next < jobs.length) {
      const i = next++;
      try { results[i] = await jobs[i](); }
      catch (err) { results[i] = { calls: [], error: String(err?.message ?? err) }; }
    }
  }));
  return results;
}

const concurrency = Number(flag("concurrency", 3));
const jobs = [];
for (const quest of quests) {
  for (let runIndex = 1; runIndex <= (quest.runs ?? 1); runIndex += 1) {
    jobs.push(async () => ({ quest, runIndex, ...(await runQuest(quest, { ...ctx, runIndex })) }));
  }
}
const started = Date.now();
const runResults = await pool(jobs, concurrency);
const elapsedMs = Date.now() - started;

const verdicts = [];
for (const quest of quests) {
  const mine = runResults.filter((r) => r?.quest?.id === quest.id);
  const verdict = judgeQuest(quest, mine.map((r) => r.calls ?? []));
  verdict.why = quest.why;
  verdict.prompt = quest.prompt;
  verdict.hostProfile = quest.host ?? ctx.host;
  verdict.toolSearches = mine.map((r) => r.toolSearches ?? 0);
  verdict.driverErrors = mine.filter((r) => r.error || r.apiError).map((r) => r.error ?? r.apiError);
  verdict.transcripts = mine.map((r) => r.transcript).filter(Boolean);
  verdicts.push(verdict);
}

const width = Math.max(...verdicts.map((v) => v.id.length));
for (const v of verdicts) {
  const mark = v.ok ? "PASS" : v.passed > 0 ? "FLAKY" : "FAIL";
  console.log(`${mark.padEnd(5)} ${v.id.padEnd(width)}  ${v.passed}/${v.runs}`);
  if (!v.ok) {
    for (const chain of v.chains) console.log(`        chain: ${chain.join(" -> ") || "(no tool calls)"}`);
    const seen = new Set();
    for (const f of v.failures) {
      if (seen.has(f.detail)) continue;
      seen.add(f.detail);
      console.log(`        ${f.kind}: ${f.detail}`);
    }
    if (v.driverErrors.length) console.log(`        driver: ${v.driverErrors.join("; ")}`);
  }
}

const graph = observedGraph(runResults.map((r) => r?.calls ?? []));
console.log("\nedges a real host actually walked (count):");
for (const { edge, count } of graph.slice(0, 25)) console.log(`  ${String(count).padStart(3)}  ${edge}`);

const failed = verdicts.filter((v) => !v.ok);
console.log(`\n${verdicts.length - failed.length}/${verdicts.length} quests at or above threshold, ${Math.round(elapsedMs / 1000)}s`);

const report = {
  generatedFrom: { model: ctx.model, host: ctx.host, backend: process.env.NOOTICR_BASE_URL, elapsedMs },
  quests: verdicts,
  observedGraph: graph,
};
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "latest.json"), JSON.stringify(report, null, 2));
console.log(`report: ${path.join(outDir, "latest.json")}`);

// A quest suite is a measurement first. Reporting a number every time and
// failing the build only when asked is what keeps it worth reading — an
// LLM-driven gate that goes red on its own noise gets muted within a week.
process.exit(has("gate") && failed.length ? 1 : 0);
