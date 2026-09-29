---
name: verify
description: Run nooticr-verify on the current change and report what actually passed, failed or could not run. Use before saying any work is done, tested or verified, when asked to "check everything", or when the Stop hook blocked.
---

# /verify

The Stop hook already runs this gate before you can finish; running it yourself
first just shows you the result sooner. Its report, not your memory of what you
ran, is the evidence.

1. Run the gate on the change as it is now:

   ```bash
   python3 .claude/hooks/nooticr-verify.py run --tier stop
   ```

   Add `--tier ci` to also run what CI runs (full browser suites, builds), or
   `--tier ci --all` to run every rule whether or not the change triggers it.
   `--rule <id>` runs one rule; `list` prints the catalogue.

2. Read every non-passing line. For each:
   - **FAIL**: fix the code. Never the rule, the baseline, a test's assertions,
     or a snapshot: those edits are refused and flagged.
   - **NOT CHECKED**: the environment is missing something (a sibling repo, a
     database, node_modules). Fix it if you can (see the SessionStart notes).
     If it genuinely cannot run here, your final message ends with
     `UNVERIFIED: <rule-id> — <why>`.
   - **CHECK CRASHED**: a bug in the toolkit. Report it; do not work around it.
   - **warn**: not blocking, but listed in the PR's verification summary.

3. Report to the user in these terms: which rules passed, which failed and
   why, what was not checked. Never "all tests pass" unless the report says
   so for the tests that matter to the change.

The full rule catalogue, with why each rule exists, is in
`nooticr-server/verify/README.md`.
