#!/usr/bin/env python3
"""Hand a Claude Code hook (or a CLI call) to nooticr-verify, wherever it is checked out.

The toolkit lives in nooticr-server/verify so that the rules spanning all
three repos have one home. This file is copied, byte for byte, into each
repo's .claude/hooks/ (G.bootstrap-synced checks the copies match).

  .claude/hooks/nooticr-verify.py <HookEvent>     from .claude/settings.json
  .claude/hooks/nooticr-verify.py run --tier stop  anything else goes to verify.py
"""
import json
import os
import sys
from pathlib import Path

EVENTS = {"PreToolUse", "PostToolUse", "Stop", "SubagentStop", "TaskCompleted", "UserPromptSubmit", "SessionStart", "PreCompact"}


def toolkit():
    project = Path(os.environ.get("CLAUDE_PROJECT_DIR") or Path(__file__).resolve().parents[2])
    candidates = [os.environ.get("NOOTICR_VERIFY_HOME"), project / "verify", project.parent / "nooticr-server" / "verify"]
    if os.environ.get("NOOTICR_REPOS_ROOT"):
        candidates.append(Path(os.environ["NOOTICR_REPOS_ROOT"]) / "nooticr-server" / "verify")
    for c in candidates:
        if c and (Path(c) / "verify.py").is_file():
            return Path(c) / "verify.py"
    return None


def main():
    args = sys.argv[1:]
    found = toolkit()
    if found:
        argv = [sys.executable, str(found), "hook", args[0]] if args and args[0] in EVENTS else [sys.executable, str(found), *args]
        os.execv(sys.executable, argv)
    event = args[0] if args else ""
    msg = ("nooticr-verify was not found: clone nooticr-server next to this repo (../nooticr-server) "
           "or set NOOTICR_VERIFY_HOME to its verify/ directory. Without it none of this session's work is verified.")
    if event == "SessionStart":
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": msg}}))
    elif event == "Stop":
        payload = json.loads(sys.stdin.read() or "{}")
        # Say it once, loudly; then let the session end rather than loop on a missing checkout.
        if not payload.get("stop_hook_active"):
            print(json.dumps({"decision": "block", "reason": msg + " Tell the user plainly that nothing was verified."}))
    elif event not in EVENTS:
        sys.stderr.write(msg + "\n")
        sys.exit(2)


if __name__ == "__main__":
    main()
