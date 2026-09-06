// Export the quest corpus as an MCPJam Cloud eval suite.
//
// Why an exporter and not a driver: `@mcpjam/cli` no longer has the local
// `evals run` command scripts/run-agentic-evals.sh calls. At 5.6.0 the
// command is gone (`mcpjam evals` → "unknown command 'evals'"), evals live
// under `mcpjam cloud eval`, they are account-bound and paid, and a suite's
// target servers are references to servers registered in an MCPJam Cloud
// project — `{name, id?}`, with no command/args/env — so a local stdio
// `node dist/index.js` cannot be a target at all without exposing it over
// HTTP first. Running a quest locally is therefore this repo's job, and the
// useful thing MCPJam can still do is run the SAME corpus against the same
// server on hosts we cannot drive from here (ChatGPT, Cursor, Codex).
//
// Shape below follows the v1 suite schema
// (https://mcpjam.com/schemas/eval-suite/v1.json): objects are closed, so an
// extra key fails validation rather than being ignored — check a change with
// `mcpjam cloud eval validate --file <out>` before assuming it is accepted.
// Ordering is deliberately NOT expressed here: the file-level vocabulary has
// only `firstToolWas`, and ordered matching is a run-level flag
// (`--match-options '{"toolCallOrder":"in-order"}'`), which is why the
// comment on each exported case says so.

export function toMcpjamSuite(quests, { serverName = "nooticr", model = "claude-sonnet-5" } = {}) {
  return {
    schemaVersion: "1",
    mode: "agentWorkflow",
    reportingMode: "standard",
    suite: {
      id: "nooticr-quests",
      name: "nooticr tool-chaining quests",
      description:
        "Generated from quests/quests.json by scripts/run-quests.mjs --emit-mcpjam. " +
        "Run with --match-options '{\"toolCallOrder\":\"in-order\"}' — the file schema " +
        "cannot express chain order, only firstToolWas.",
    },
    target: { servers: [{ name: serverName }] },
    defaults: {
      model,
      repetitions: 3,
      passThreshold: 1,
      validity: { minCompletionRate: 0.8 },
    },
    cases: quests.map((quest) => ({
      id: quest.id.replaceAll("-", "_"),
      title: quest.title,
      intent: quest.why,
      steps: [{ id: "ask", kind: "prompt", prompt: quest.prompt }],
      repetitions: quest.runs ?? 3,
      assertions: assertionsFor(quest),
    })),
  };
}

function assertionsFor(quest) {
  const expect = quest.expect ?? {};
  const out = [];
  const chain = expect.chainExact ?? expect.chain ?? [];
  if (chain.length) out.push({ type: "firstToolWas", toolName: chain[0] });
  for (const tool of chain) out.push({ type: "toolCalledAtLeastOnce", toolName: tool });
  for (const tool of expect.forbid ?? []) out.push({ type: "toolNeverCalled", toolName: tool });
  for (const [toolName, spec] of Object.entries(expect.args ?? {})) {
    const args = Object.fromEntries(
      Object.entries(spec).filter(([, v]) => typeof v !== "object" || v === null)
    );
    if (Object.keys(args).length) {
      out.push({ type: "toolCalledWith", toolName, args: { args, argumentMatching: "partial" } });
    }
  }
  if (expect.maxCalls != null) out.push({ type: "turnCountUnder", turns: expect.maxCalls + 2 });
  out.push({ type: "noToolErrors" });
  return out.slice(0, 50);
}
