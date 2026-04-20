# Phase 3: Conflict Resolution Audit — ConflictManager.ts + ConflictResolver.ts

**Audited:** packages/replication/src/conflict/ConflictManager.ts (201 lines), ConflictResolver.ts (221 lines)
**Date:** 2026-04-20
**Auditor:** Claude + Richard

## Scope

Last-write-wins semantics, field-level merge, tiebreakers, pending-mutation awareness during merge.
Out of scope: pending-mutation overwrite protection (Phase 1/2 — already fixed), the mutation queue itself (MutationManager — previously audited).

## Method map

### ConflictManager.ts

| Method                    | Lines   | Responsibility                                                                                                                                                |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `constructor`             | 51–53   | Accepts optional custom `ConflictResolver`; falls back to the module-level `conflictResolver` singleton.                                                      |
| `addEventListener`        | 58–63   | Registers a typed event handler; lazily creates the handler set for first subscription on a type.                                                             |
| `removeEventListener`     | 68–72   | Removes a handler from the set; no-ops if the type was never subscribed.                                                                                      |
| `emit` (private)          | 77–82   | Fans out a `ConflictEvent` to all registered handlers for its type.                                                                                           |
| `getConflictStats`        | 87–89   | Returns a shallow copy of the live stats object (total / resolved / pending).                                                                                 |
| `getPendingConflicts`     | 94–96   | Returns all pending `Conflict` objects as an array.                                                                                                           |
| `getConflictById`         | 101–103 | Looks up a single pending conflict by its generated ID.                                                                                                       |
| `getResolutionHistory`    | 108–110 | Returns a shallow-copy array of all resolved conflicts.                                                                                                       |
| `resolveConflictManually` | 115–146 | Stamps a conflict as resolved, moves it from pending to history, updates stats, emits `conflict_resolved`.                                                    |
| `handleSyncConflict`      | 152–197 | Entry point called by `ReplicatedTable`/`SyncEngine`: delegates to resolver, decides automatic vs. manual, emits events, stores pending conflict when needed. |

### ConflictResolver.ts

| Method                        | Lines   | Responsibility                                                                                                                                                                              |
| ----------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `constructor`                 | 13–15   | Accepts optional logger; defaults to `noopLogger`.                                                                                                                                          |
| `resolveLWW`                  | 20–89   | Last-write-wins by `updated_at` millisecond comparison, then microsecond string comparison, then ID lexicographic tiebreaker, then remote fallback.                                         |
| `resolveServerAuthoritative`  | 91–93   | Always returns `remote` entity unchanged.                                                                                                                                                   |
| `resolveClientAuthoritative`  | 95–97   | Always returns `local` entity unchanged.                                                                                                                                                    |
| `resolveFieldLevel`           | 99–126  | Starts from `remote` as base; overwrites each field listed in `authority.clientFields` with the local value; records fields that differed (excluding null/undefined local values).          |
| `resolve`                     | 128–143 | Strategy router: dispatches to the four strategy methods based on `ConflictStrategy` enum value; throws on `field-level-merge` without authority; falls back to LWW for unknown strategies. |
| `isUndefinedOrNull` (private) | 148–150 | Value guard used internally to detect absent values.                                                                                                                                        |
| `findConflictingFields`       | 155–181 | Walks all keys across both objects, skips ignored fields, deep-compares via JSON.stringify for object values; returns array of conflicting field names.                                     |
| `logConflict`                 | 186–218 | Logs conflict details via the injected logger; also fires a `CustomEvent` on `window` for browser-side monitoring.                                                                          |

## Findings

### Correctness

**B1 — MEDIUM — `resolveFieldLevel` silently drops a locally-mutated field when its local value is `null` or `undefined`**
File: `ConflictResolver.ts` lines 110–115

```ts
if (
  localValue !== remoteValue &&
  !this.isUndefinedOrNull(localValue) &&
  !this.isUndefinedOrNull(remoteValue)
) {
  conflictingFields.push(field);
}
merged[field] = localValue; // <-- always overwrites
```

The conflict detection skips the field when `localValue` is null/undefined (reasonable — null is not a meaningful "write"). However the `merged[field] = localValue` assignment still executes unconditionally, overwriting the server's real value with `null`. Result: a locally-nulled field clobbers the server's value even though the code intended to treat null-local as "no local opinion."

Proposed fix: guard the assignment with the same null check:

```ts
if (field in local && !this.isUndefinedOrNull(local[field])) {
  merged[field] = local[field];
}
```

**B2 — LOW — LWW tiebreaker falls through to `remote` with `hadConflict: false` when IDs are identical**
File: `ConflictResolver.ts` lines 82–88

When `updated_at` strings are byte-identical AND IDs are identical, the function returns `hadConflict: false`. That is technically correct (the two rows are indistinguishable) but confusing for callers trying to detect a real simultaneous write from two different devices with the same row ID. No data-loss risk; caller gets `remote`, which is fine. Documented as low.

**B3 — LOW — `handleSyncConflict` ignores the `base` parameter entirely**
File: `ConflictManager.ts` lines 152–160

The method signature accepts a `base?: T` (three-way merge anchor) but passes only `local` and `remote` to `resolver.resolve`. The base is stored in the `Conflict` object for manual resolution UI but is never used by the automated path. If a future strategy wants true three-way merge this will silently produce wrong output. Currently low because no caller relies on three-way merge, but worth tracking.

**B4 — LOW — `resolveFieldLevel` does shallow merge only**
File: `ConflictResolver.ts` lines 104–115

