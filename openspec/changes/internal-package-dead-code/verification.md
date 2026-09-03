# Verification: internal-package-dead-code

> **Status:** Active — local verification and independent review complete; CI/merge pending.

Verified 2026-09-03 in `codex/myk9-328-completion`, baseline `d5a495862`.
The missing temporary worktree's recorded patches were recovered into the
durable project worktree. Evidence below is from fresh runs there.

## Summary

| Dimension     | Result                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| Completeness  | 10/12 tasks; shipping and closure remain                                                                 |
| Correctness   | 167 removed declarations plus 8 exported TTL declarations and internal TTL plumbing inventoried          |
| Coherence     | Internal-only deletion; live consumers protected; email types-only; inert TTL removed without activation |
| Plan coverage | 100/100; no new capability specs required (`skip_specs: true`)                                           |

## Passing checks

- Nine affected package builds: scoring, scoring-ui, UI, core, ringside,
  notifications, email, secretary and replication.
- Package tests: scoring 66, scoring-ui 198, UI 249, core 253, ringside 371,
  notifications 54, secretary 140 — **1,331** total.
- Replication: **536 tests / 38 files**; includes four new public retention tests.
- Email is types-only with no runtime package tests; build/typecheck pass.
- Production email builders: **174 tests / 14 files**, including retained
  production-content assertions from the former parity tests.
- App at-show plus Heritage/Magazine email props: **521 tests / 61 files**.
- Retained dog replication adapter suite: **51 tests** after removing the three
  tests dedicated to deleted TTL internals.
- `pnpm typecheck`: pass including app, package, test and Edge-test types.
  Existing E2E diagnostic ratchet: 59 current / 62 baseline / 0 new.
- `pnpm lint`: pass; 18 existing warnings, zero errors.
- `pnpm qa:code-quality-ratchet`: pass; oversized files 146, any casts 23,
  TODO markers 17, direct core Supabase bypasses 3. No baseline weakening.
- App production/PWA build passes after TTL removal. Existing CSS syntax,
  dependency annotation, mixed-import and large-chunk warnings remain.
- `git diff --check` and strict OpenSpec validation pass. Comment-only files
  preserve original formatting to avoid unrelated churn.

## Replica safety evidence

The owner approved the public read/subscription boundary and publication,
review, merge and Linear closure sequence by replying "continue" on 2026-09-03.

- Characterization tests pass before removal: clean 45-day-old rows remain
  readable online and offline through point, list, field, index, scoped,
  status-bearing and local-ID reads, plus subscription snapshots.
- A temporary five-minute expiry mutation made both read tests fail; the
  mutation was removed along with the inert TTL implementation. All four
  public tests now pass. This was mutation-tested preservation, not a claim
  that the inert original behavior was broken.
- Aged pending edits survive a stale server write and authoritative
  reconciliation; only clean missing rows are removed.
- Storage transaction failure is reported without emitting a false-empty
  snapshot; after storage recovery, public reads and subscriptions recover.
- Existing capacity eviction, dirty protection, sync metadata and error tests
  remain. No IndexedDB clear/schema change, new sync policy, or remote write.

## Full app verification and corrected attempts

The first full app run completed: **18,715 passed, 5 failed, 9 skipped**
across 1,958 files. Three failures were tests mocking removed TTL internals;
those dedicated tests were deleted and all 51 retained dog-table tests pass.
Two unchanged native file-watcher tests timed out under the sandbox. Their
three-test file passes unchanged outside the sandbox. The fresh full app run
outside the sandbox passes: **18,717 tests / 1,957 files; 9 tests / 1 file
remain skipped as before** (289.33 seconds).

The first full replication run hit an unchanged MutationManager stress-test
race (499 observed versus 500). Its source already documents timing races.
The isolated stress file passed 2/2, then the full suite passed 536/536.
No mutation code, test thresholds or assertions were weakened. CI subsequently
reproduced the same failure twice; the authorized follow-up below fixes it.

### Mutation stress-test follow-up (2026-09-03)

The owner explicitly requested investigation and repair after CI run
33757345034 failed twice at 499/500. Original red reproduction:

