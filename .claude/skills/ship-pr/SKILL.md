# Ship PR

Use when a feature branch is ready to ship — whether it has an open PR or not. Bundles simplify → commit → PR creation (if needed) → self-review loop → squash-merge → worktree cleanup in the correct order.

## Trigger Phrases

- "ship this PR", "merge the PR", "ship this branch"
- "address review and merge", "fix review comments"
- `/ship-pr`

## Workflow

### Step 0: Establish Context

```bash
git branch --show-current
gh pr view --json number,title,url,reviewDecision,state 2>/dev/null || echo "NO_PR"
```

Note the branch name. Note the MAIN REPO path (always `/Users/richardbeezley/AI Projects/myk9-platform`) — needed for merge step.

**Branch check:** Never run on `main`. If the current branch is `main`, stop and tell the user.

---

### If NO PR exists → Steps A–D first

#### Step A: Simplify

Invoke `/simplify` against all uncommitted changes. It launches three parallel agents (efficiency, quality, reuse), auto-fixes safe wins, and proposes judgment calls. Apply the proposals you agree with. If any edits land, re-run typecheck and lint before continuing.

#### Step B: Commit

Invoke `/commit` — it handles staging, typecheck, lint, scoped tests, commit message, and push.

#### Step C: Open PR

```bash
gh pr create --title "<conventional-commit-style title>" --body "$(cat <<'EOF'
## Summary
- <bullet per logical change>

## Test Plan
- [ ] pnpm typecheck passes
- [ ] pnpm lint passes
- [ ] related tests pass

🤖 Generated with [Claude Code](https://claude.ai/claude-code)
EOF
)"

PR_NUMBER=$(gh pr view --json number -q '.number')
BASE_SHA=$(git rev-parse origin/main)
HEAD_SHA=$(git rev-parse HEAD)
```

Then continue to **Step 1** (self-review loop).

---

### If PR already exists → Steps 1–3 first

#### Step 1: Read Review Comments

```bash
gh pr view <number> --comments
```

Read ALL comments. Group: (a) blocking issues, (b) nits, (c) resolved/praise — skip (c).

If no unresolved comments, skip to Step 2 (verify).

#### Step 2: Apply Fixes

Work through blocking issues first, then nits:

- Read each file before editing
- Minimal change — no surrounding refactors

#### Step 3: Verify

```bash
pnpm typecheck && pnpm lint
```

Run related tests (full suite if >3 source files changed, otherwise scoped). Fix failures — max 5 iterations, stop and report if still failing.

After fixes, invoke `/commit` to push.

---

### Step 4: Self-Review via Subagent

```bash
BASE_SHA=$(git rev-parse origin/main)
HEAD_SHA=$(git rev-parse HEAD)
PR_NUMBER=$(gh pr view --json number -q '.number')
```

Spawn a `superpowers:code-reviewer` subagent:

```
Review the following implementation.

WHAT_WAS_IMPLEMENTED: <one-line description of the branch>
PLAN_OR_REQUIREMENTS: <plan file if one exists, otherwise "feature branch">
BASE_SHA: <base_sha>
HEAD_SHA: <head_sha>
DESCRIPTION: PR #<number> — <title>

Repo path: /Users/richardbeezley/AI Projects/myk9-platform

Run `gh pr diff <number>` to see the full diff.

Check for:
1. TypeScript correctness — no `any`, correct exactOptionalPropertyTypes usage
2. Test coverage — new logic has tests, no tests disabled
3. Logic errors, edge cases, boundary conditions
4. Security — RLS bypass, privilege escalation, unvalidated input, data integrity
5. CLAUDE.md conventions — pnpm not npm, offline-first patterns, files under 500 lines

Return EXACTLY one of:
- APPROVED
- A numbered list of issues with file:line, description, severity (critical/high/medium/low)
```

If `APPROVED` → skip to Step 5.

Otherwise apply findings (critical + high required; medium if straightforward), invoke `/commit`, re-spawn subagent with updated `HEAD_SHA`. **Max 5 review rounds** — escalate to user if not clean after 5.

---

### Step 5: Squash-Merge from MAIN REPO

**CRITICAL: Never run `gh pr merge` from inside the feature worktree.**

```bash
# 1. Verify PR state and current check status
gh pr view $PR_NUMBER --json state,mergedAt,statusCheckRollup

# 2. Switch to main repo BEFORE merging
cd "/Users/richardbeezley/AI Projects/myk9-platform"
```

**Choose the merge path based on check status:**

**Path A — checks already green (all required checks passed):** merge immediately.

```bash
# 3a. Squash-merge directly
gh pr merge $PR_NUMBER --squash --delete-branch

# 4a. Confirm
gh pr view $PR_NUMBER --json state,mergedAt
```

**Path B — checks still pending:** arm auto-merge and return immediately. GitHub will squash-merge as soon as all required checks pass.

```bash
# 3b. Arm auto-merge (returns immediately — do NOT poll or wait)
gh pr merge $PR_NUMBER --squash --auto --delete-branch

# 4b. Confirm auto-merge is armed
gh pr view $PR_NUMBER --json autoMergeRequest
```

After arming auto-merge, tell the user: "Auto-merge armed — GitHub will merge when required checks (Quality Checks + Test) pass. Run `/cleanup` after it merges to delete the local branch and worktree." Then **STOP — do not proceed to Step 6.**

Branch and worktree cleanup requires a confirmed merge (`state == "MERGED"` and `main` updated). For Path B the merge hasn't happened yet, so cleanup must be deferred. The user runs `/cleanup` later once GitHub executes the merge.

---

### Step 6: Cleanup — LAST STEP ONLY

```bash
# Already in main repo from Step 5
git checkout main
git pull --ff-only
git fetch --prune

# Delete the local feature branch.
# `gh pr merge --delete-branch` only deletes the REMOTE branch — the local ref persists
# until explicitly deleted, which is the #1 source of "hanging branches" at weekly cleanup.
# Squash-merge rewrites SHAs, so `git branch -d` may refuse — use -D after verifying merge.
gh pr list --state merged --head <branch-name> --json number -q '.[].number'  # must return $PR_NUMBER
git branch -D <branch-name>

# git worktree remove is the ABSOLUTE LAST command — nothing runs after this
git worktree remove "/Users/richardbeezley/AI Projects/myk9-platform/.claude/worktrees/<branch-name>" --force 2>/dev/null || true
```

---

## Rules

- NEVER run on `main` directly
- NEVER run `gh pr merge` from inside a worktree directory
- NEVER remove the worktree before merge is confirmed AND main is updated
- Worktree removal is ALWAYS the final command
- ALWAYS delete the local feature branch (`git branch -D`) after merge — `--delete-branch` on `gh pr merge` only removes the REMOTE; the local ref must be deleted separately
- Verify merge via `gh pr view --json state`, not `git log` (squash-merges rewrite SHAs)
- Use `pnpm`, not `npm` or `npx`
- Max 5 verify iterations, max 5 review rounds — escalate if limits hit
