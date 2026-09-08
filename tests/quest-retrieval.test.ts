import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTranscript } from "../scripts/quest-lib/drivers/claude.mjs";

/**
 * #45's finding is about RETRIEVAL: with this many tools every one sits behind
 * a ToolSearch, so a `show_*` is callable only if a search returned it —
 * measured at 0/18 when none did and 14/18 when one did.
 *
 * The harness counted searches but never recorded what they returned, so the
 * number the issue asks to move was not computable from a run. These pin the
 * parsing that makes it computable, against a synthetic transcript in the
 * shape the CLI actually emits.
 */
function transcript(events: unknown[]): string {
  const dir = mkdtempSync(join(tmpdir(), "quest-"));
  const file = join(dir, "t.jsonl");
  writeFileSync(file, events.map((e) => JSON.stringify(e)).join("\n"));
  return file;
}

const search = (id: string, query: string) => ({
  type: "assistant",
  message: { content: [{ type: "tool_use", id, name: "ToolSearch", input: { query } }] },
});

const searchResult = (id: string, text: string) => ({
  type: "user",
  message: { content: [{ type: "tool_result", tool_use_id: id, content: text }] },
});

const call = (name: string) => ({
  type: "assistant",
  message: { content: [{ type: "tool_use", id: `c-${name}`, name: `mcp__nooticr__${name}`, input: {} }] },
});

describe("what a ToolSearch actually returned", () => {
  it("records the tools a search loaded, not just that one happened", () => {
    const file = transcript([
      search("s1", "select:analyze_post,show_analysis"),
      searchResult("s1", '<functions><function>{"name": "mcp__nooticr__analyze_post"}</function>' +
        '<function>{"name": "mcp__nooticr__show_analysis"}</function></functions>'),
      call("analyze_post"),
    ]);
    const parsed = parseTranscript(file, "nooticr");

    expect(parsed.toolSearches).toBe(1);
    expect(parsed.retrieved).toEqual(expect.arrayContaining(["analyze_post", "show_analysis"]));
    // The call list stays what it always was — host machinery is not a link in
    // the server's chain.
    expect(parsed.calls.map((c) => c.tool)).toEqual(["analyze_post"]);
  });

  it("distinguishes retrieved-and-not-called from never-retrieved", () => {
    // This is the entire cross-tab. A show_* that was loaded and skipped is a
    // guidance problem; one that was never loaded could not have been called
    // however well its description reads.
    const file = transcript([
      search("s1", "post analysis"),
      searchResult("s1", "mcp__nooticr__analyze_post"),
      call("analyze_post"),
    ]);
    const parsed = parseTranscript(file, "nooticr");
    expect(parsed.retrieved).toEqual(["analyze_post"]);
    expect(parsed.retrieved).not.toContain("show_analysis");
  });

  it("ties each result to the query that caused it", () => {
    // A run with several searches has to attribute each result correctly, or
    // "named in the FIRST query" — the strongest signal in the issue's data —
    // is measured against the wrong one.
    const file = transcript([
      search("s1", "repurpose"),
      search("s2", "show the repurposed post"),
      searchResult("s2", "mcp__nooticr__show_repurposed_post"),
      searchResult("s1", "mcp__nooticr__repurpose_post"),
    ]);
    const parsed = parseTranscript(file, "nooticr");
    expect(parsed.searches[0].query).toBe("repurpose");
    expect(parsed.searches[0].returned).toEqual(["repurpose_post"]);
    expect(parsed.searches[1].returned).toEqual(["show_repurposed_post"]);
  });

  it("reads a result delivered as content blocks, not only as a string", () => {
    const file = transcript([
      search("s1", "hooks"),
      {
        type: "user",
        message: {
          content: [
            { type: "tool_result", tool_use_id: "s1", content: [{ type: "text", text: "mcp__nooticr__write_hooks mcp__nooticr__show_hooks" }] },
          ],
        },
      },
    ]);
    expect(parseTranscript(file, "nooticr").retrieved).toEqual(["write_hooks", "show_hooks"]);
  });

  it("ignores tools belonging to another server", () => {
    const file = transcript([
      search("s1", "anything"),
      searchResult("s1", "mcp__github__create_issue mcp__nooticr__show_hooks"),
    ]);
    expect(parseTranscript(file, "nooticr").retrieved).toEqual(["show_hooks"]);
  });

  it("returns an empty list rather than throwing on an unrecognised result", () => {
    // The result is the host's rendering and its shape is not ours. A parser
    // that assumed one would return nothing when it changed — and "no tool was
    // ever retrieved" is exactly the finding being measured, so it would read
    // as a dramatic result rather than a broken parser. Scanning for the
    // qualified name degrades honestly instead.
    const file = transcript([
      search("s1", "anything"),
      searchResult("s1", "some future prose format with no tool names in it"),
    ]);
    const parsed = parseTranscript(file, "nooticr");
    expect(parsed.toolSearches).toBe(1);
    expect(parsed.retrieved).toEqual([]);
  });

  it("reads the tool_reference shape the CLI actually emits", () => {
    // Confirmed against real transcripts. A first version read only `.text`
    // and reported "retrieved 0/12" for tools that had plainly been called —
    // the exact false finding this file's last case warns about, arriving
    // through the one field that version did not read.
    const file = transcript([
      search("s1", "hooks"),
      {
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "s1",
              content: [
                { type: "tool_reference", tool_name: "mcp__nooticr__show_hooks" },
                { type: "tool_reference", tool_name: "mcp__nooticr__write_hooks" },
                { type: "tool_reference", tool_name: "EnterWorktree" },
              ],
            },
          ],
        },
      },
    ]);
    const parsed = parseTranscript(file, "nooticr");
    expect(parsed.retrieved).toEqual(["show_hooks", "write_hooks"]);
  });

  it("treats an empty search result as empty, not as an error", () => {
    // "No matching deferred tools found" is a real and common answer — it is
    // the never-retrieved half of the cross-tab, and it must count as zero
    // rather than as a parse failure.
    const file = transcript([
      search("s1", "something obscure"),
      searchResult("s1", "No matching deferred tools found"),
    ]);
    const parsed = parseTranscript(file, "nooticr");
    expect(parsed.toolSearches).toBe(1);
    expect(parsed.retrieved).toEqual([]);
  });
});
