// Driver: the Claude Code CLI as the host under test.
//
// Why this one and not only MCPJam: MCPJam drives its own agent loop against
// the raw Anthropic API, which is a fine model of a generic host but is not
// any host a user actually runs. `claude -p` IS one — the same binary, the
// same system prompt, the same tool-deferral behaviour a person gets when
// they add this server to Claude Code. That last part matters more than it
// sounds: this server publishes 64 tools, which is past the point where
// Claude Code stops putting them all in context and puts them behind a
// ToolSearch instead, so a real chain here starts with the model having to
// FIND the tool by name before it can call it. No in-process client
// reproduces that, and it is exactly the condition under which a guidance
// sentence naming the next tool earns its keep.
//
// Two host profiles, because they are different hosts in the way that
// matters: `coding` keeps Claude Code's own system prompt (a coding agent
// that treats tool output warily), `chat` replaces it with a plain assistant
// prompt (--system-prompt) to stand in for a consumer chat host. A chain
// that only holds under one of them is a real finding, not noise.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHAT_SYSTEM_PROMPT =
  "You are a helpful assistant with access to tools for social-media research and content work. " +
  "Use the tools available to you to answer the user as fully as you can.";

/** Tools of the HOST, never of the server under test — never part of a chain. */
const HOST_TOOLS_OFF = [
  "Bash", "Read", "Write", "Edit", "NotebookEdit", "WebFetch", "WebSearch",
  "Glob", "Grep", "Task", "TodoWrite", "KillShell", "BashOutput",
];

export function claudeAvailable() {
  return Boolean(process.env.QUEST_CLAUDE_BIN || which("claude"));
}

function which(bin) {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    const p = path.join(dir, bin);
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { /* keep looking */ }
  }
  return null;
}

/**
 * A cwd with nothing in it.
 *
 * Claude Code reads a CLAUDE.md from its working directory into context. Run
 * a quest from the repo root and the driving model is handed this repo's own
 * instructions about how its tools are meant to chain — which would make
 * every quest pass for a reason that has nothing to do with the server.
 */
function scratchCwd() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "nooticr-quest-"));
}

export async function runQuest(quest, ctx) {
  const cwd = scratchCwd();
  const transcript = path.join(ctx.artifactDir, `${quest.id}.${ctx.runIndex}.jsonl`);
  const profile = quest.host ?? ctx.host ?? "coding";
  const args = [
    "-p", quest.prompt,
    "--mcp-config", ctx.mcpConfigPath,
    "--strict-mcp-config",
    "--allowedTools", `mcp__${ctx.serverName}`,
    "--disallowedTools", HOST_TOOLS_OFF.join(","),
    "--model", quest.model ?? ctx.model,
    "--max-turns", String(quest.maxTurns ?? ctx.maxTurns),
    "--output-format", "stream-json",
    "--verbose",
    "--disable-slash-commands",
  ];
  if (profile === "chat") args.push("--system-prompt", CHAT_SYSTEM_PROMPT);

  const out = fs.createWriteStream(transcript);
  const proc = spawn(ctx.claudeBin, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  proc.stdout.pipe(out);
  let stderr = "";
  proc.stderr.on("data", (d) => { stderr += d.toString(); });

  const timer = setTimeout(() => proc.kill("SIGKILL"), (quest.timeoutMs ?? ctx.timeoutMs));
  const code = await new Promise((resolve) => proc.on("close", resolve));
  clearTimeout(timer);
  await new Promise((r) => out.end(r));

  const parsed = parseTranscript(transcript, ctx.serverName);
  fs.rmSync(cwd, { recursive: true, force: true });
  return { ...parsed, exitCode: code, transcript, profile, stderr: stderr.slice(-2000) };
}

/**
 * The ordered tool calls, read out of the stream-json transcript.
 *
 * Deliberately narrowed to `mcp__<server>__*`: a ToolSearch the host issues
 * to load a deferred tool is host machinery, not a link in the server's
 * chain, and counting it would make every chain assertion off by one. It is
 * still reported separately, because whether the model had to search for the
 * next tool at all is part of what a quest is measuring.
 */
export function parseTranscript(file, serverName) {
  const calls = [];
  let toolSearches = 0;
  let finalText = "";
  let apiError = null;
  // What each ToolSearch asked for and what came back.
  //
  // The count alone cannot answer the question #45 is about. With this many
  // tools every one sits behind a ToolSearch, so a `show_*` is callable only
  // if a search RETURNED it — measured at 0/18 when none did and 14/18 when
  // one did. "How many searches happened" does not distinguish those two, and
  // that distinction is the whole finding.
  //
  // The queries come off the assistant's `tool_use` blocks; the names come off
  // the matching `tool_result`, where the host lists the tools it loaded. Tied
  // together by `tool_use_id` so a run with several searches attributes each
  // result to the query that caused it.
  const searches = [];
  const byId = new Map();
  const prefix = `mcp__${serverName}__`;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === "assistant") {
      for (const block of ev.message?.content ?? []) {
        if (block.type !== "tool_use") continue;
        if (block.name === "ToolSearch") {
          toolSearches += 1;
          const search = { query: String(block.input?.query ?? ""), returned: [] };
          searches.push(search);
          byId.set(block.id, search);
        } else if (block.name.startsWith(prefix)) {
          calls.push({ tool: block.name.slice(prefix.length), args: block.input ?? {} });
        }
      }
    }
    // A tool_result arrives on a `user` event, which is why this is not nested
    // in the branch above.
    if (ev.type === "user") {
      for (const block of ev.message?.content ?? []) {
        if (block.type !== "tool_result") continue;
        const search = byId.get(block.tool_use_id);
        if (!search) continue;
        search.returned.push(...toolNamesIn(block.content, prefix));
      }
    }
    if (ev.type === "result") {
      finalText = typeof ev.result === "string" ? ev.result : "";
      if (ev.is_error || ev.subtype !== "success") apiError = ev.subtype ?? "error";
    }
  }
  const retrieved = [...new Set(searches.flatMap((s) => s.returned))];
  return { calls, toolSearches, searches, retrieved, finalText, apiError };
}

/**
 * The server's tool names mentioned in a ToolSearch result.
 *
 * The result is the host's own rendering, and its shape is not ours to
 * control — it has been a `<functions>` block of JSON definitions, and it may
 * be prose tomorrow. So this scans for the one thing that is stable and
 * unambiguous: the fully-qualified `mcp__<server>__<tool>` names, which appear
 * in every rendering because that is what the model must type to call one.
 *
 * Scanning rather than parsing on purpose. A parser that assumes a shape
 * silently returns nothing when the shape changes, and "no tool was ever
 * retrieved" is exactly the finding this is measuring — so it would read as a
 * dramatic result rather than as a broken parser.
 */
function toolNamesIn(content, prefix) {
  const text = typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content
          .map((c) => {
            if (typeof c === "string") return c;
            // The shape the CLI actually emits, confirmed against real
            // transcripts: `{ type: "tool_reference", tool_name: "mcp__x__y" }`.
            // Reading only `.text` here is what made a first version report
            // "retrieved 0/12" for tools that had plainly been called — which
            // is precisely the dramatic-looking result the scan below exists
            // to avoid, arriving through the one field it did not read.
            return c?.tool_name ?? c?.text ?? "";
          })
          .join("\n")
      : "";
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...text.matchAll(new RegExp(`${escaped}([a-z0-9_]+)`, "g"))].map((m) => m[1]);
}
