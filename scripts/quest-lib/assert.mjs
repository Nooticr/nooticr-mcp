// The verdict half of a quest, kept pure and free of any model, process or
// network so tests/quests.test.ts can cover it outright.
//
// Everything here operates on one flat list: the tool calls a host actually
// made, in order, with the arguments it sent. That is the only observation a
// quest makes, and keeping the assertions over it total (no I/O, no clock)
// is what lets the expensive, non-deterministic half be re-run without
// re-deriving what "passed" means.

/**
 * Ordered subsequence, not equality: a host that fetches credits first, or
 * re-reads a post it already has, has still followed the chain. Requiring an
 * exact sequence would fail on behaviour nobody would call a bug, and the
 * quests that genuinely care use `chainExact`.
 */
export function isSubsequence(expected, actual) {
  let i = 0;
  for (const call of actual) {
    if (call === expected[i]) i += 1;
    if (i === expected.length) return true;
  }
  return expected.length === 0;
}

/** Where an ordered chain stopped being satisfied — the useful half of a failure. */
export function firstMissingLink(expected, actual) {
  let i = 0;
  for (const call of actual) {
    if (call === expected[i]) i += 1;
    if (i === expected.length) return null;
  }
  return { index: i, tool: expected[i], reached: expected.slice(0, i) };
}

function argMatches(spec, value) {
  if (spec === null) return value === null;
  if (typeof spec !== "object") return value === spec;
  if ("present" in spec) return spec.present ? value !== undefined : value === undefined;
  if ("contains" in spec) return typeof value === "string" && value.includes(spec.contains);
  if ("equals" in spec) return JSON.stringify(value) === JSON.stringify(spec.equals);
  if ("minLength" in spec) return (value?.length ?? -1) >= spec.minLength;
  if ("oneOf" in spec) return spec.oneOf.some((v) => JSON.stringify(v) === JSON.stringify(value));
  return JSON.stringify(spec) === JSON.stringify(value);
}

/**
 * Judge one run.
 *
 * `calls` is [{ tool, args }] in the order the host issued them, already
 * narrowed to the server under test — a host's own tools (a ToolSearch, a
 * file read) are not part of the chain and are dropped before this sees them.
 */
export function judgeRun(quest, calls) {
  const seq = calls.map((c) => c.tool);
  const failures = [];
  const expect = quest.expect ?? {};

  if (expect.chain) {
    const miss = firstMissingLink(expect.chain, seq);
    if (miss) {
      failures.push({
        kind: "chain-broken",
        detail: miss.reached.length
          ? `reached ${miss.reached.join(" -> ")} then never called ${miss.tool}`
          : `never called ${miss.tool}`,
      });
    }
  }

  if (expect.chainExact && JSON.stringify(expect.chainExact) !== JSON.stringify(seq)) {
    failures.push({ kind: "chain-not-exact", detail: `wanted exactly ${expect.chainExact.join(" -> ")}, got ${seq.join(" -> ") || "(nothing)"}` });
  }

  for (const forbidden of expect.forbid ?? []) {
    if (seq.includes(forbidden)) failures.push({ kind: "forbidden-call", detail: `called ${forbidden}` });
  }

  for (const [tool, argSpec] of Object.entries(expect.args ?? {})) {
    const call = calls.find((c) => c.tool === tool);
    if (!call) {
      // A chain assertion already reports the missing call; saying it twice
      // makes a one-cause failure read as two.
      if (!expect.chain?.includes(tool)) failures.push({ kind: "args-unchecked", detail: `${tool} was never called, so its arguments could not be checked` });
      continue;
    }
    for (const [key, spec] of Object.entries(argSpec)) {
      if (!argMatches(spec, call.args?.[key])) {
        failures.push({ kind: "wrong-arg", detail: `${tool}.${key} was ${JSON.stringify(call.args?.[key])}, wanted ${JSON.stringify(spec)}` });
      }
    }
  }

  // The negative half of an argument assertion, and the one the platform
  // default needs: handleMissGuidance's whole point is that an empty result
  // on X must NOT become a second call on tiktok, and a host that does that
  // still satisfies every positive assertion about the first call.
  for (const [tool, argSpec] of Object.entries(expect.neverArgs ?? {})) {
    for (const call of calls.filter((c) => c.tool === tool)) {
      for (const [key, spec] of Object.entries(argSpec)) {
        if (argMatches(spec, call.args?.[key])) {
          failures.push({ kind: "forbidden-arg", detail: `${tool} was called with ${key}=${JSON.stringify(call.args?.[key])}` });
        }
      }
    }
  }

  if (expect.maxCalls != null && seq.length > expect.maxCalls) {
    failures.push({ kind: "too-many-calls", detail: `${seq.length} calls, budget was ${expect.maxCalls}` });
  }

  return { ok: failures.length === 0, failures, chain: seq };
}

/**
 * Roll several runs of one quest into a verdict.
 *
 * A quest is a measurement before it is a gate: `passRate` is the number that
 * carries meaning, because whether a host follows a chain is a probability,
 * not a fact. `threshold` (default 1) is what turns it back into a gate for
 * the runs where that is wanted — see docs/testing/tool-chaining-quests.md on
 * why a flaky gate is worse than no gate.
 */
export function judgeQuest(quest, runs) {
  const verdicts = runs.map((calls) => judgeRun(quest, calls));
  const passed = verdicts.filter((v) => v.ok).length;
  const passRate = verdicts.length ? passed / verdicts.length : 0;
  const threshold = quest.threshold ?? 1;
  // A quest that produced no runs at all is not a failing chain, and saying
  // so matters: without this it prints as a red line with nothing under it.
  const noRuns = verdicts.length === 0
    ? [{ run: 0, kind: "no-runs", detail: "the driver produced no runs for this quest" }]
    : [];
  return {
    id: quest.id,
    title: quest.title,
    runs: verdicts.length,
    passed,
    passRate,
    threshold,
    ok: passRate >= threshold,
    chains: verdicts.map((v) => v.chain),
    failures: [...noRuns, ...verdicts.flatMap((v, i) => v.failures.map((f) => ({ run: i + 1, ...f })))],
  };
}

/** Every distinct transition observed, counted — the map a run actually drew. */
export function observedGraph(allRuns) {
  const counts = new Map();
  for (const calls of allRuns) {
    const seq = calls.map((c) => c.tool);
    for (let i = 0; i < seq.length - 1; i += 1) {
      const key = `${seq[i]} -> ${seq[i + 1]}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([edge, count]) => ({ edge, count }));
}