`merged[field] = localValue` is a reference copy. For nested-object client fields both sides will end up sharing the same object reference if not spread. A mutate-after-resolve scenario could corrupt the resolved result. In practice, rows stored in IDB are plain JSON, so this is low risk, but the contract is not documented.

### Error surfacing

**E1 — LOW — `resolve` falls back to LWW silently for unknown strategies**
File: `ConflictResolver.ts` line 141

`default: return this.resolveLWW(local, remote)` — an unrecognised strategy string is silently treated as LWW. The test for this calls it "expected fallback behaviour," but a programming error (typo in strategy name) would produce a data-loss silent merge instead of a clear error. Severity low because TypeScript enforces `ConflictStrategy` at compile time in typed callers; only reaches the default via the cast in the test.

**E2 — LOW — `emit` swallows exceptions thrown by handlers**
File: `ConflictManager.ts` lines 79–81

```ts
handlers.forEach(handler => handler(event));
```

A throwing handler halts the `forEach` loop, silencing all subsequent handlers. Should use `try/catch` per-handler or `Promise.allSettled`-style iteration. Currently low because the event system is for monitoring only, not control flow.

### Invariants

**I1 — MEDIUM — `handleSyncConflict` uses a flawed gate for "needs manual review"**
File: `ConflictManager.ts` lines 163–164

```ts
const isAutomatic = result.strategy !== 'field-level-merge' || !result.conflictingFields?.length;
```

This means: a `field-level-merge` result with conflicting fields is placed in the pending queue AND emits `manual_resolution_required`. But `resolveFieldLevel` already sets `automatic: true` — its own result says it was resolved automatically. The manager overrides that to `false` (non-automatic) solely because conflicting fields exist, which contradicts the resolver's semantics. The manager then returns `{ ...result, automatic: isAutomatic }` overwriting the resolver's `automatic: true`. This inconsistency means callers get back `automatic: false` on a field-level merge even when the merge succeeded without human input.

Consequence: spurious pending conflicts and events for every successful field-level merge that touches overlapping fields. No data-loss, but the conflict queue fills with phantom entries.

**I2 — LOW — `stats.total` is only incremented for non-automatic conflicts**
File: `ConflictManager.ts` lines 180–181

`total` counts only conflicts pushed to the pending queue, not all conflicts handled. Automatic LWW resolutions are never counted. The stat is labelled "total" but means "total requiring manual review," which is misleading.

### Resource cleanup

The listeners map and pending-conflict map in `ConflictManager` have no eviction policy. A long-running session accumulates resolution history indefinitely. Low risk for the current single-device app; would matter for long-running server processes. Documented only.

### Concurrency

**C1 — LOW — `handleSyncConflict` is not guarded against concurrent calls for the same entity**
File: `ConflictManager.ts` lines 152–197

Two concurrent real-time events for the same row could each independently enter `handleSyncConflict`, each create a `conflict-{id}-{Date.now()}` key, and push two pending-conflict entries. Because `Date.now()` is millisecond resolution, rapid back-to-back calls could collide on the key. In practice, real-time events for a single row arrive serially via the websocket channel, so this is theoretical.

### Offline semantics

**O1 — LOW — ConflictResolver is not offline-aware; it always defers to `updated_at` without accounting for clock skew**
File: `ConflictResolver.ts` lines 24–56

An offline client's clock may drift from the server clock. The client's `updated_at` is set locally (by the mutation serialiser), so a client ahead of server time will always win LWW even if the server had a newer authoritative write. Phase 1/2 fixes prevent the server from clobbering a pending mutation, but after the mutation flushes, clock skew could still cause an old flushed value to beat a newer server update. Severity low because the 15 s mutation flush window and typical NTP drift make this a rare edge.

### Test coverage gaps

**T1 — Missing — `resolveFieldLevel` with null local value clobbers server value (B1)**
No test exercises the path where a `clientField` has `null` on local but a real value on remote, then checks whether the server value is preserved. The existing test (`should not report conflict when local client field is null`) checks `hadConflict` only, not the merged value.

**T2 — Missing — `handleSyncConflict` with field-level strategy and conflicting fields**
The only test for `handleSyncConflict` uses LWW. No test verifies the `isAutomatic` gate (I1 finding).

**T3 — Missing — Simultaneous-timestamp tiebreaker with no `id` field**
`resolveLWW` has an `id` tiebreaker but no test for the path where both `id` fields are absent or empty strings.

**T4 — Missing — `resolveFieldLevel` overwrites server field with local `null` (B1 regression)**
The existing null test (`should not report conflict when local client field is null`) checks `hadConflict` only. It does not assert that `merged.status` retains the server value `'registered'` after the merge. This gap means B1 was live with passing tests.

## Remediation plan

| #   | Finding                                                               | Action                                                                                                                                                                |
| --- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | B1 (MEDIUM) — null local clobbers server value in `resolveFieldLevel` | **FIXED** in `ConflictResolver.ts` line 114: guarded assignment with `!isUndefinedOrNull(localValue)`. Regression covered by `ConflictResolver.merge.test.ts` test 3. |
| R2  | I1 (MEDIUM) — `isAutomatic` gate contradicts resolver semantics       | Respect `result.automatic` from resolver instead of re-deriving from strategy+conflictingFields; or document the manager's override intent explicitly.                |
| R3  | E2 (LOW)                                                              | Wrap each handler call in try/catch so one throwing handler does not silence the rest.                                                                                |
| R4  | B3 (LOW)                                                              | Document `base` parameter as "stored for manual UI only; not used in automated path." Add TODO for three-way merge.                                                   |
| R5  | I2 (LOW)                                                              | Rename `total` to `totalManualRequired` or count all conflicts including automatic ones.                                                                              |
