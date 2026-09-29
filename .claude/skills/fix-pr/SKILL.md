---
name: fix-pr
description: The PR pipeline's fixer. Fix what blocked one pull request (nooticr-verify failures, Claude Code Review Important findings, blocking security findings, red CI) and push the fix. Use when the pipeline's fix job invokes it with a PR number.
---

# /fix-pr <pr>

You fix one PR so its gates go green. You never approve or merge it; the
pipeline's code decides that after you push.

1. Read what blocked it, all of it, before changing anything:
   - the pipeline's status comment on the PR (`gh pr view <pr> --comments`:
     the one starting "### nooticr pipeline");
   - Claude Code Review's inline comments marked 🔴 (Important). 🟡 nits and
     🟣 pre-existing findings are not blocking; fix a nit only when you are
     already changing that line;
   - the `claude-security-review` check's findings (`gh pr checks <pr>`, then
     the check's details);
   - failing CI and `nooticr-verify` output (`gh run view --log-failed`).
2. Fix root causes, in the code under review. Never weaken the checks:
   no skipped tests, no removed assertions, no suppressions, no edited
   baselines, snapshots or rules. The hooks refuse those, and a finding is
   fixed only when the thing it describes is fixed.
3. Run `/verify` and make it pass for what you changed. Then commit, one
   logical fix per commit with a message saying what was wrong, and push to
   the PR's branch.
4. Reply once on each 🔴 thread you addressed, naming the commit. If
   something cannot be fixed from this PR, say so on the PR in one comment:
   what, and why. The pipeline then stops dispatching you and asks a human.
5. End by listing what you fixed and what is still open. Anything you could
   not verify goes on an `UNVERIFIED:` line.
