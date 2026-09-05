---
name: ship-it
description: Use when given a plan document path to autonomously implement, test, review, and merge a feature end-to-end with no human input until final merge confirmation.
---

# Ship It — Autonomous PR Pipeline

Takes a plan path and ships it end-to-end: implement → test loop → commit → PR → self-review loop → merge → cleanup.

**Usage:** `/ship-it <path-to-plan.md>`

**Main repo path (hardcoded):** `/Users/richardbeezley/AI Projects/myk9-platform`

---

## Step 0: Load Plan and Establish Context

```bash
MAIN="/Users/richardbeezley/AI Projects/myk9-platform"
BRANCH=$(git branch --show-current)
WORKTREE=$(git rev-parse --show-toplevel)
```

Read the plan file in full. Create a TodoWrite with one item per plan task — mark each `pending`. Do not start implementing until todos are created.

---

## Step 1: Worktree Check

```bash
git worktree list | grep "$WORKTREE"
```

If not inside a worktree under `.Codex/worktrees/`, invoke `superpowers:using-git-worktrees` to create one before proceeding. Never implement on `main`.

---

## Step 2: Implement Per Plan

Work through todos in order. For each task:
- Mark `in_progress`
- Read affected files before editing
- Make only the changes the task requires — no scope creep
- After each meaningful batch, run focused checks for the files just changed. Use app/package-local typecheck (`pnpm --filter @myk9/show typecheck`) for small single-app TypeScript changes; reserve full `pnpm typecheck` for high-risk/shared work.
- Mark `completed`

---

## Step 3: Risk-Based Test Loop (until green)

Choose validation level before running checks:

- **Micro review follow-up**: comment/docs/test-only or tiny review nit. Run focused tests only; skip full local typecheck/lint unless production TypeScript changed.
- **Low-risk focused change**: ≤3 production files in one app/module. Run app/package-local typecheck + lint and related tests.
- **High-risk change**: shared helpers, entry submission, payment, auth/RLS, DB migrations, offline/replication, cross-app changes, or >3 production files. Run full `pnpm typecheck`, full `pnpm lint`, and broader app tests.

For UI/state bugs, prefer extracting pure state helpers and testing those directly when the component harness is slow, flaky, or hangs. This keeps the feedback loop fast while still covering the behavioral contract.

Examples:

```bash
# Micro review follow-up
cd apps/myk9show && pnpm exec vitest run <related-test-file>

# Low-risk focused myK9Show change
pnpm --filter @myk9/show typecheck
pnpm --filter @myk9/show lint
cd apps/myk9show && pnpm exec vitest run <related-test-file>

# High-risk/shared change
pnpm typecheck
pnpm lint
```

If `--filter` is not available for the affected package, fall back to the closest app-local command or full command.

Fix failures. Repeat until all pass. **Max 10 iterations** — stop and report if still failing.

After pushing the PR, let CI provide the broad verification signal for micro follow-ups. Do not re-run full local checks for comment-only or test-only review nits unless CI fails.

Do not repeatedly poll PR checks by default. If checks are pending, report that CI is running and continue with other useful work or stop. Use `gh pr checks <number> --watch` only when the user explicitly asks to wait.

---

## Step 3b: Simplify

Invoke `/simplify` against all changed files. It will review for DRY violations, reuse opportunities, and efficiency issues, and auto-fix what it finds.

Wait for simplify to complete before proceeding. If it makes changes, re-run the test loop (Step 3) to confirm nothing regressed.

---

## Step 4: Commit and Open PR

Invoke `/commit` — it handles staging, typecheck, lint, tests, commit message, push.

Then open the PR:

```bash
BASE_SHA=$(git rev-parse origin/main)
HEAD_SHA=$(git rev-parse HEAD)

gh pr create --title "<conventional-commit-style title>" --body "$(cat <<'EOF'
## Summary
- <bullet per plan task>

## Test Plan
- [ ] pnpm typecheck passes
- [ ] pnpm lint passes
- [ ] related tests pass

🤖 Generated with [Codex](https://Codex.ai/Codex)
EOF
)"

PR_NUMBER=$(gh pr view --json number -q '.number')
```

Note `$PR_NUMBER` and `$BASE_SHA` / `$HEAD_SHA` — needed for review.

---

## Step 5: Self-Review via Subagent

Spawn a code-review subagent using the Agent tool with `subagent_type: superpowers:code-reviewer`:

