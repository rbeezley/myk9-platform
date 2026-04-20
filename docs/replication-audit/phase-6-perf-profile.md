# Phase 6: Performance Profile

**Date:** 2026-04-20
**Auditor:** Claude + Richard

## Tasks 6.1 / 6.2 / 6.3 — Manual measurement

Status: **pending** — requires running `pnpm dev:q` in a browser, clearing IDB, and capturing hydration timings + subscription counts. To be filled in during the manual portion of this phase.

## Task 6.4 — Large-queue stress test

**File:** `packages/replication/src/MutationManager.stress.test.ts`
**Tests added:** 2
**Result:** both pass (161ms total)

### Test 1: 500-mutation flush — no drops

Enqueues 500 `UPDATE` mutations spanning 5 tables (100 per table). A
tracking mock records every mutation id that reaches Supabase. After a
single `uploadPendingMutations()` call the assertions verify:

- `results.length === 500`, all `success: true`
- IDB queue empty after flush
- Every enqueued id appears in the observed set exactly once

**Result:** PASS.

### Test 2: mid-flush failure → retry without duplication

Mutation at position 249 (`mid-fail-target`) is targeted by a one-shot
Supabase mock that throws `TypeError: fetch failed` on first call, then
succeeds. After flush 1:

- 499 mutations succeeded and were removed from IDB
- `mid-fail-target` remains in IDB with `retries=1`
- `nextRetryAt` is zeroed so flush 2 doesn't skip it

After flush 2:

- `mid-fail-target` is retried and succeeds
- It appears exactly once in `observedIds` (the retry call, not the failed one)
- IDB queue is empty; no id is duplicated

**Result:** PASS.

### Bug found during authoring

**Root cause:** `vi.useFakeTimers({ shouldAdvanceTime: true })` caused
`withTimeout`'s 15-second `setTimeout` sentinel to fire during
sequential IDB iteration over 500 rows (~22s wall time), producing
spurious `TimeoutError`s for mutations processed after the 15s mark.
Those mutations were classified as retryable and left in the queue,
failing the "queue empty after flush" assertion.

**Fix:** stress tests use `vi.useRealTimers()` instead. The mock resolves
synchronously so `withTimeout` never actually times out.

**Impact on production code:** none — this is a test harness issue only.
The `withTimeout` sentinel is correct for production use where network
calls can take several seconds each.

## Task 6.5 — Flaky-network test

(populated below)

## SLO targets

(populated after manual measurement)
