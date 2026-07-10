## Context

The secretary responsibility verification sweep audited all 44 coverage rows against current code with ~600 focused tests. It found six concrete defects (D1–D6) clustered in five disjoint file sets, plus small cleanups. All are code-level; none require schema changes. The app is offline-first: show-day writes must go through `@myk9/replication`, and this batch fixes the one verified violation (judge assignments).

## Goals / Non-Goals

**Goals:**

- Fix all six defects with unit-test evidence, one coherent commit-per-cluster.
- Move the affected coverage-matrix rows to verified states backed by code evidence.
- Keep every fix on the existing canonical surfaces — no new pages, routes, or dialogs beyond a confirmation for un-release.

**Non-Goals:**

- Physical evidence gates (venue print hardware, offline/reconnect rehearsal, real-user tests) — tracked separately as manual gates.
- Rings-as-a-feature (S1.4 product decision — reword to run-order-only is handled as a docs cleanup, not code).
- Volunteer attendance/reassignment (confirmed deferred).
- AKC results recipient verification (manual gate; tracked in OPEN-TODOS.md).

## Decisions

- **D1 — unify on the existing canonical key rather than adding a second invalidation.** `ShowWorkbenchShowDeskPage.tsx` and `ShowDetailsPage.tsx` use the ad-hoc `['secretary-show-entries', showId]` key while the action executor patches `queryKeys.showEntries(showId)`. Preferred fix: migrate both pages to `queryKeys.showEntries(showId)` so one cache serves both, falling back to adding the invalidation only if the migration surfaces incompatible query shapes (different select/transform). Rationale: two independently named caches for the same data is the root cause; patching over it leaves the trap for the next surface.
- **D2 — mirror the move-up undo pattern exactly.** `scratchShowMapEntry` gains a returned "previous state" snapshot (status, check-in, notes) and `useShowMapActionExecutor` surfaces a sonner toast with an Undo action calling a new `undoShowMapScratch`, same shape as `undoLastMoveUp`. Writes stay on `updateReplicatedDayOfScratch`/replicated update paths.
- **D3 — route through `ReplicatedJudgeAssignmentsTable`, keep function signatures.** The three writer functions in `judges/reads.ts` keep their exported signatures so callers don't change; only their internals switch from `untypedFrom('judge_assignments')` to the replicated table wrapper. Delete-then-insert flows must map to the wrapper's update/delete semantics.
- **D4 — un-release is a first-class mutation with explicit confirmation.** Add `useUnreleaseResults` (clears `results_released_at`/`results_released_by` via the same replicated per-class write pattern as `useReleaseResults`, `Promise.allSettled` per class). `BulkOperationsBar` shows "Hide results" only when released classes are selected, with a confirmation dialog noting that already-viewed pages won't refresh retroactively. Alternative considered: reusing `useReleaseResults` with a flag — rejected; separate hook keeps the release path's irreversibility warnings honest and the tests independent.
- **D5 — dedicated `checkNumber` parameter, assertion-first test.** `updateEnrollmentPaymentStatus` accepts an optional `checkNumber` and writes `check_number` alongside `payment_reference`. Dialogs pass the check-number field through the new parameter instead of overloading `reference`. Per CLAUDE.md, write the `expect(...).toHaveBeenCalledWith(...)`/update-payload assertion first and run it red before the fix.
- **D6 — Outstanding stat card, no new table column initially.** Add an "Outstanding" card to `EntryStatsCards.tsx` reusing `calculateFinancialReportTotals`' pending/outstanding logic (extract a shared helper if import boundaries require). A per-row dollar column is deferred unless the card proves insufficient — smallest change that closes the reconciliation gap on-page.

## Risks / Trade-offs

- [D1 key migration touches two pages' query shapes] → compare `queryFn`/select transforms before unifying; fall back to added invalidation if shapes differ; run both pages' test suites.
- [D3 wrapper semantics differ from raw upsert] → verify `ReplicatedJudgeAssignmentsTable` API supports the delete/insert patterns used; add unit tests for each of the three functions against the wrapper mock.
- [D4 un-release interacts with public results gate] → the public gate reads `results_released_at`; clearing it re-hides results by construction. Confirm the release-gate view/query has no caching layer that would need invalidation.
- [D5 double-write of reference and check_number] → keep writing `payment_reference` as today for backward display compatibility; `check_number` is additive.

## Migration Plan

Single PR from this worktree branch; no schema or deploy steps. Rollback = revert PR.

## Open Questions

- None blocking; D6 table-column follow-up left to post-batch review.
