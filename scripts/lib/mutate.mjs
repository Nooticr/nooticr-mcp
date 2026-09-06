/**
 * Apply a mutation, run a command, put the file back.
 *
 * Shared by the mutation guard and the invariant verifier because both ask the
 * same question — does anything actually fail when this is broken? — and the
 * dangerous part is identical: a mutation left behind is a corrupted checkout.
 * Restoration goes through try/finally and a process-exit hook, so a crash or a
 * Ctrl-C mid-run cannot leave the tree dirty.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

/** Files currently mutated, so an abnormal exit can still undo them. */
const inFlight = new Map();

function restoreAll() {
  for (const [file, original] of inFlight) {
    try {
      writeFileSync(file, original);
    } catch {
      // Nothing useful to do here; the message below is the fallback.
      console.error(`[mutate] COULD NOT RESTORE ${file} — check git status`);
    }
  }
  inFlight.clear();
}
for (const sig of ["exit", "SIGINT", "SIGTERM", "uncaughtException"]) {
  process.on(sig, restoreAll);
}

/**
 * Run `fn` with `find` replaced by `replace` in `file`.
 *
 * Throws if the anchor is missing or ambiguous rather than silently mutating
 * nothing — a mutation that did not apply would look exactly like a test suite
 * that caught it, which is the one failure mode that makes this whole exercise
 * lie to you.
 */
export function withMutation({ file, find, replace }, fn) {
  const original = readFileSync(file, "utf8");
  const hits = original.split(find).length - 1;
  if (hits === 0) throw new Error(`anchor not found in ${file}: ${find.slice(0, 60)}`);
  if (hits > 1) throw new Error(`anchor is ambiguous (${hits}x) in ${file}: ${find.slice(0, 60)}`);

  inFlight.set(file, original);
  try {
    writeFileSync(file, original.replace(find, replace));
    return fn();
  } finally {
    writeFileSync(file, original);
    inFlight.delete(file);
  }
}

/** True when the command fails — which, under mutation, is the good outcome. */
export function commandFails(cmd, opts = {}) {
  try {
    execSync(cmd, { stdio: "pipe", timeout: opts.timeoutMs ?? 600_000 });
    return false;
  } catch {
    return true;
  }
}
