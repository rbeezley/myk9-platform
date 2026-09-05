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
# 1. Establish the check verdict. Do NOT eyeball statusCheckRollup: "no pending"
#    fires before the CI jobs even register, an unfinished run carries a null
#    conclusion, and Vercel reports through `state` and never sets `conclusion`.
#    This reads the repo's own main-required-checks ruleset and waits for exactly
#    those contexts on the pinned SHA.
#      0 green · 1 REQUIRED check failed · 2 head moved
#      3 timeout (NOT a verdict) · 5 required green, non-required failed
bash scripts/qa/watch-pr-checks.sh $PR_NUMBER

# 2. Switch to main repo BEFORE merging
cd "/Users/richardbeezley/AI Projects/myk9-platform"
```

**Choose the merge path based on that exit code:**

**Path A — the watcher exited 0:** merge immediately.

```bash
# 3a. Squash-merge. NO --delete-branch: its local half fails while a worktree
#     still has the branch checked out, and `git branch -D` is denied by this
#     repo's permission rules anyway (see Step 6).
gh pr merge $PR_NUMBER --squash

# 4a. Confirm
gh pr view $PR_NUMBER --json state,mergedAt
```

**Path B — checks still pending (exit 3, or you do not want to wait):** arm auto-merge and return immediately. GitHub will squash-merge as soon as all required checks pass.

```bash
# 3b. Arm auto-merge (returns immediately — do NOT poll or wait)
gh pr merge $PR_NUMBER --squash --auto

# 4b. Confirm auto-merge is armed
gh pr view $PR_NUMBER --json autoMergeRequest
```

**Exit 1 (a REQUIRED check failed) or exit 2 (head moved) is a STOP, not a slower Path B.** Report the named failure; never arm auto-merge to get past a red.

**Exit 5 — required checks green, a non-required one failed — is a judgement call, not a stop.** Vercel preview contexts are deliberately outside the `main-required-checks` ruleset because this Hobby account hits the daily deployment limit (AGENTS.md § _Vercel Hobby quota / preview deploy discipline_, runbook in [`docs/operations/vercel-preview-quota.md`](../../../docs/operations/vercel-preview-quota.md)). Before treating it as non-blocking, confirm **both**:

1. the failure is the quota — the check's `targetUrl` contains `upgradeToPro=build-rate-limit`, not a build error; and
2. this PR does not need the preview for visual QA — a diff touching no browser code does not.

If either is false, treat it as exit 1. Say which of the two you checked when you report the merge.

After arming auto-merge, tell the user: "Auto-merge armed — GitHub will merge when required checks (Quality Checks + Test) pass. Run `/cleanup` after it merges to delete the local branch and worktree." Then **STOP — do not proceed to Step 6.**

Branch and worktree cleanup requires a confirmed merge (`state == "MERGED"` and `main` updated). For Path B the merge hasn't happened yet, so cleanup must be deferred. The user runs `/cleanup` later once GitHub executes the merge.

---

### Step 6: Cleanup — LAST STEP ONLY

```bash
# Already in main repo from Step 5
git checkout main
git pull --ff-only
git fetch --prune

# Prove the merge by SHA, not by name. A PR matching this branch's headRefName
# only means a PR with that NAME merged: commits pushed after the merge, or a
# re-created branch reusing a template name, leave the tip ahead of what landed.
# This deleted a remote branch carrying an unmerged commit on 2026-08-03.
git rev-parse <branch-name>                                          # local tip
gh pr view $PR_NUMBER --json headRefOid --jq .headRefOid             # must be IDENTICAL

# Worktree removal comes BEFORE any branch deletion — git refuses to delete a
# branch that any worktree still has checked out, including this one.
git worktree remove "/Users/richardbeezley/AI Projects/myk9-platform/.claude/worktrees/<branch-name>" --force 2>/dev/null || true
```

**Leave the local branch alone.** `git branch -D` / `-d` are DENIED by this repo's
permission rules: interactively that is a prompt, and in a scheduled or unattended
run it is a silent stall that hangs the whole task. The weekly `branch-janitor`
reaps merged branches and reports the rest. This is also why Step 5 drops
`--delete-branch` — its local half would fail here regardless.

---

## Rules

- NEVER run on `main` directly
- NEVER run `gh pr merge` from inside a worktree directory
- NEVER remove the worktree before merge is confirmed AND main is updated
- Worktree removal is ALWAYS the final command
- NEVER pass `--delete-branch`, and never run `git branch -D` / `-d` — both are denied by this repo's permission rules and stall an unattended run. Leave local branches for `branch-janitor`.
- NEVER treat "no pending checks" as green. Use `scripts/qa/watch-pr-checks.sh`, which pins the SHA and waits for the `main-required-checks` ruleset's contexts specifically. Two ways a hand-rolled filter gets this wrong: Vercel reports through `state` and never `conclusion`, so reading one field misses the other; and seconds after a push a lone fast status context has nothing pending and nothing failed while no CI job has registered at all.
- NEVER collapse a non-required failure into a blocking one, or into silence. Exit 5 exists for that case and requires the two checks above it.
- NEVER accept a merged PR's `headRefName` as proof a branch merged. Compare the tip SHA against that PR's `headRefOid`.
- Verify merge via `gh pr view --json state`, not `git log` (squash-merges rewrite SHAs)
- Use `pnpm`, not `npm` or `npx`
- Max 5 verify iterations, max 5 review rounds — escalate if limits hit