**Subagent prompt template:**
```
Review the following implementation.

WHAT_WAS_IMPLEMENTED: <summary from plan>
PLAN_OR_REQUIREMENTS: <plan file path>
BASE_SHA: <base_sha>
HEAD_SHA: <head_sha>
DESCRIPTION: PR #<number> — <title>

Repo path: /Users/richardbeezley/AI Projects/myk9-platform

Run `gh pr diff <number>` to see the full diff.

Check specifically for:
1. TypeScript correctness — no `any`, correct exactOptionalPropertyTypes usage
2. Test coverage — new logic has tests, no tests disabled
3. Logic errors, edge cases, boundary conditions
4. Security — RLS bypass, privilege escalation, unvalidated input, data integrity
5. AGENTS.md conventions — pnpm not npm, offline-first patterns, files under 500 lines

Return EXACTLY one of:
- APPROVED
- A numbered list of issues, each with file:line and description, severity (critical/high/medium/low)
```

If subagent returns `APPROVED` → skip to Step 7.

---

## Step 6: Fix Loop (until clean)

Apply each finding (critical and high required; medium if straightforward):
- Read file before editing
- Minimal fix — do not refactor surrounding code

For review-only micro changes, run focused tests and the narrowest relevant typecheck, then invoke `/commit` using the same validation level. Do not repeat full `pnpm typecheck` + `pnpm lint` locally unless production TypeScript, shared behavior, or high-risk areas changed.

Re-spawn the review subagent (Step 5) with updated `HEAD_SHA`.

Repeat until `APPROVED`. **Max 5 review rounds** — stop and escalate to user if not clean after 5.

---

## Step 7: Squash-Merge — ALWAYS FROM MAIN REPO

**CRITICAL: Never run `gh pr merge` from inside a feature worktree.**

```bash
# 1. Verify not already merged (squash-merges fool git log)
gh pr view $PR_NUMBER --json state,mergedAt

# 2. cd to MAIN REPO before merging
cd "/Users/richardbeezley/AI Projects/myk9-platform"

# 3. Merge
gh pr merge $PR_NUMBER --squash --delete-branch

# 4. Confirm
gh pr view $PR_NUMBER --json state,mergedAt
```

Do not proceed to Step 8 until `state == "MERGED"`.

---

## Step 8: Cleanup — `git worktree remove` IS THE LAST COMMAND

```bash
# Already in main repo from Step 7
git fetch --prune
git checkout main
git pull --ff-only

# Identify worktree path. `git worktree list | awk '{print $1}'` TRUNCATES
# at the first space, so a checkout under "AI Projects" resolves to
# /Users/<you>/AI and the remove below targets a path that does not exist.
# Porcelain output puts the full path on its own line.
WORKTREE_PATH=$(git worktree list --porcelain | awk -v b="refs/heads/$BRANCH" '
  /^worktree /   { p = substr($0, 10) }
  $0 == "branch " b { print p; exit }
')

# LAST COMMAND — nothing runs after this line. No `2>/dev/null || true`:
# a swallowed failure reports the ship as complete with the worktree still
# on disk, which is the one outcome this step exists to prevent.
if [ -z "$WORKTREE_PATH" ]; then
  echo "No worktree registered for $BRANCH — nothing to remove."
else
  git worktree remove "$WORKTREE_PATH" --force
fi
```

---

## Step 9: Handoff Doc

Output this summary after cleanup:

```
## Ship It — Complete

Plan:          <path>
Branch:        <branch>
PR:            #<number> — <title>
Merged at:     <mergedAt>
Review rounds: <N>

Shipped:
- <one bullet per completed plan task>
```

---

## Rules

- NEVER run `gh pr merge` outside `/Users/richardbeezley/AI Projects/myk9-platform`
- NEVER remove the worktree before merge is confirmed AND main is updated
- `git worktree remove` is ALWAYS the absolute last command — nothing after it
- Before flagging any branch as unmerged, verify via `gh pr view --json state`, not `git log` (squash-merges rewrite SHAs)
- Use `pnpm`, never `npm` or `npx`
- Never add scope beyond the plan
- Max 10 test-fix iterations, max 5 review rounds — escalate if limits hit

## Edge Cases

**CWD lost after worktree removal:** If any Bash call fails with "getcwd", "cannot open current directory", or "No such file or directory" referencing the worktree path, immediately run `cd "/Users/richardbeezley/AI Projects/myk9-platform"` before any other command.

**Squash-merge false negative:** `git log origin/main..HEAD` shows commits after a squash-merge because SHAs differ. Always use `gh pr view --json state` to confirm merge status.

**Pre-existing typecheck failures:** If typecheck fails on files this branch did NOT touch, stop and report — do not silently fix pre-existing breakage.
