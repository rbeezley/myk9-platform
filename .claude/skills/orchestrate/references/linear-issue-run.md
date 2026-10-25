# Linear run mode

Carries a list of `MYK9-<n>` issues, one by one, from Todo to merged, with Linear left accurate.
The model routing, dispatch protocol and review gate are in `../SKILL.md`. Everything from
"accepted and committed" to "merged and cleaned up" belongs to `ship-pr`. This file adds only
what an issue queue needs: selection, holds, Linear state and the run summary.

## Run start (the only pause)

1. **Where you sit.** The orchestrator runs from the main checkout
   (the first `git worktree list --porcelain` entry) on a clean, pulled `main`. It never edits
   files there. Every issue gets its own worktree. Don't start the run from an `EnterWorktree`
   session: that isolation refuses git in the main checkout, which the merge step and the
   per-issue `git worktree add` need. `ExitWorktree` (keep) first.
2. **Selection.**
   - The owner named ids: that list, in that order.
   - No list: use **Ready for an agent** and its exact connector fallback from
     `docs/agents/issue-tracker.md`. That contract is the only selection predicate. Rank by
     priority, then by fit with `docs/goals/fall-2026-launch-readiness.md` (secretary and
     show-day reliability first), then closest to done. Propose the top 3 with one line each and
     wait for one yes. This is the only question the run asks. If no Todo issue is eligible (all
     held, or human-only), say so and ask for ids. Never fall back to Backlog yourself.
   - **Continuous mode** applies when the owner says "overnight", "unattended", "keep going" or
     "until the queue is empty". Your one question then also states the limits, and the owner's
     yes covers all of them: the approved list first, then refills, an issue cap (default 8),
     and a stop time (default 07:00 local). Record the limits in the ledger header.
3. **Preflight.** One `get_issue` call proves the Linear connector works. If it's down, stop: a
   run that can't write Linear can't leave it accurate. Check that `codex --version` answers; if
   it doesn't, say before starting that any `independent`-tier PR will wait unmerged.
4. **Ledger.** Keep `<scratchpad>/orchestrate-run.md` with one row per issue: id, premise,
   approach, tier, worktree, branch, PR, outcome and reason. Update it at every state change, so a compacted context or a
   crash can resume from it.
5. **Continuous mode only: keep the Mac awake.** Call `request_keep_awake` (the `ccd_host` tool)
   so the machine can't sleep mid-merge. If it's unavailable, say so before starting.

## Per-issue loop

**Continuous mode: check the stop conditions before EVERY issue**, approved or refill. End the
run (go to Run end) when any of these holds:

- the issue cap is reached (each issue attempted counts, held ones included);
- it's past the stop time. Never start an issue after the stop time; an in-flight one finishes
  or parks as "merge pending";
- the last two issues both ended in a hold. That pattern means something systemic (a red `main`,
  Codex down, a broken connector), and more attempts would only burn budget.

Run issues one at a time by default. Run two at once only when their expected file sets are
disjoint, and stay inside the 3-heavy-job cap (each issue's implementer, `/simplify`, Codex
review and suites all count).

### 1. Triage (orchestrator, before any state change)

- `get_issue` with `includeRelations: true`. Read the **full** description, acceptance
  criteria, linked plan or OpenSpec change, and the latest comments. If the issue names an
  OpenSpec change, run it in OpenSpec mode instead.
- **Already fixed?** If the fix may already be on `main`, a `haiku` agent checks. If it is,
  comment with the evidence (commit or PR, and where the criterion holds), set Done after
  checking every criterion, and move on.
- **True, and fixed how?** Run "Verify, then weigh" from `../SKILL.md`: reproduce the claim
  on `main`, check it against archived issues and INTENT, and write the `premise:` and
  `approach:` ledger fields. Route rejected premises through the shared disposition table.
- **Pre-work stops:** use the **Dispositions and holds** table in
  `docs/agents/issue-tracker.md`, including its state, label, owner and resume record.
  `pnpm qa:inflight <expected paths>` must run; check In Progress issues naming those paths
  and `list_sessions` too. A held issue is not proof its unmerged work can be overwritten.
- Pick the implementer tier from the routing table.

### 2. Start

