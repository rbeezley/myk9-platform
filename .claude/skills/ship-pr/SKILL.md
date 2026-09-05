---
name: ship-pr
description: Use when shipping or merging an existing PR/branch through review-comment fixes, the independent review gate, squash-merge, and cleanup. Triggers on "ship this PR", "merge the PR", "ship this branch", "address review and merge", or /ship-pr.
---

# Ship PR

Use when a feature branch is ready to ship — whether it has an open PR or not. Bundles simplify → commit → PR creation (if needed) → review-comment fixes → **independent review gate** → squash-merge → worktree cleanup, in that order.

This file is shared by Claude Code and Codex (`.agents/skills/ship-pr` is a symlink to it). Where the two harnesses differ, both paths are spelled out. "The instruction file" means `CLAUDE.md` for Claude Code and `AGENTS.md` for Codex.

## Trigger Phrases

- "ship this PR", "merge the PR", "ship this branch"
- "address review and merge", "fix review comments"
- `/ship-pr`

## Authorization

An explicit `/ship-pr`, "ship this branch," or "create a PR" request authorizes the GitHub operations required to open the PR:

- push the current feature branch;
- create the pull request;
- apply the `codex` and `codex-automation` labels when available; and
- update the PR description as part of the shipping workflow.

Do not ask for confirmation again before these steps. Merging, enabling auto-merge, closing a PR, or deploying a shared system requires separate explicit authorization unless the user explicitly requested merge or shipping through completion.

## Workflow

### Step 0: Establish Context

```bash
git branch --show-current
gh pr view --json number,title,url,reviewDecision,state 2>/dev/null || echo "NO_PR"
```

Note the branch name, the MAIN REPO path (always `/Users/richardbeezley/AI Projects/myk9-platform`, needed for the merge step) and the worktree path: `.claude/worktrees/<name>` for Claude Code, `.codex/worktrees/<name>` for Codex.

**Branch check:** Never run on `main`. If the current branch is `main`, stop and tell the user.

---

### If NO PR exists → Steps A–C first

#### Step A: Simplify

If the `/simplify` skill is available, invoke it against all uncommitted changes, wait for it to finish, and apply the proposals you agree with. If it is not available, read the diff once for dead code, duplicated helpers and leftover debug output, and fix those by hand. If any edits land, re-run typecheck and lint before continuing.

#### Step B: Commit

Invoke `/commit` — it handles staging, validation level, scoped tests, commit message, and push. The explicit ship-pr request already authorizes the branch push; do not ask for another confirmation before invoking it.

#### Step C: Open PR

Create the PR directly under the authorization above; do not pause for a second confirmation before the GitHub write. End the body with the attribution line the instruction file prescribes for your harness.

```bash
gh pr create --title "<conventional-commit-style title>" --body "$(cat <<'EOF'
## Summary
- <bullet per logical change>

## Test Plan
- [ ] pnpm typecheck passes
- [ ] pnpm lint passes
- [ ] related tests pass

## Review gate
- [ ] Independent review (Step 4) completed against the final head SHA
EOF
)"

PR_NUMBER=$(gh pr view --json number -q '.number')
```

Then continue to **Step 4**.

---

### If PR already exists → Steps 1–3 first

#### Step 1: Read Review Comments

```bash
gh pr view <number> --comments
```

Read ALL comments. Group: (a) blocking issues, (b) nits, (c) resolved/praise — skip (c).

If no unresolved comments, skip to Step 3 (verify).

#### Step 2: Apply Fixes

Work through blocking issues first, then nits:

- Read each file before editing
- Minimal change — no surrounding refactors

#### Step 3: Verify

Use the validation ladder from `/commit` (micro / low-risk / high-risk) to choose the checks, then fix failures — max 5 iterations, stop and report if still failing.

After fixes, invoke `/commit` to push.

---

### Step 4: Independent Review Gate — BEFORE merge

The gate is a review by the **other** harness. A subagent of your own harness is never a substitute (see `docs/PLAYBOOK.md` § 4 — that substitution is a recorded lapse). The review must finish, and its findings must be acted on, before Step 5. A review that finishes after the merge is an audit, not a gate: on 2026-09-05 PR #2040 merged while its review was still running and both findings shipped to `main`.

```bash
BASE_SHA=$(git rev-parse origin/main)
HEAD_SHA=$(git rev-parse HEAD)
PR_NUMBER=$(gh pr view --json number -q '.number')
LOG=/tmp/review-gate-$PR_NUMBER-$HEAD_SHA.log
```

**Author is Claude Code → Codex reviews.** Run from the worktree, foreground, with stdin closed:

```bash
codex review --base origin/main < /dev/null > "$LOG" 2>&1; echo "EXIT=$?"
grep -Ei 'Review was interrupted|usage limit' "$LOG" && echo "GATE DID NOT RUN"
```

**Author is Codex → Claude Code reviews:**

