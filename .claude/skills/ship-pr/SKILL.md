# Ship PR

Use when the user wants to address PR review feedback and merge — or just merge a clean PR. Bundles fix → verify → squash-merge → worktree cleanup in the correct order to avoid the cwd-lockup failure mode.

## Trigger Phrases

- "ship this PR", "merge the PR", "address review and merge"
- "fix review comments", "fix review feedback"
- `/ship-pr`

## Workflow

### Step 0: Establish Context

```bash
# Identify current branch and PR
git branch --show-current
gh pr view --json number,title,url,reviewDecision,comments
```

Note the PR number. Note the MAIN REPO path — this is needed for Step 4.

The main repo is always: `/Users/richardbeezley/AI Projects/myk9-platform`

### Step 1: Read Review Comments

```bash
gh pr view <number> --comments
```

Read ALL comments. Group them by: (a) blocking issues to fix, (b) suggestions/nits to address, (c) praise/resolved items to skip.

### Step 2: Apply Fixes

Work through blocking issues first, then nits. For each fix:
- Read the relevant file before editing
- Make the minimal change that addresses the comment
- Do not refactor unrelated code

### Step 3: Verify

Run in parallel:

```bash
pnpm typecheck
pnpm lint
```

Then run related tests (use the same scoping logic as the `/commit` skill: full suite if >3 source files changed, related tests only if ≤3).

**If checks fail:** fix the root cause, re-run. Max 5 iterations — stop and report if still failing after 5.

### Step 4: Commit and Push

Use the `/commit` skill for this step. It handles staging, commit message, push, and migration check.

### Step 5: Squash-Merge from MAIN REPO

**CRITICAL: Never run `gh pr merge` from inside the feature worktree.**

```bash
# 1. Confirm push succeeded and CI is green (or approved)
gh pr view <number> --json statusCheckRollup,reviewDecision

# 2. Switch to main repo directory BEFORE merging
cd "/Users/richardbeezley/AI Projects/myk9-platform"

# 3. Squash-merge
gh pr merge <number> --squash --delete-branch
```

Wait for the merge to complete and confirm with:

```bash
gh pr view <number> --json state,mergedAt
```

### Step 6: Cleanup Worktree — LAST STEP ONLY

Only after merge is confirmed. Do NOT do this earlier.

```bash
# From MAIN repo dir (already there from Step 5)
git fetch --prune

# Update main BEFORE removing the worktree
git checkout main
git pull --ff-only

# git worktree remove is the ABSOLUTE LAST command — nothing runs after this
git worktree remove "/Users/richardbeezley/AI Projects/myk9-platform/.claude/worktrees/<worktree-name>" --force 2>/dev/null || true
```

## Rules

- NEVER run `gh pr merge` from inside a worktree directory
- NEVER remove the worktree before the merge is confirmed
- Worktree removal is ALWAYS the final command
- If the branch was squash-merged, `git log` comparison will show it as "unmerged" — verify via `gh pr view --json state` instead
- Use `pnpm`, not `npm` or `npx`, for all package commands
