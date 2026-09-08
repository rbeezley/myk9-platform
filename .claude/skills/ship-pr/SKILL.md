---
name: ship-pr
description: Use when shipping or merging an existing PR/branch through review-comment fixes, the independent review gate, squash-merge, and cleanup. Triggers on "ship this PR", "merge the PR", "ship this branch", "address review and merge", or /ship-pr.
---

# Ship PR

Use when a feature branch is ready to ship — whether it has an open PR or not. Bundles simplify → commit → PR creation (if needed) → review-comment fixes → **independent review gate** → squash-merge → close-out → worktree cleanup, in that order.

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

**In-flight check:** `pnpm qa:inflight` — exit 1 means an open PR, another worktree, or an unmerged branch already touches what this branch changes; exit 2 means it could not decide (no paths, or `gh`/git failed) and is not a pass. Do not open a second PR on it; coordinate first (see `/commit` Step 0).

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
PR_NUMBER=$(gh pr view --json number -q '.number')
```

**Never type an evidence comment by hand.** `scripts/qa/post-review-gate.sh` is the only writer of `Review gate:` comments; both wrappers call it for you. A hand-typed line attests to a review nobody can check — the poster hashes the log it posts and refuses a log that does not carry the reviewer's clean contract sentence.

**Author is Claude Code → Codex reviews.** Run the wrapper from the worktree, foreground:

```bash
pnpm qa:codex-review --post     # scripts/qa/codex-review.sh, always --base origin/main
```

Use `--post` with no `--` before it: pnpm forwards a bare `--` to the script.

**Author is Codex → Claude Code reviews.** A real review takes 5-20 minutes and `claude -p` prints nothing until it finishes, so a shell tool with a per-command timeout sees an empty log and kills it (Codex did exactly this on #2124 with `timeout 180 claude -p …`, twice). Never wrap the wrapper in `timeout`. Start it detached, then poll in short calls:

```bash
bash scripts/qa/claude-review.sh --detach --post $PR_NUMBER      # returns at once
bash scripts/qa/claude-review.sh --wait 240 $PR_NUMBER           # repeat until it is not 3
#   0 clean and evidence posted · 1 findings posted · 2 did not run (not a verdict) · 3 still running, call again
```

**Codex: this cannot run inside your sandbox.** The review needs the macOS Keychain (Claude's credentials) and the network; `workspace-write` denies both, which reads as `Not logged in · Please run /login` (Keychain) or a three-minute hang ending in `Can't reach the API server` (network). The wrapper now detects both in seconds and exits 2 with the remedy: re-run it with escalated permissions, and if your approval policy forbids escalation, stop and report exactly: "Richard, run `bash scripts/qa/claude-review.sh --detach --post <pr>` from a terminal." If `--detach` or `--wait` reports that the detached review **died** or is **gone without recording a verdict**, the attempt has no verdict. A host reaping background processes when a shell call returns is one possible cause (#2131); do not infer the cause from the stale marker alone. Use the current wrapper from main: #2132 added process-liveness detection. Do not repeatedly poll an older wrapper's stale "running" marker. Do not substitute a same-harness subagent review; that is not the gate.