```sh
cd packages/replication
taskpolicy -b pnpm exec vitest run src/MutationManager.stress.test.ts --coverage --sequence.shuffle --sequence.seed=328
```

The original two-test file failed the 500-unique-success assertion. Narrowing
to its mid-flush test reproduced the same failure in about five seconds.
Tagged, temporary logging showed a zero-delay automatic backoff retry already
running when the test's second explicit flush returned `[]`. The test awaited
an IndexedDB read before calling `destroy()`; canceling a timer at that point
cannot stop the upload it already started. A diagnostic wait observed all 500
IDs exactly once and an empty queue, confirming an unfinished retry rather
than a dropped mutation. Diagnostic logging and waits were removed.

The fix controls Date and timeout timers without auto-advancing, leaving IDB's
real setImmediate tasks alone. It removes the mid-test destroy/reuse sequence
and direct nextRetryAt rewrite. The test checks first-pass 499 successes,
backoff rejection of an immediate flush, and a single successful retry after
advancing wall time past the configured backoff including jitter. All 500 ID
membership, exact total-success count, failed-ID uniqueness and empty-queue
assertions remain. No production mutation code or coverage thresholds changed.

- Six background-scheduled, shuffled stress-file runs (seeds 328–333): 2/2
  tests pass in every run.
- Full background-scheduled replication suite with coverage and shuffle:
  536/536 tests, 38/38 files pass; coverage exceeds all unchanged gates.
- Package typecheck (including test files), focused ESLint with `--no-ignore`,
  and Prettier check pass. ESLint initially reported the repository's test-file
  ignore rule; rerunning explicitly included this test.
- Focused coverage reproductions also report global coverage below thresholds
  because only one file runs; the full-suite coverage check is the gate.
- Independent follow-up review: APPROVED (Avicenna, 2026-09-03). Fresh PR CI
  and confirmed merge remain required.

#### Newly exposed test-isolation follow-up

The second full coverage run (seed 333) passes the repaired stress test but
finishes 535/536: `MutationManager.startup-drain.test.ts` times out in
`serializes upload behind an in-flight restore`. Running that unchanged file
alone with seed 333 reproduces the same five-second timeout, independently
of the edited stress file. Selecting only the failing test passes in 31ms.
Its fixture reopens the same IndexedDB database
without clearing stores; preceding failure/backoff cases leave `mut-undo-1`.
Restore skips that existing ID, so the test's put-entry gate is never reached.
The startup-drain suite now clears only its pending and failed mutation stores
during setup. That prevents cross-test leakage while preserving the durable
queue across each individual reload scenario. No production code changed;
this failure is not waived or attributed to Supabase/container startup.
The exact shuffled seed now passes 6/6 startup-drain tests in 717ms; the fresh
full shuffled coverage run passes 536/536 tests across all 38 files. Package
typecheck, focused ESLint, formatting, diff checks and strict OpenSpec
validation pass. Independent follow-up review returned APPROVED.

Earlier setup corrections: a build overlapping dependency installation could
not find tsup; completed installation and rebuilt successfully. A first
email-test command named a nonexistent config; the correct command passed.
The new storage-failure fixture initially used `db.close()`, but the real
connection manager recovers automatically; it now faults the IndexedDB
transaction boundary to exercise an actual storage failure.

A later app-only typecheck completed app/test compilation but its E2E tsx
runner was blocked from opening a local IPC socket (EPERM). E2E and Edge-test
typechecks passed outside the sandbox; no code change was needed.

## Remaining gates

1. Local verification complete, including the fresh full app run.
2. Independent review returned APPROVED with no findings (Avicenna, 2026-09-03).
   Approved PR publication, required CI and confirmed merge remain.
3. Only then post final evidence to Linear, mark MYK9-328 Done, archive and
   clean this task's branch/worktree.

## Rollback and preservation

Deleted code is recoverable from Git. Production email HTML statements are
unchanged; Edge Function edits only correct ownership comments. No Supabase
deployment is required. Live Tabs, device detection, UKC timer, grouping,
podium/results, gate order, scoring store and formatter registration/listing
remain. App changes only remove the unused TTL constructor argument.

No visual/browser QA is claimed. Linear remains In Progress until merge.