```bash
MAIN="$(git worktree list --porcelain | sed -n '1s/^worktree //p')"
N=<n>; SLUG=<3-5-word-kebab>
BRANCH="claude/myk9-$N-$SLUG"  # codex/ when Codex implements; the prefix declares authorship
WT="$MAIN/.claude/worktrees/myk9-$N"
git -C "$MAIN" fetch origin main
git -C "$MAIN" worktree add "$WT" -b "$BRANCH" origin/main
(cd "$WT" && bash scripts/bootstrap-worktree.sh)
```

Keep the `cd` inside the subshell: a bare `cd` moves the orchestrator's own working directory
into the issue worktree. `git -C "$WT" status --short` must be empty afterwards.

Then `save_issue` → **In Progress**. Write the ledger row.

### 3. Implement and review

Dispatch per `../SKILL.md` with `$WT` as the worktree path. Don't pass `isolation`: the worktree
already exists, and the implementer works only under `$WT`. Afterwards, confirm with
`git -C "$WT" status` that the changes landed there and that `$MAIN` is still clean. Run the
review gate, with a maximum of 3 rounds.

**Mid-work stops** (leave the PR as a draft or open no PR, then apply the shared disposition
table and its complete hold record):

- the diff turns out to touch money, or needs an owner decision;
- a second review finding on the same path, or a finding in code the previous fix introduced
  (the convergence rule). Post the restructure proposal, not another patch;
- a test runner hangs for more than 30s, or required CI is still red after two fix attempts;
- the implementer failed 3 review rounds and escalation would need Opus.

The table covers every trigger above. Check **Blocked work** at resume; a held issue must not
disappear merely because its priority is Medium/Low or its implementation is unfinished.

**E2E repro runs** need the main checkout's `apps/myk9show/.env.local` (bootstrap doesn't copy
it): `set -a; . "$MAIN/apps/myk9show/.env.local"; set +a`, then run the spec pinned to its own
port (`PLAYWRIGHT_BASE_URL=http://127.0.0.1:<port> PLAYWRIGHT_PORT=<port>`) so it doesn't
attach to another worktree's dev server. Never print the env values.

### 4. Ship

First un-commit the implementer's `wip:` commits, so that `ship-pr`'s `/simplify` and `/commit`
(which scope from uncommitted changes) see the whole diff:
`git -C "$WT" reset --soft "$(git -C "$WT" merge-base origin/main HEAD)"`. Use the merge base,
never `origin/main` itself, which may have moved. Then run `ship-pr` from `$WT` (Steps A–C, 3a,
4, 5). This run's authorization covers the push, the
PR and the squash-merge. Additions specific to the run:

- **PR title and body name only `MYK9-<n>`** (`Fixes MYK9-<n>`). A sibling or parent id in the
  body auto-completes that issue too when this PR merges. That includes the agent-involvement and risk prose: write "the orchestrate dry run", not its tracking id.
- **Step A (simplify):** under 150 changed lines, your line-by-line review read is the simplify
  pass, so don't spend three more agents on it. Larger diffs run `/simplify`.
- **Ratchet:** `pnpm qa:code-quality-ratchet` from `$WT` when the diff adds lines to an
  existing file.
- **`adversarial` floor:** dispatch two `sonnet` lenses (read only, distinct bug-finding
  angles) in parallel. Fix or evidence every finding, then **re-run both lenses on the new
  head**: `post-review-gate.sh` posts "all findings addressed" only over a clean final log.
  That log's first paragraph must open with the contract sentence `No actionable findings at
