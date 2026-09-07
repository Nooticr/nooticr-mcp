/**
 * The half of a quest that does not need a model.
 *
 * A quest run costs a real model call and is non-deterministic by nature, so
 * the parts that CAN be pinned down have to be, or the only way to find out
 * that a quest was malformed is to spend on it and watch it fail for the
 * wrong reason. Two things are checked here:
 *
 *  1. The verdict logic (scripts/quest-lib/assert.mjs) — pure functions over
 *     a list of tool calls, so they are ordinary unit tests.
 *  2. The corpus itself (quests/quests.json) — every tool a quest expects
 *     has to be a tool this server actually publishes. A quest naming a tool
 *     that was renamed can never pass, and without this it would read as a
 *     broken chain rather than as a broken test.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import type { NooticrClient } from "../src/shared/nooticr.js";
// @ts-expect-error - plain ESM helpers, deliberately not TypeScript: they run
// from scripts/ under bare node with no build step in front of them.
import { judgeRun, judgeQuest, isSubsequence, firstMissingLink, observedGraph } from "../scripts/quest-lib/assert.mjs";
// @ts-expect-error - see above.
import { toMcpjamSuite } from "../scripts/quest-lib/mcpjam-suite.mjs";
// @ts-expect-error - see above.
import { parseTranscript } from "../scripts/quest-lib/drivers/claude.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpus = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "quests", "quests.json"), "utf8"));
const call = (tool: string, args: Record<string, unknown> = {}) => ({ tool, args });

describe("chain assertions", () => {
  it("accepts a chain with unrelated calls interleaved", () => {
    // A host that checks its credit balance on the way has still followed the
    // chain. Requiring an exact sequence would fail on behaviour nobody would
    // call a bug.
    expect(isSubsequence(["analyze_post", "show_analysis"], ["check_nooticr_credits", "analyze_post", "get_post_comments", "show_analysis"])).toBe(true);
  });

  it("rejects a chain walked backwards", () => {
    expect(isSubsequence(["analyze_post", "show_analysis"], ["show_analysis", "analyze_post"])).toBe(false);
  });

  it("names where a chain stopped, not just that it did", () => {
    const miss = firstMissingLink(["analyze_post", "show_analysis"], ["analyze_post"]);
    expect(miss).toMatchObject({ tool: "show_analysis", reached: ["analyze_post"] });
  });

  it("reports the exact break for the failure this suite exists for", () => {
    const verdict = judgeRun(
      { id: "x", expect: { chain: ["analyze_post", "show_analysis"] } },
      [call("analyze_post", { url: "u" })]
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.failures[0]).toMatchObject({ kind: "chain-broken" });
    expect(verdict.failures[0].detail).toContain("never called show_analysis");
  });

  it("does not report a missing call twice when args were also expected", () => {
    // One cause, one failure: an args expectation on a tool that was never
    // called is already covered by the chain assertion.
    const verdict = judgeRun(
      { id: "x", expect: { chain: ["get_user_posts"], args: { get_user_posts: { platform: "linkedin" } } } },
      []
    );
    expect(verdict.failures).toHaveLength(1);
  });

  it("catches the wrong platform, which is the silent-default bug", () => {
    const verdict = judgeRun(
      { id: "x", expect: { chain: ["get_user_posts"], args: { get_user_posts: { platform: "linkedin" } } } },
      [call("get_user_posts", { username: "someone" })]
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.failures[0]).toMatchObject({ kind: "wrong-arg" });
  });

  it("catches a retry that quietly switches network", () => {
    const verdict = judgeRun(
      { id: "x", expect: { neverArgs: { get_user_posts: { platform: "tiktok" } } } },
      [call("get_user_posts", { platform: "twitter" }), call("get_user_posts", { platform: "tiktok" })]
    );
    expect(verdict.failures[0]).toMatchObject({ kind: "forbidden-arg" });
  });

  it("can require calls without pinning their order", () => {
    // "Track this creator and keep an eye on them" is satisfied either way
    // round. A chain assertion would fail one of them for a difference the
    // user cannot perceive.
    const quest = { id: "x", expect: { includes: ["track_competitor", "watch_creator"] } };
    expect(judgeRun(quest, [call("watch_creator"), call("track_competitor")]).ok).toBe(true);
    expect(judgeRun(quest, [call("track_competitor"), call("watch_creator")]).ok).toBe(true);
    const missed = judgeRun(quest, [call("analyze_creator_profile"), call("watch_creator")]);
    expect(missed.ok).toBe(false);
    expect(missed.failures[0]).toMatchObject({ kind: "missing-call" });
  });

  it("supports the argument matchers a quest actually uses", () => {
    const verdict = judgeRun(
      { id: "x", expect: { args: { show_analysis: { url: { contains: "e2e-stub" }, analysis: { present: true } } } } },
      [call("show_analysis", { url: "https://e2e.nooticr.test/import/tiktok/e2e-stub", analysis: {} })]
    );
    expect(verdict.ok).toBe(true);
  });

  it("scores a quest by pass rate, not by its worst run", () => {
    const quest = { id: "x", title: "t", threshold: 0.5, expect: { chain: ["a", "b"] } };
    const verdict = judgeQuest(quest, [[call("a"), call("b")], [call("a")]]);
    expect(verdict.passRate).toBe(0.5);
    expect(verdict.ok).toBe(true);
  });

  it("counts every transition a run walked", () => {
    expect(observedGraph([[call("a"), call("b")], [call("a"), call("b"), call("c")]])).toEqual([
      { edge: "a -> b", count: 2 },
      { edge: "b -> c", count: 1 },
    ]);
  });
});

describe("the Claude Code transcript parser", () => {
  it("reads tool calls in order and leaves the host's own tools out of the chain", () => {
    // A ToolSearch is how Claude Code loads a deferred tool — host machinery,
    // not a link in this server's chain. Counting it would put every chain
    // assertion off by one.
    const file = path.join(REPO_ROOT, "quests", "report", "parser-fixture.jsonl");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, [
      JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "ToolSearch", input: {} }] } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "mcp__nooticr__analyze_post", input: { url: "u" } }] } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: {} }] } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "mcp__nooticr__show_analysis", input: { url: "u", analysis: {} } }] } }),
      JSON.stringify({ type: "result", subtype: "success", result: "done" }),
    ].join("\n"));
    const parsed = parseTranscript(file, "nooticr");
    expect(parsed.calls.map((c: { tool: string }) => c.tool)).toEqual(["analyze_post", "show_analysis"]);
    expect(parsed.toolSearches).toBe(1);
    expect(parsed.apiError).toBeNull();
    fs.rmSync(file);
  });
});

describe("the quest corpus", () => {
  const quests = corpus.quests as Array<Record<string, any>>;

  it("has a unique id, a title and a stated reason per quest", () => {
    const ids = quests.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const quest of quests) {
      expect(quest.title, quest.id).toBeTruthy();
      expect(quest.prompt, quest.id).toBeTruthy();
      // `why` is what makes a red quest actionable a year from now: which
      // edge broke, and what the user loses when it does.
      expect(quest.why?.length ?? 0, quest.id).toBeGreaterThan(40);
    }
  });

  it("only expects tools this server actually publishes", async () => {
    const client = new Client({ name: "quest-corpus", version: "1.0.0" });
    const server = createMcpServer(async () => ({ callTool: async () => ({ contentBlocks: [], structured: {} }) } as unknown as NooticrClient));
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientSide), server.connect(serverSide)]);
    const published = new Set((await client.listTools()).tools.map((t) => t.name));

    for (const quest of quests) {
      const named = [
        ...(quest.expect?.chain ?? []),
        ...(quest.expect?.chainExact ?? []),
        ...(quest.expect?.includes ?? []),
        ...(quest.expect?.forbid ?? []),
        ...Object.keys(quest.expect?.args ?? {}),
        ...Object.keys(quest.expect?.neverArgs ?? {}),
      ];
      expect(named.length, `${quest.id} asserts nothing`).toBeGreaterThan(0);
      for (const tool of named) {
        expect(published.has(tool), `${quest.id} expects "${tool}", which this server does not publish`).toBe(true);
      }
    }
  });

  it("exports every quest as a valid-shaped MCPJam case", () => {
    // Not a substitute for `mcpjam cloud eval validate` (the real schema is
    // closed and lives upstream), but it catches the two ways this exporter
    // has to stay right: an id the schema's pattern rejects, and an
    // assertion list past the 50-item cap.
    const suite = toMcpjamSuite(quests);
    expect(suite.cases).toHaveLength(quests.length);
    for (const kase of suite.cases) {
      expect(kase.id).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(kase.assertions.length).toBeLessThanOrEqual(50);
      expect(kase.steps[0].kind).toBe("prompt");
    }
  });
});
