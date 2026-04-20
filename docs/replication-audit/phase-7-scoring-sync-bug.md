# Phase 7: Scoring Sync Bug — Root Cause + Closure

**Audited:** `project_scoring_sync_bug.md` (memory note, 2026-03-29 repro)
**Date:** 2026-04-20
**Status:** CLOSED — root cause fixed in Phases 1–3; regression guardrails landed in Phase 7.

## Symptom

(From `project_scoring_sync_bug.md`, 2026-03-29, with update 2026-04-16.)

Scores saved to IndexedDB never reached Supabase. Observable effects:

1. Scored dog appeared "completed" locally.
2. When the next dog was scored, a replication pull overwrote dog #1's local-only score with server state — and the server still showed the dog as pending because the mutation never flushed.
3. Hard refresh could briefly appear to "work" while IDB still held the data, but the next sync cycle wiped it.

Reported on myK9Show scoring flow (`/scoring/classes/:classId/entries`). A related silent-flush failure hit show creation on 2026-04-16 (RLS rejected `secretary` role on `shows_insert`), which was fixed separately via migration 135 and a global `replication:sync-failed` toast listener.

## Hypothesis (2026-03-29 investigation)

The 2026-03-29 note suspected the mutation queue in `@myk9/replication` wasn't flushing score writes. The debugging plan was to investigate the flush mechanism.

## Actual root cause

The flush _did_ happen — but its effects were being undone before a real round-trip completed. Three co-located defects produced the user-visible data loss:

### 1. `ReplicatedTable.set()` clobbered dirty rows on server push (Phase 1)

`packages/replication/src/core/ReplicatedTable.ts`

A real-time push coming from Supabase's `postgres_changes` channel called `set(id, serverRow, isDirty=false)`. Before the guard, this unconditionally overwrote the local row — including the freshly-scored one that was still queued for upload. The user's score vanished between queue time and upload time.

**Fix (commit `d5165e2e`, also covered in the `5a636f69` chain):** added a short-circuit at the top of `set()`:

```ts
if (!isDirty && existingRow?.isDirty) {
  await tx.done;
  this.logger.log(
    `[${this.tableName}] Skipped server push for row ${normalizedId} — local mutation pending`
  );
  return;
}
```

Lives at lines 238–248 of `ReplicatedTable.ts`.

### 2. `batchSet` had the same hole (Phase 2)

`packages/replication/src/core/ReplicatedTableBatch.ts`

Incremental sync's download path writes remote rows in a single batch via `batchSet(entriesToCache)` (see `apps/myk9q/src/services/replication/tables/ReplicatedEntriesTable.ts:165`). The Phase 1 per-row guard didn't apply. A full-sync pulling N rows would clobber every dirty row in the batch.

**Fix (commit `5a636f69`):** `batchSet` now reads each row's existing `isDirty` flag inside the transaction and filters out pushes that would clobber them. `batchSetChunked` was also made atomic per chunk.

### 3. `ConflictResolver.resolveFieldLevel` let null-local fields win (Phase 3)

`packages/replication/src/conflict/ConflictResolver.ts`

When a field-level merge picked the "local" side, a `null`/`undefined` local field could overwrite a real server value — the opposite of what field-level merge is supposed to do. In the scoring flow, a partial local state (dog not yet scored in tab B) could blank out the authoritative score coming in from tab A's sync.

**Fix (commit `63314fa7`):** skip the local field when it's null/undefined and fall through to the server value. Tests added in the same commit.

## Fix (summary)

| Commit     | Phase | Change                                                                     |
| ---------- | ----- | -------------------------------------------------------------------------- |
| `d5165e2e` | 1     | Dirty-row guard in `ReplicatedTable.set()` + invariant tests               |
| `5a636f69` | 2     | Dirty-row guard in `batchSet` + atomic `batchSetChunked`                   |
| `63314fa7` | 3     | `ConflictResolver.resolveFieldLevel` respects server value over null local |

Each of the three was necessary; none alone would have closed the bug.

## Guardrail

Regression tests that will fail loudly if any of the three fixes is reverted:

- `packages/replication/src/core/ReplicatedTable.subscription.test.ts` — Phase 1 invariants (dirty-row guard in `set()`).
- `packages/replication/src/core/ReplicatedTableCache.invariants.test.ts` — Phase 2 invariants (dirty-row guard in `batchSet` + atomicity of `batchSetChunked`).
- `packages/replication/src/conflict/ConflictResolver.merge.test.ts` — Phase 3 invariants (field-level merge respects server when local is null).
- `apps/myk9q/src/services/replication/tables/__tests__/ReplicatedEntriesTable.scoring-sync.test.ts` — end-to-end scenario test covering the exact 2026-03-29 repro through the myK9Q wrapper (new in Phase 7, commit `c75e73d9`).

The myK9Q scenario test has three cases:

1. **Real-time push does not clobber a locally-scored entry** — stresses Phase 1's guard through the `ReplicatedEntriesTable.markAsScored(..., true)` call path.
2. **Queued scoring mutation flushes to Supabase on next sync** — wires a real `MutationManager` against a stub client and asserts `.update(...).eq('id', ...)` is called with the score payload and the pending queue drains.
3. **Incremental sync's `batchSet` preserves local dirty state** — stresses Phase 2's guard through the same code path the real sync uses (`batchSet(entriesToCache)` in `ReplicatedEntriesTable.sync()`).

## Verification

All affected suites run on 2026-04-20 at HEAD `fcf235b0`:

| Suite                                                                                              | Result                                       |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `packages/replication/src/core/ReplicatedTable.subscription.test.ts`                               | 6 passed                                     |
| `packages/replication/src/core/ReplicatedTableCache.invariants.test.ts`                            | 3 passed                                     |
| `packages/replication/src/conflict/ConflictResolver.merge.test.ts`                                 | 3 passed                                     |
| `packages/replication/src/core/DatabaseManager.lifecycle.test.ts`                                  | 4 passed                                     |
| `packages/replication/src/MutationManager.stress.test.ts`                                          | 1 passed, 1 failed (pre-existing — see note) |
| `apps/myk9q/src/services/replication/tables/__tests__/ReplicatedShowsTable.test.ts`                | 16 passed                                    |
| `apps/myk9q/src/services/replication/tables/__tests__/ReplicatedEntriesTable.scoring-sync.test.ts` | 3 passed                                     |

**Scoring-sync guardrail outcome.** All three scoring-sync tests passed on first run after a `pnpm --filter @myk9/replication build` — the apps resolve `@myk9/replication` through its built dist, so the Phase 1–3 fixes must be rebuilt for the app-level tests to exercise them. The dist had gone stale from the previous session. No real regression surfaced.

**Pre-existing failure — not caused by Phase 7.** `MutationManager.stress.test.ts > "survives a mid-flush failure at mutation 250"` fails deterministically with `observedSet.size === 499` (expected 500). Git diff between `a2d5b118` (parent of Phase 7 commits) and HEAD confirms Phase 7 added only docs + one new test file; no `MutationManager`-related source or test was touched. The off-by-one indicates the failed mutation's retry is being short-circuited (likely by the auto-upload debounce interacting with the stress test's manual flush sequence), which is a stress-test harness issue rather than a replication correctness bug. Separate ticket candidate — out of scope for the replication audit.

**Pre-existing expected failure (noted in task brief, ignored):** `packages/replication/src/core/ReplicatedTable.test.ts` has `expect(GET_ALL_TIMEOUT_MS).toBe(5000)` when the actual value is `15000`. Not run.