```bash
claude -p "/code-review $PR_NUMBER" > "$LOG" 2>&1; echo "EXIT=$?"
```

**The exit code is not the verdict.** Both reviewers exit 0 when they were interrupted, hit a usage limit, or returned findings. Read the log: it must contain either findings or an explicit no-findings statement for THIS head SHA. Then record the gate on the PR so it is visible to whoever merges:

```bash
gh pr comment $PR_NUMBER --body "Review gate: <codex|claude> reviewed $BASE_SHA..$HEAD_SHA — <N findings, all addressed | no findings>."
```

**If the reviewer is genuinely unavailable** (usage limit, outage, auth failure — not merely slow): use the § 4 fallback — adversarial subagents, plural, prompted to find bugs rather than approve — label the PR body with what ran instead, keep the PR a draft when nothing is time-pressured, and re-run the real gate once it is available.

**Findings:** fix every critical/high (P1/P2) finding and any medium (P3) that is straightforward. Invoke `/commit`, then re-run the gate against the new `HEAD_SHA`. **Max 5 review rounds** — escalate to the user if not clean after 5.

Never report the PR as ready, arm auto-merge, or merge while a review is running.

---

### Step 5: Squash-Merge from MAIN REPO

**CRITICAL: Never run `gh pr merge` from inside the feature worktree.** And never pass `--delete-branch`: its local half fails while a worktree holds the branch, and the weekly branch-janitor reaps merged remotes.

```bash
# 1. Verify PR state and current check status
gh pr view $PR_NUMBER --json state,mergedAt,mergeStateStatus,statusCheckRollup

# 2. Switch to main repo BEFORE merging
cd "/Users/richardbeezley/AI Projects/myk9-platform"
```

Reading the rollup — three traps from the instruction file's LESSONS:

- A red `Vercel – …` context whose `targetUrl` ends `?upgradeToPro=build-rate-limit` is an account quota, not a verdict on the diff; GitHub leaves the PR `MERGEABLE`/`UNSTABLE`, not `BLOCKED`. Merge on the Actions jobs plus the app's own Vercel context and say which check you ignored.
- A red check is a verdict on the base it ran against: if its run predates the `main` commit that fixed that failure, merge `origin/main` in and push — a rerun keeps the stale merge ref.
- "No pending checks" is not "settled": require every check to have reported a conclusion for the current head SHA.

**Path A — checks green (`mergeStateStatus` is `CLEAN`, or `UNSTABLE` only from the quota context):**

```bash
gh pr merge $PR_NUMBER --squash
gh pr view $PR_NUMBER --json state,mergedAt
```

Do not proceed until `state == "MERGED"`.

**Path B — checks still pending:** arm auto-merge (only after Step 4 has passed) and return immediately. GitHub will squash-merge when required checks pass.

```bash
gh pr merge $PR_NUMBER --squash --auto
gh pr view $PR_NUMBER --json autoMergeRequest
```

Then tell the user: "Auto-merge armed — GitHub will merge when required checks pass. Run `/cleanup` after it merges." Leave the Linear issue **In Progress** and **STOP — do not proceed to Step 6.** Do not poll; use `gh pr checks $PR_NUMBER --watch` only when the user asks to wait.

---

### Step 6: Cleanup — LAST STEP ONLY

Only after `state == "MERGED"` and `main` is updated:

```bash
# Already in main repo from Step 5
git checkout main
git pull --ff-only
git fetch --prune

# git worktree remove is the ABSOLUTE LAST command — nothing runs after this
git worktree remove "<worktree path from Step 0>" --force 2>/dev/null || true
```

**The local branch stays.** `git branch -D` is a denied command in this repo's Claude Code permissions, and `git branch -d` refuses squash-merged history; the weekly branch-janitor reports merged locals. Codex may delete it after the worktree is gone, following `AGENTS.md`.

---

### Step 7: Close out

Move the Linear issue to Done only after the merge, only after reading its **full** description with `get_issue` (list results truncate acceptance criteria), and only once the production build for a `main` commit at or after the merge commit is green — a merge is not a deploy, and a Vercel build-rate-limit failure on `main` leaves staging serving the previous bundle.

---

## Rules

- NEVER run on `main` directly
- NEVER run `gh pr merge` from inside a worktree directory
- NEVER merge, arm auto-merge, or call the PR ready while the independent review is running or unread
- NEVER substitute a same-harness subagent for the review gate
- NEVER pass `--delete-branch`; leave local branches for the branch-janitor
- NEVER remove the worktree before merge is confirmed AND main is updated
- Worktree removal is ALWAYS the final command
- If checks are pending, arm `gh pr merge --squash --auto` instead of stopping with manual instructions; never poll unless asked
- Verify merge via `gh pr view --json state`, not `git log` (squash-merges rewrite SHAs)
- Use `pnpm`, not `npm` or `npx`
- Max 5 verify iterations, max 5 review rounds — escalate if limits hit
