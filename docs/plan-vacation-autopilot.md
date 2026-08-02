# Vacation Autopilot

> **Status:** Active

Unattended 10-day workflow: Claude Code on the Mac Mini works through triaged Linear
issues (team **MyK9-platform**) 4×/day while Richard is away with no computer access.
Designed 2026-08-02 via a grilling session; departure 2026-08-04.

## Decisions (settled with Richard, 2026-08-02)

| Decision           | Choice                                                                      |
| ------------------ | --------------------------------------------------------------------------- |
| Merge policy       | Merge with guardrails (CI green + Codex review clear); risky classes stop at PR |
| Issue selection    | Pre-flight triage together; queue = In Progress + Todo only                 |
| Backlog            | **Never read.** Wanted items are promoted to Todo during triage             |
| Cadence            | Serial, 4 runs/day every 6h (~5am / 11am / 5pm / 11pm, jittered)            |
| Failure policy     | ~3.5h timebox; 2 genuine attempts max; 3 consecutive failed runs → self-disable |
| Quota exhaustion   | Not a failure; next run resumes in-flight work (see Resume rule)            |
| Reporting          | Vacation Log issue in Linear; per-issue comments per CLAUDE.md              |
| Kill switch        | `STOP` comment on the Vacation Log (checked first, every run)              |
| Pipeline           | Standard 8-step: implement → /simplify → commit → PR → Codex review → fix → merge → /cleanup |
| Usage budget       | Subscription limits govern; no artificial cap                               |

## Vocabulary

- **auto:green** (label) — well-specified; work unattended; may auto-merge if in the mergeable class.
- **auto:yellow** (label) — attempt unattended, but always stop at an open PR; never merge.
- **Mergeable class** — app code, tests, docs. **Never auto-merged:** DB migrations,
  edge-function deploys, anything touching money/auth/RLS, and all yellows.
- **Vacation Log** — single Linear issue that is both the run journal and the control channel.
- **In-flight** — an issue with a leftover vacation worktree/branch; always resumed before new work.
- **needs-richard** (label) — finished-but-unmerged PR awaiting human review.
- **vacation-blocked** (label) — gave up after 2 genuine failures; blocker documented on the issue.

## Per-run algorithm

1. **Kill switch:** read the Vacation Log. `STOP` comment (from Richard) → disable the
   scheduled task, post an acknowledgment, exit.
2. **Health:** if `main` CI is red, **repairing it is the run's work item** — not an exit.
   A red base blocks every future run, so fixing it outranks queue work. Red-main runs do
   not count toward the circuit breaker until two consecutive repair attempts fail to turn
   main green. Revised 2026-08-02 after two order-dependent test failures (MYK9-170,
   MYK9-172) showed a red base can arrive at random, with no code change to blame.
3. **Resume-first:** if a vacation worktree/branch exists, that issue is in-flight —
   reorient from its commits + issue comments and continue it. Otherwise pick the next
   issue: greens before yellows, In Progress before Todo. Backlog is never read.
   Only issues carrying an `auto:` label are eligible — unlabeled issues (including the
   Vacation Log, MYK9-158, and anything created mid-vacation) are invisible to the queue.
4. **Work** in a fresh worktree using the standard 8-step pipeline. Commit checkpoints
   early and often (crash-only design: quota death is unannounced; the branch is the
   durable state).
5. **Finish:**
   - Mergeable class + CI green + Codex clear → merge from the main repo dir, /cleanup,
     Linear issue → Done, log comment.
   - Otherwise → open PR, label `needs-richard`, state-of-play comment, issue stays In Progress.
6. **Failure:** clean up the worktree, comment the exact blocker, label `vacation-blocked`
   after the 2nd genuine failure. Quota exhaustion never increments attempt counts.
7. **Circuit breaker:** 3 consecutive failed runs → disable self, post final log comment.

## Order-dependent tests — the standing hazard

CI runs `--sequence.shuffle`; local runs do not. A test that leaks state into another
therefore passes locally and fails **randomly** in CI, turning `main` red with no code
change to blame. Two were found on 2026-08-02 within one afternoon:

| Issue | Test | Leaked state |
| --- | --- | --- |
| MYK9-170 | `atShowLayoutSlotComponents` ContainmentBanner | module-scope `lastContainmentUntil` memo |
| MYK9-172 | `trialQueries.replication` `getTrialTimelineRows` | entry-count state across cases |

Both are the same shape: shared state outside a test's own scope, fixed by a `beforeEach`
reset — not a product change. A pre-departure **shuffle sweep** (run the suite shuffled
repeatedly, fix everything it surfaces) is the mitigation; the runner's red-main repair
path is the safety net for whatever the sweep misses.

Rule going forward: **run any test you add or touch with `--sequence.shuffle` 6+ times
before merging.** A single pass proves nothing.

## Denied commands (permission rules on this machine)

`git branch -D` / `-d` and `git checkout -- <path>` are denied and will **pause an
unattended run on a prompt nobody answers** (both hit on 2026-08-02). The runner must
never call them: merge with `gh pr merge --squash` without `--delete-branch`, remove the
worktree, and leave local branches for the Monday `branch-janitor` to report.

## Remote control (phone, Linear app)

- `STOP` comment on Vacation Log → halts everything.
- Move issue Todo → Backlog → removes it from the queue (status IS the enrollment switch).
- Move issue Backlog → Todo (+ green/yellow label) → adds it.
- Regrade by swapping `auto:green` ↔ `auto:yellow`.

## Standing authorization

Richard explicitly authorizes, for the duration of this task's enabled window
(2026-08-04 → 2026-08-14): unattended PR creation, Codex review runs, and merges to
`main` **within the mergeable class only**. `supabase db push`, `functions deploy`,
force-pushes, and any external-service posting beyond GitHub PRs/Linear remain
prohibited unattended. This is the Auto Mode carve-out CLAUDE.md requires.

## Pre-departure checklist (2026-08-02 → 08-03)

- [ ] **Land all concurrent agent sessions** (wind-down directives sent 2026-08-02: finish
      current unit only, follow-ups go to Backlog, /cleanup, stop). Then a repo-wide
      cleanup sweep: remove stale worktrees, delete merged branches. The autopilot only
      resumes `vacation-*` worktrees, but the floor should be clean regardless.
- [ ] Triage: settle the 6 In Progress (finish near-done together; state-of-play comments
      on the rest), grade the 21 Todo green/yellow, promote-or-leave pass over the 25 backlog.
- [ ] Create labels (`auto:green`, `auto:yellow`, `needs-richard`, `vacation-blocked`)
      and the Vacation Log issue.
- [ ] Create scheduled task `vacation-autopilot` (disabled).
- [x] Richard runs `sudo pmset -a autorestart 1` (power-failure recovery). Verified
      `autorestart 1` 2026-08-02.
- [ ] **Dress rehearsal (testing phase):** manually trigger one full run while Richard is
      present; it must complete one real issue end-to-end (pick → worktree → pipeline →
      merge or PR → log comment → cleanup). Fix the runner, not the vacation, if it can't.
      **This is also the tool-permission pre-approval pass** — scheduled tasks store
      approvals per task and reuse them, but an ungranted tool makes an unattended run
      PAUSE on a prompt with nobody there to answer. The rehearsal must exercise the real
      command set (git worktree/commit/push, `gh pr create`/`merge`, `codex review`,
      Linear writes) so every one of them is approved before departure. Note `git
      checkout --` was denied interactively on 2026-08-02; the runner must not depend on
      any denied command (use scoped `git apply -R` or `git restore` equivalents).
- [ ] Verify the kill switch in rehearsal: post `STOP`, trigger a run, confirm it
      disables itself; then remove `STOP` and re-enable.
- [ ] Enable the task the morning of departure.

## Return procedure (2026-08-14)

Disable the task, review `needs-richard` PRs, review `vacation-blocked` issues, read the
Vacation Log end-to-end, flip this plan to Complete and archive it.

## Testing phase

The dress rehearsal + kill-switch drill above are this plan's testing phase. The plan is
not "working" until both pass with Richard watching.
