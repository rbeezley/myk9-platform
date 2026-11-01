# Planted-bug audit, first run (2026-11-01, MYK9-1653)

Stryker mutates four TypeScript helpers (cart, score-validator, placement, replication-conflict). This audit covers show-day checks outside its reach: run order, the offline mutation queue, check-in writes, results release, and the placement SQL. Each mutant is one hand-written realistic defect kept as a `.patch`; the audit applies it, runs the named checks, and records whether any check went red.

## Command

```bash
pnpm qa:planted-bugs                      # all local mutants, from a clean worktree
pnpm qa:planted-bugs -- --only check-in   # substring match on mutant id
```

The runner refuses to start on a dirty tree, runs every check once on the clean tree and aborts if any is already red (a red baseline would count every mutant as caught), then for each mutant does `git apply`, runs the checks, `git apply -R`, and prints `restored: clean` after asserting `git status --porcelain` is empty. It aborts the whole run if the tree is not clean. A mutant is **caught** if any of its checks exits non-zero. Total runtime is a few minutes.

## Results

SQL mutants (`kind: ci`) are patches against the latest `recalculate_class_placements` migration; the behaviour tests under `supabase/tests/` run only in CI (no container runtime on the development Mac), so they are listed, not run. Their verdict needs a CI run with the patch applied.

| Mutant                                                      | Area            | Result                   | Caught by                                                                          |
| ----------------------------------------------------------- | --------------- | ------------------------ | ---------------------------------------------------------------------------------- |
| run-order/01 comparator swapped, dogs run last-to-first     | run-order       | caught                   | ringside `runQueue.test.ts`                                                        |
| run-order/02 in-ring dog left in the waiting queue          | run-order       | caught                   | ringside `runQueue.test.ts`                                                        |
| run-order/03 scored dog stays queued                        | run-order       | caught                   | ringside `runQueue.test.ts`                                                        |
| run-order/04 `nextPendingCandidates` returns limit+1        | run-order       | caught                   | ringside `runQueue.test.ts`                                                        |
| run-order/05 armband tie-break inverted                     | run-order       | caught                   | ringside `runQueue.test.ts`                                                        |
| offline-queue/01 sequence order reversed (newest first)     | offline-queue   | caught                   | replication `mutation-ordering`, `MutationManager` tests                           |
| offline-queue/02 dependency edge recorded only when missing | offline-queue   | caught                   | replication `mutation-ordering`, `MutationManager` tests                           |
| offline-queue/03 overflow threshold `>=` to `>`             | offline-queue   | caught                   | replication `mutation-queue-capacity.test.ts`                                      |
| check-in/01 check-in RPC always sends `checked-in`          | check-in        | **MISSED**               | none                                                                               |
| check-in/02 self check-in RPC always sends `checked-in`     | check-in        | **MISSED**               | none (the test only ever uses `checked-in`)                                        |
| check-in/03 report counts `no-status` entries as checked in | check-in        | **MISSED**               | none (`markCheckInReportCheckedIn` has no test)                                    |
| results-release/01 `manual_release` shows at class complete | results-release | caught                   | secretary `visibility` tests                                                       |
| results-release/02 exhibitors bypass visibility (inverted)  | results-release | caught                   | secretary `visibility` tests                                                       |
| results-release/03 class override applied before trial      | results-release | caught                   | secretary `visibility` tests                                                       |
| sql-placement/01 soft-deleted entry still placed            | sql-placement   | CI-run (not run locally) | `placement_soft_delete_ranking_test.sql`, `myk9_1473_coin_flip_tie_order_test.sql` |
| sql-placement/02 ribbon range ends at 3rd (off-by-one)      | sql-placement   | CI-run (not run locally) | same                                                                               |
| sql-placement/03 most faults placed first                   | sql-placement   | CI-run (not run locally) | same                                                                               |
| sql-placement/04 NQ entries eligible for placement          | sql-placement   | CI-run (not run locally) | same                                                                               |

14 local mutants: 11 caught, 3 missed. Every run printed `restored: clean`.

## Missed mutants (follow-ups, not fixed here)

- check-in/01: pin `updateCheckInStatus` queueing the RPC with `fields: { check_in_status: <the status passed> }` for a status other than `checked-in` (e.g. `at-gate`).
- check-in/02: assert `self_checkin_entry` receives `p_new_status` for a non-default status.
- check-in/03: unit-test `markCheckInReportCheckedIn`: a `no-status` sibling is not counted and `summaryStatus` is `partial`.

## Adding a mutant

1. Edit the source to introduce one realistic defect, `git diff -- <file> > scripts/qa/planted-bugs/<area>/<nn>-<slug>.patch`, then `git restore <file>`.
2. Add an entry to `scripts/qa/planted-bugs/manifest.json`: `id`, `area`, `patch`, `rationale`, `checks` (shell commands run from the repo root), `kind` (`local` or `ci`; a `ci` entry needs a `note`).
3. Confirm the patch applies on HEAD (`git apply --check`) and run `pnpm qa:planted-bugs -- --only <id>`. Never commit with a mutant applied.