**Observed Codex workaround (#2136, 2026-09-08).** An escalated detached attempt disappeared without a verdict; its cause was not confirmed. Restarting with the supervising shell kept open produced five completed reviews. This is a verified workaround, not proof of a root-cause fix. After establishing that the previous attempt has ended, start and supervise the replacement in **one escalated exec command**, returning a live tool session and polling that session until it exits:

```bash
bash scripts/qa/claude-review.sh --detach --post "$PR_NUMBER" || exit "$?"
while true; do
  review_result=0
  bash scripts/qa/claude-review.sh --wait 30 "$PR_NUMBER" || review_result=$?
  if [ "$review_result" -ne 3 ]; then exit "$review_result"; fi
done
```

Keep the supervising tool session alive; do not run only the detach command and close its shell. The loop waits on the same attempt and exits on its actual result; it never restarts a failed review automatically. Exit 2 remains **no verdict**. If this supervised attempt also dies, report it and use the operator-terminal route above. Do not kill another task's reviewer or substitute same-harness review evidence.

Two preconditions. Push first: `/code-review` reads the **remote** PR head while the evidence names your local HEAD, so the wrapper refuses (exit 2) when the two differ rather than attesting to a commit the reviewer never saw. And the wrapper lives in the tree: if `scripts/qa/claude-review.sh` is missing on your branch, your base predates it — `git merge origin/main` (that is a new head; push, then gate the new head).

Both wrappers behave identically. Exit 0 = clean and the evidence comment has been posted for THIS head; 1 = findings, which the wrapper posts as a `Codex/Claude findings for <head>` comment (not evidence — it does not begin `Review gate:`), so fix them, commit, and re-run for the NEW head; 2 = the review did NOT complete (usage limit, interrupt, unrecognized output) **or the evidence was not posted** — not a verdict, and nothing was recorded. Drop `--post` to rehearse without writing to the PR. Never call `codex review --commit`: it reviews one commit and can vacuously pass on a docs-only tip.

A re-review that finds defects on a head that already carries clean evidence also **withdraws** it — the wrapper posts a `<N> findings, not addressed` evidence line, which the checker rejects — so the gate goes red instead of staying green on the older attestation.

**The exit code is not the verdict.** Both reviewers exit 0 when they were interrupted, hit a usage limit, or returned findings; that is why the wrappers read the log and why only the poster writes evidence. On a clean re-run after findings, the wrapper counts the `[P*]` bullets in its own earlier findings comments and posts `<N> findings, all addressed` — you do not supply N.

`.github/workflows/review-gate.yml` parses the comment's FIRST line into the `Review gate` commit status on the head. Concrete example — this exact line is what the checker's contract test parses, so keep one here:

```text
Review gate: codex reviewed 0a2020c7a..5af9af158 — no findings
```

The reviewer is `codex` or `claude` (whichever ran, i.e. the OTHER harness). The verdict is the whole remainder of the line and must be exactly `no findings` or `<N> findings, all addressed` / `<N> findings, all fixed` — `finding(s)` is **not** accepted, and neither is a parenthetical, "not all addressed", or "no findings yet"; `1 findings, all addressed` is the singular, ugly but green. `scripts/qa/review-gate.ts --verdict "<text>"` answers 0/2 for any candidate, and the poster asks it rather than carrying its own copy of the grammar. Put detail on the comment's later lines. The status is pinned to the SHA: any later push turns it red until a new line is recorded for the new head, which is the whole point. Editing or deleting the evidence comment re-evaluates it too.

**If the reviewer is genuinely unavailable** (usage limit, outage, auth failure — not merely slow), use the documented `human-fallback` path: run two adversarial subagent reviews in parallel, fix every finding, wait for required checks to pass, and have a repository OWNER or MEMBER post this exact first line against the current head, followed by the detail lines shown in `docs/PLAYBOOK.md`:

```text
Review gate: human-fallback reviewed 0a2020c7a..5af9af158 — 2 adversarial subagent reviews, all findings addressed
Fallback reason: Claude unavailable — authentication failure
Adversarial subagent review: correctness
Adversarial subagent review: security
Required checks: passing
```

The fallback is explicitly labelled and second-best. Keep the PR a draft when nothing is time-pressured; when a maintainer authorizes it, mark the PR ready so the status can be evaluated, and re-run the real gate once the reviewer is available.

**Findings:** fix every critical/high (P1/P2) finding and any medium (P3) that is straightforward. Invoke `/commit`, then re-run the wrapper against the new head. **Max 5 review rounds** — escalate to the user if not clean after 5.

Never report the PR as ready, arm auto-merge, or merge while a review is running.

---

### Step 5: Squash-Merge from MAIN REPO

**CRITICAL: Never run `gh pr merge` from inside the feature worktree.** And never pass `--delete-branch`: its local half fails while a worktree holds the branch, and the weekly branch-janitor reaps merged remotes.

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

Reading the rollup — three traps from the instruction file's LESSONS:

- A red `Vercel – …` context whose `targetUrl` ends `?upgradeToPro=build-rate-limit` is an account quota, not a verdict on the diff; GitHub leaves the PR `MERGEABLE`/`UNSTABLE`, not `BLOCKED`. Merge on the Actions jobs plus the app's own Vercel context and say which check you ignored.
- A red check is a verdict on the base it ran against: if its run predates the `main` commit that fixed that failure, merge `origin/main` in and push — a rerun keeps the stale merge ref. **That push is a new head:** go back to Step 3 and Step 4, and record the gate for the new SHA before merging. Conflict resolutions and integration changes must not skip the review.
- "No pending checks" is not "settled" — and neither is "nothing failed". Seconds after a push a
  lone fast status context has nothing pending and nothing red while no CI job has registered at
  all. The watcher encodes all three traps: it pins the SHA, waits for the
  `main-required-checks` ruleset's contexts specifically, and classifies with an allowlist of
  passing conclusions so `STALE` and any future value fail closed.

**Exit 1 (a REQUIRED check failed) or exit 2 (head moved) is a STOP, not a slower Path B.** Never
arm auto-merge to get past a red. **Exit 5** — required green, a non-required check red — is the
quota case above: confirm the `targetUrl` says `upgradeToPro=build-rate-limit` AND that this diff
does not need the preview for visual QA, then say which you checked.

**Path A — the watcher exited 0.** Green means the REQUIRED set passed, **not** that the board is
finished. Read its last two lines: `Nothing outstanding` -> merge; `STILL OUTSTANDING
(non-required, may yet fail): ...` -> apply the exit-5 judgement below to each name. Those can
still turn red after the required set goes green (CI's `Build` depends on `Test`), and without
this an identical Vercel failure blocks shipping when it lands early and is ignored when it
lands late, purely on timing.

```bash
gh pr merge $PR_NUMBER --squash
gh pr view $PR_NUMBER --json state,mergedAt
```

Do not proceed until `state == "MERGED"`.

**Path B — the watcher exited 3 (timeout — NOT a verdict), or you do not want to wait:** arm
auto-merge (only after Step 4 has passed) and return immediately. GitHub will squash-merge when required checks pass.

```bash
gh pr merge $PR_NUMBER --squash --auto
gh pr view $PR_NUMBER --json autoMergeRequest
```

Then tell the user: "Auto-merge armed — GitHub will merge when required checks pass. Run `/cleanup` after it merges." Leave the Linear issue **In Progress** and **STOP — do not proceed to Steps 6–7.** Do not poll; use `gh pr checks $PR_NUMBER --watch` only when the user asks to wait.

---

### Step 6: Close out — while the worktree still exists

Do this **before** Step 7: once the worktree is removed the harness keeps its CWD there, and later shell calls fail.

1. Confirm the merge: `gh pr view $PR_NUMBER --json state,mergeCommit`.
2. A merge is not a deploy. Check the production build for a `main` commit at or after the merge commit (`gh api repos/<owner>/<repo>/commits/<sha>/status`); a Vercel build-rate-limit failure on `main` leaves staging serving the previous bundle.
3. Move the Linear issue to Done only after reading its **full** description with `get_issue` (list results truncate acceptance criteria) and checking every criterion. If the production build has not gone green yet, leave the issue **In Progress**, say so, and tell the user what to re-check.

---

### Step 7: Cleanup — LAST STEP ONLY

Only after `state == "MERGED"` and `main` is updated:

```bash
# Already in main repo from Step 5
git checkout main
git pull --ff-only
git fetch --prune

# Prove the merge by SHA, not by name: a PR matching this branch's headRefName only means a PR
# with that NAME merged. Commits pushed after the merge, or a re-created branch reusing a
# template name, leave the tip ahead of what landed — that deleted an unmerged commit's branch
# on 2026-08-03.
git rev-parse <branch-name>                               # must equal
gh pr view $PR_NUMBER --json headRefOid --jq .headRefOid  # this

# git worktree remove is the ABSOLUTE LAST command — nothing runs after this
git worktree remove "<worktree path from Step 0>" --force 2>/dev/null || true
```

**The local branch stays.** `git branch -D` is a denied command in this repo's Claude Code permissions, and `git branch -d` refuses squash-merged history; the weekly branch-janitor reports merged locals. Codex may delete it after the worktree is gone, following `AGENTS.md`.

---

## Rules

- NEVER run on `main` directly
- NEVER run `gh pr merge` from inside a worktree directory
- NEVER merge, arm auto-merge, or call the PR ready while the independent review is running or unread
- NEVER substitute a same-harness subagent for the review gate
- NEVER pass `--delete-branch`; leave local branches for the branch-janitor
- NEVER remove the worktree before merge is confirmed, main is updated, AND close-out (Step 6) is done
- Any push that changes the head after the gate — including a merge from `main` — re-runs the gate
- Worktree removal is ALWAYS the final command
- If checks are pending, arm `gh pr merge --squash --auto` instead of stopping with manual instructions; never poll unless asked
- NEVER treat "no pending checks" as green. Use `scripts/qa/watch-pr-checks.sh` — it pins the SHA, waits for the ruleset's required contexts, and fails closed on unknown conclusions.
- NEVER collapse a non-required failure into a blocking one, or into silence. Exit 5 is that case, and it carries two required confirmations.
- NEVER accept a merged PR's `headRefName` as proof a branch merged. Compare the tip SHA against its `headRefOid`.
- Verify merge via `gh pr view --json state`, not `git log` (squash-merges rewrite SHAs)
- Use `pnpm`, not `npm` or `npx`
- Max 5 verify iterations, max 5 review rounds — escalate if limits hit