<sha>: …`, and it must carry no `[P*]` bullets, so record round-1 findings in prose.
- **Migration in the diff:** carry it through the PR and review gate (`migration-auditor`
  is one adversarial lens), then **do not merge** in this run. Route the owner's merge/deploy
  action through the shared table. Never push a migration from an unmerged branch.
- **Codex unavailable on an `independent` floor:** leave the PR open and route the unavailable
  reviewer through the shared table. No same-harness substitute, no owner override from an agent.
- **Watcher exit 3:** run it once more. If it times out again, arm `gh pr merge --squash
--auto`, keep the worktree, leave the issue In Progress, and mark the ledger "merge pending".
  The run summary lists it for `/cleanup` later.
- **Read the watcher's own exit code** (`…; echo "WATCH_EXIT=$?"`), never a wrapper's. If
  the failed check is `Review gate` and its status predates your gate comment, the
  comment-triggered run hasn't finished yet. Re-run the watcher once before treating it as red.
- **Watcher exit 1:** a fix attempt, which counts toward the two-red-CI hold. Exit 2 means a new
  head, so re-run the gate.

### 5. Close out (worktree still exists)

A merge **auto-completes** the linked issue in Linear, so the final state is always set
explicitly after a fresh read:

1. `gh pr view <n> --json state,mergeCommit` shows `MERGED`.
2. A fresh `get_issue` (a nightly job may have appended criteria). Check every criterion against
   the merged diff and the tests that ran.
3. Apply the shared disposition/evidence contract to the post-merge state and pending labels.
   Never accept automatic Done while any criterion remains owed.
4. Comment on the issue:

```markdown
**What changed** — <2-4 bullets>
**Checks run** — <commands and results; review gate line; CI watcher verdict>
**PR** — <url> (merged <sha> | open: <why>)
**Risks / remaining work** — <or "none">
**Acceptance criteria** — <each criterion: met (evidence) | owed (what, by whom)>
**Run notes** — implementer <model>, <N> review rounds, judgement calls: <list or "none">
```

Then `ship-pr` Step 7 from `$MAIN`. A worktree that was created locked needs
`git worktree remove -f -f "$WT"`. Worktree removal is the last command for that issue.

## Refill (continuous mode)

When the approved list is finished, don't end the run. Pick the next issue yourself, without
asking:

1. **Re-query fresh.** Read **Ready for an agent** again (or its documented Todo/filter fallback), rather than reusing the run-start
   list, because the board changes overnight. Rank by the same rules, and drop every issue
   already attempted this run, whatever its outcome. Never read Backlog. If nothing eligible is
   left, the run ends.
2. **Pick the top-ranked eligible issue** and run the per-issue loop, starting with the stop
   check and then Triage, whose holds still apply. Mark it `refill` in the ledger, so the
   summary separates the issues the owner approved from the ones the run chose.

## Run end

1. **Leftovers:** `git worktree list` shows only the expected worktrees (merge-pending ones are
   listed in the summary). `gh pr list --author @me --state open` shows only PRs the summary
   names. `ps -eo pid,etime,command | grep -E 'sleep|vitest'` finds no orphans. Dismiss any
   background-task chips that the run absorbed.
2. **Summary**, as the final message (and a push notification when the owner is away):

```markdown
| Issue    | Outcome            | PR    | Reason / owed                                      |
| -------- | ------------------ | ----- | -------------------------------------------------- |
| MYK9-123 | merged · Done      | #2870 | —                                                  |
| MYK9-456 | merged · In Review | #2871 | browser walk of /at-show scoring                   |
| MYK9-789 | held · Todo        | —     | money-code approval question; shared table applied |
| MYK9-321 | triaged · Backlog  | —     | complete reproduction negative; trigger recorded   |
```

Follow it with the orchestration stats from `../SKILL.md` and one line listing every judgement
call made without asking. In continuous mode, add one line naming the stop condition that ended the
run, and mark each `refill` issue in the table (e.g. `MYK9-321 (refill)`).

## Common mistakes

| Mistake                                                    | Instead                                                          |
| ---------------------------------------------------------- | ---------------------------------------------------------------- |
| Trusting Linear's auto-Done after the merge                | Always re-read and set Done or In Review yourself                |
| Dispatching the issue's criteria without reproducing them  | Reproduce on `main` first; hold what you cannot see              |
| Building the issue's Recommendation as written             | Weigh an alternative; the criteria are the contract, not the fix |
| Picking from Backlog, or grading issues up front           | Todo only; risk is judged from the diff at ship time             |
| Handing a refund fix to sonnet "because it's small"        | Money is held, whatever its size                                 |
| Letting the implementer push, open the PR or post the gate | The orchestrator owns every shared-system write                  |
| Retrying a red CI a third time                             | Hold after two attempts; unfinished code stays In Progress       |
| Removing a merge-pending worktree                          | Keep it; `/cleanup` after GitHub merges                          |
| Ending an overnight run when the approved list is done     | Continuous mode refills from Todo until a stop condition holds   |
| Reusing the run-start Todo list for refills                | Re-query; the board changes overnight                            |
