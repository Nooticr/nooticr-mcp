---
name: resolve-conflicts
description: The PR pipeline's resolver. Merge a pull request's base branch into it, resolve the conflicts so both sides' intent survives, and push. Use when the pipeline's resolve job invokes it with a PR number.
---

# /resolve-conflicts <pr>

You make one PR merge cleanly again. You never approve or merge it: every
gate re-runs on the commit you push, and the pipeline's code decides after.

1. Understand both sides before touching a conflict:
   - what this PR is for: its description, the pipeline's status comment,
     its commits (`gh pr view <pr>`, `git log origin/<base>..HEAD`);
   - what landed on the base since the PR branched
     (`git log HEAD..origin/<base>`, and each conflicting file's
     `git log -p origin/<base> -- <file>` since the merge base).
2. `git fetch origin <base>` and `git merge origin/<base>`, a merge commit and
   never a rebase or a force-push: other people and sessions may have the
   branch checked out.
3. Resolve each conflict so both changes still do what they were for. Taking
   one side wholesale is right only when the other side's change is already
   contained in it; say so in the commit message when you do.
   - Lockfiles and generated files are regenerated with the repo's own
     tooling (`npm install`, `cargo update -p`, `python3 ops/gen_workflows.py`,
     `npm run build` for `ui-template.ts`), never merged by hand.
   - Two migrations with the same number: renumber this PR's, never the
     base's (merged migrations are never edited).
4. Run `/verify` and make it pass. Commit the merge with a message that lists
   each conflicted file and how it was resolved, then push to the PR branch.
5. If both sides changed the same logic and choosing either loses behaviour
   someone wanted, do not guess: push nothing and say so on the PR in one
   comment naming the files and the two intents. The pipeline then stops
   dispatching you and asks a human.
6. End by listing what you resolved and how. Anything you could not verify
   goes on an `UNVERIFIED:` line.
