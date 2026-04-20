# Phase 1: Read Path Audit — ReplicatedTable.ts

**Audited:** packages/replication/src/core/ReplicatedTable.ts (614 lines)
**Date:** 2026-04-20
**Auditor:** Claude + Richard

## Scope

Read path: `fetchAll`, `fetchOne`, `subscribe`, real-time merge into IDB, initial hydration.
Out of scope: mutations (covered by MutationManager audit), conflict resolution (Phase 3).

## Method map

| Method                                  | Lines   | Responsibility                                                                                                                                             |
| --------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `constructor`                           | 56–83   | Injects logger/TTL deps, initialises `cacheManager` and `batchManager` with factory closures.                                                              |
| `setMutationManager`                    | 96–98   | Wires the shared `MutationManager` reference used by subclass writes.                                                                                      |
| `getMutationPendingCount`               | 104–107 | Returns pending mutation count from `MutationManager`; 0 if none wired.                                                                                    |
| `queueMutation`                         | 113–130 | Delegates a write-op to `MutationManager`; logs a warning and returns null when none is set.                                                               |
| `getTableName`                          | 139–141 | Returns the table name string (accessor).                                                                                                                  |
| `init`                                  | 151–154 | Opens (or returns cached) shared IDB connection via `databaseManager.getDatabase`.                                                                         |
| `runTransaction`                        | 159–180 | Wraps an IDB transaction, registers it in the stampede-prevention tracker, and returns the result.                                                         |
| `get`                                   | 189–215 | Reads a single row by ID from IDB; evicts expired rows; updates LRU/LFU metadata.                                                                          |
| `set`                                   | 220–261 | Upserts a row with optimistic-lock version check; marks dirty flag; notifies listeners.                                                                    |
| `delete`                                | 266–273 | Removes a single row from IDB by ID and notifies listeners.                                                                                                |
| `queryByField`                          | 282–361 | Queries IDB via a compound index; includes a timeout/abort race; falls back to full table scan if the index is missing.                                    |
| `queryIndex`                            | 366–377 | Thin router: delegates to `queryByField` for known indexed fields, otherwise does a linear `getAll` filter.                                                |
| `getAll`                                | 382–415 | Returns all non-expired rows for this table; races against `GET_ALL_TIMEOUT_MS`; swallows error and returns `[]` on failure; drives circuit-breaker reset. |
| `acquireRowLock` (private)              | 421–433 | Spin-waits on a per-row promise chain to serialise concurrent `optimisticUpdate` calls.                                                                    |
| `releaseRowLock` (private)              | 435–441 | Resolves the row-lock promise and removes it from the map.                                                                                                 |
| `optimisticUpdate`                      | 446–475 | Acquires row lock, reads current version, runs caller's update fn, calls `set` with `expectedVersion`.                                                     |
| `batchSet`                              | 483–485 | Delegates to `batchManager.batchSet`.                                                                                                                      |
| `batchSetChunked`                       | 487–489 | Delegates to `batchManager.batchSetChunked`.                                                                                                               |
| `batchDelete`                           | 491–493 | Delegates to `batchManager.batchDelete`.                                                                                                                   |
| `clearCache`                            | 495–507 | Clears rows via `batchManager` then resets sync metadata to force a full re-sync.                                                                          |
| `subscribe`                             | 511–513 | Registers a data-change listener via `cacheManager`; returns an unsubscribe function.                                                                      |
| `notifyListeners` (protected)           | 515–517 | Delegates to `cacheManager.notifyListeners` (debounced).                                                                                                   |
| `isExpired` (protected)                 | 519–521 | Proxy to `cacheManager.isExpired`.                                                                                                                         |
| `refreshTimestamps`                     | 523–525 | Delegates to `cacheManager.refreshTimestamps`.                                                                                                             |
| `cleanExpired`                          | 527–529 | Delegates to `cacheManager.cleanExpired`.                                                                                                                  |
| `estimateTotalSize`                     | 531–533 | Delegates to `cacheManager.estimateTotalSize`.                                                                                                             |
| `getCacheStats`                         | 535–537 | Delegates to `cacheManager.getCacheStats`.                                                                                                                 |
| `evictLRU`                              | 539–541 | Delegates to `cacheManager.evictLRU`.                                                                                                                      |
| `getSyncMetadata`                       | 543–545 | Delegates to `cacheManager.getSyncMetadata`.                                                                                                               |
| `updateSyncMetadata`                    | 547–549 | Delegates to `cacheManager.updateSyncMetadata`.                                                                                                            |
| `getAllLocalIds`                        | 555–568 | Reads all non-expired IDs from IDB into a `Set<string>` (used for stale-entry detection).                                                                  |
| `removeStaleEntries`                    | 570–599 | Deletes IDB rows not present in the provided server ID set; preserves dirty rows.                                                                          |
| `sync` (abstract)                       | 608     | Subclasses implement full/incremental sync against Supabase.                                                                                               |
| `resolveConflict` (abstract, protected) | 613     | Subclasses implement last-write or custom conflict resolution.                                                                                             |

## Findings

### Correctness

**Finding C-1 — HIGH: `acquireRowLock` is not atomic; two concurrent callers can both acquire the lock**

`acquireRowLock` uses a `while (this.rowLocks.has(id)) await this.rowLocks.get(id)` spin loop. When two callers are waiting on the same lock and `releaseRowLock` resolves the promise, both awaiters resume in the same microtask flush. Both re-enter the `while` check at the same time: the map entry was already deleted by `releaseRowLock`, so both see `has(id) === false` and both proceed to set a new lock. The critical section in `optimisticUpdate` (read-then-write) is therefore not serialised — two callers can both read the same version, both call `set(..., currentVersion)`, and the second one throws a spurious "Concurrent modification detected" error even when no real conflict occurred. Under high contention this is a livelock / silent data loss risk.

`ReplicatedTable.ts:421–441` — Fix: replace with a proper async queue (a `Promise` chain that always appends the next work unit regardless of concurrent entry), or use a `Map<string, Promise>` accumulator pattern where each new caller chains onto the _tail_ of the existing promise, not onto a shared completed promise.

**Finding C-2 — MEDIUM: `getAll` swallows all errors and returns an empty array**

`ReplicatedTable.ts:406–414` — The `catch` block logs the error and returns `[]` unconditionally. Callers (including `notifyListeners`, which reads via `getAllData → getAll`) cannot distinguish "table is empty" from "IDB is broken." A caller that is waiting for rows to appear (e.g., a UI component) will silently show nothing instead of surfacing the error. This is particularly dangerous because the circuit breaker only trips after three consecutive failures — during the first two failures every caller silently receives empty data.

Fix: surface the error to the caller OR add a callback/event so the UI can show a degraded-mode banner. Minimum: make `getAll` return `null` (or throw) on failure and update all callers to handle that.

**Finding C-3 — LOW: `get` updates LRU metadata in a non-transactional read-then-write**

`ReplicatedTable.ts:209–213` — `get` reads the row, mutates `lastAccessedAt` and `accessCount`, then calls `db.put(...)` outside the original `db.get` transaction. Between read and write, another concurrent write can overwrite the row; the subsequent `put` will silently overwrite that write with stale data (except for `data`, since only metadata fields are updated). The risk is low because LRU metadata is not safety-critical, but the pattern is architecturally inconsistent with `set`, which uses explicit transactions.

Fix: wrap the read + metadata update in a single `readwrite` transaction (matches the pattern in `set`).

**Finding C-4 — LOW: `queryByField` fallback table scan silently hides missing indexes in production**

`ReplicatedTable.ts:354–359` — When an index is missing, the code logs a warning and falls back to `getAll()` + `filter()`. This is O(n) instead of O(log n) and, more importantly, the `getAll()` call goes through the error-swallowing path (Finding C-2), so a broken IDB returns an empty array without any failure signal to the caller.

No code fix needed if C-2 is fixed; document only until then.

---

### Error surfacing

**Finding E-1 — HIGH: `getAll` error is swallowed (same as C-2)**

`ReplicatedTable.ts:410–414` — Any IDB error (quota exceeded, database-closed race, upgrade conflict) is caught, logged, and replaced with `[]`. The promise returned to callers always resolves — it never rejects. Callers have no programmatic way to know a failure occurred.

Fix: re-throw after logging, or return a discriminated `{ data: T[]; error: Error | null }` shape. At minimum, `getAll` should reject on IDB errors so the circuit-breaker can count them properly (currently `databaseManager.recordFailure()` is called inside the catch, which is correct, but callers still receive `[]` and proceed as if data is empty).

**Finding E-2 — MEDIUM: `optimisticUpdate` `_maxRetries` parameter is accepted but never used**

`ReplicatedTable.ts:449` — The parameter is prefixed `_maxRetries` (intentional no-op) but the public API signature exposes it, implying retry behaviour exists. On a version conflict (C-1 scenario), `set` throws and the error propagates to the caller uncaught — no retry loop is implemented despite the constant `MAX_OPTIMISTIC_UPDATE_RETRIES = 3`. Callers that expect automatic retry will get a hard error.

Fix: either implement the retry loop or remove the parameter from the public signature and rename it to document-only.

**Finding E-3 — LOW: `queryByField` timeout error is re-thrown correctly; non-timeout IDB errors are swallowed via fallback**

`ReplicatedTable.ts:344–360` — Timeout errors propagate (good). Any other IDB error (e.g., index-not-found) triggers the fallback scan path and is swallowed in the warning log. If the fallback `getAll()` also fails, that error is swallowed by `getAll`'s own catch (E-1 chain).

No additional fix beyond fixing E-1.

---

### Invariants

**Finding I-1 — HIGH: `isExpired` bypasses TTL when `lastSuccessfulSyncAt === 0` (never synced), causing stale data to never expire**

`ReplicatedTableCache.ts:66–71` — `timeSinceLastSync = Date.now() - 0 = ~now` which is always `> ttl * 2` on a fresh instance where `lastSuccessfulSyncAt` was never set. The guard `if (timeSinceLastSync > ttl * 2) return false` then means **no row ever expires until after a successful sync completes**. This is arguably intentional (don't expire what you can't re-fetch), but it means data seeded directly into IDB (e.g., bootstrap or test data) is never evicted, and `cleanExpired` becomes a no-op until the first sync. The invariant "expired rows must not be served" does not hold in this case.

Tested? No — the existing test suite does not exercise `isExpired` with `lastSuccessfulSyncAt === 0`. Document-only fix: add a comment; or add a unit test asserting this known behaviour so it is deliberate.

**Finding I-2 — MEDIUM: `removeStaleEntries` checks `isDirty` but not `syncStatus === 'pending'`**

`ReplicatedTable.ts:578–582` — A row could have `isDirty = false` but `syncStatus = 'pending'` (edge case from certain code paths). Such a row would be treated as non-dirty and deleted, losing a pending mutation's local-side data. The invariant "never delete a row with pending local changes" is not fully enforced.

Fix: also guard on `row.syncStatus === 'pending'` in addition to `row.isDirty`.

---

### Resource cleanup

**Finding R-1 — NO POSTGRES_CHANGES LEAK: `ReplicatedTable` itself has no Supabase channel subscriptions**

Searched `packages/replication/src/` for `postgres_changes`, `supabase.channel`, `removeChannel` — no results in `ReplicatedTable.ts` or its delegate managers. The audit task's primary concern (channel leak) does not apply at this layer. Real-time subscriptions live in Zustand stores in `apps/myk9q` (e.g., `announcementStore.ts`, `nationalsStore.ts`) and those correctly call `removeChannel` on teardown.

**Finding R-2 — MEDIUM: `getAll` and `queryByField` timeout `setTimeout` handles are never cleared on success**

`ReplicatedTable.ts:400–403` and `ReplicatedTable.ts:294–308` — In both methods, a `setTimeout` is created for the timeout rejection. When the operation succeeds (the `getAllPromise`/`queryPromise` wins the race), the `setTimeout` is never `clearTimeout`'d. In a Node/JSDOM test environment this holds the event loop open and causes test hangs. In browsers it is harmless but wastes a timer slot until it fires (into an already-resolved `Promise`).

Fix: use `clearTimeout` on the timer after `Promise.race` settles, or use a helper like `withTimeout` (already available in `mutation-utils.ts`) which wraps this pattern correctly.

**Finding R-3 — LOW: `notifyDebounceTimer` in `ReplicatedTableCacheManager` is never cleared on instance teardown**

`ReplicatedTableCache.ts:23, 278–282` — If a `ReplicatedTable` instance is abandoned (e.g., during test teardown or hot-module replacement), the debounce timer keeps firing and calls `actuallyNotifyListeners → getAll`, which touches the IDB instance. There is no `destroy()` / `dispose()` method. In production this is minor because table instances are singletons; in tests it can cause "update on unmounted component" style errors.

Fix: add a `dispose()` method that calls `clearTimeout(notifyDebounceTimer)` and clears `listeners`.

---

### Concurrency

**Finding CON-1 — HIGH: `acquireRowLock` TOCTOU race (see C-1 above)**

Two callers simultaneously waiting on the same row lock both proceed past `acquireRowLock` after the lock is released. This violates the per-row serialisation invariant that `optimisticUpdate` depends on.

**Finding CON-2 — MEDIUM: `set` uses a transaction but `get` reads then writes outside a single transaction (C-3 above)**

When `get` updates LRU metadata, a concurrent `set` on the same row may interleave between the `db.get` and `db.put` in `get`. The result is that `set`'s newer `data` payload can be overwritten by `get`'s stale `db.put`. This only affects the `data` field if `get` reads a stale version and writes it back — see C-3.

**Finding CON-3 — LOW: `batchSet` iterates with `await` inside a single transaction; all writes serialise correctly**

`ReplicatedTableBatch.ts:41–59` — Uses a single transaction with sequential `await tx.store.put(row)` calls. This is correct and avoids the `forEach + await` anti-pattern. No issue found.

---

### Offline semantics

**Finding O-1 — HIGH: `getAll` does not check `navigator.onLine`; on network failure it returns `[]` instead of cached data**

`ReplicatedTable.ts:382–415` — `getAll` reads purely from IDB (correct for offline-first). However, if IDB itself fails (e.g., quota error), `getAll` returns `[]`. The `isExpired` guard in `cacheManager` does correctly skip expiry when `navigator.onLine === false` (`ReplicatedTableCache.ts:59–62`). So offline TTL is handled. But IDB read failures return empty data silently (covered by E-1). The effect: flaky IDB + offline = empty UI with no error signal.

This is the same root cause as E-1/C-2. Fix: re-throw IDB errors so the offline-aware error boundary can show cached data from a higher layer (e.g., localStorage) or a user-visible error.

**Finding O-2 — MEDIUM: `isExpired` returns `false` for offline rows but `getAll` filters on `isExpired` — offline data is served correctly (no issue)**

`ReplicatedTable.ts:389` calls `!this.cacheManager.isExpired(row)`. `isExpired` returns `false` when `navigator.onLine === false`, so all rows pass the filter. Offline data is served correctly from IDB without going to the network. No issue found — the offline read path is correct for the TTL layer.

**Finding O-3 — LOW: `queryByField` fetches from IDB only — no network bypass possible**

`ReplicatedTable.ts:282–361` — All reads are IDB-only. There is no code path that falls back to Supabase when the IDB result is empty. This is correct offline-first behaviour. No issue found.

---

### Test coverage gaps

**Finding T-1 — HIGH: `acquireRowLock` concurrency race (C-1) has zero test coverage**

No existing test exercises two concurrent `optimisticUpdate` calls on the same row ID. The race in `acquireRowLock` is invisible under sequential tests. A concurrent test would reliably expose it.

**Finding T-2 — HIGH: `getAll` error-swallowing (E-1/C-2) has zero test coverage**

No test makes IDB fail during `getAll` and asserts on the returned value or error. The existing circuit-breaker test (`getAll circuit breaker integration`) only seeds a failure counter manually; it does not make IDB itself throw.

**Finding T-3 — MEDIUM: `isExpired` with `lastSuccessfulSyncAt === 0` is not tested**

The "never expire before first sync" behaviour (I-1) is not covered. It could change silently.

**Finding T-4 — MEDIUM: `removeStaleEntries` with `syncStatus === 'pending'` rows is not tested**

The gap in I-2 (missing `syncStatus` guard) has no corresponding test to catch a regression.

**Finding T-5 — LOW: `get` LRU metadata update race (C-3) is not tested**

No test verifies that a concurrent `set` after `get`'s read but before `get`'s `put` does not corrupt the row.

**Finding T-6 — LOW: Timer leaks (R-2, R-3) are not tested**

No test asserts that `clearTimeout` is called on the `getAll` timeout handle or that the debounce timer is cleared after unsubscribe.

---

## Remediation plan

| Finding         | Severity | Fix                                                                                                                                                                                                                                          |
| --------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --------------------------------------------------------------------------- |
| C-1 / CON-1     | HIGH     | Replace `acquireRowLock` / `releaseRowLock` with a proper promise-chain mutex that appends each new caller onto the tail of the existing promise, preventing simultaneous entry after release.                                               |
| C-2 / E-1 / O-1 | HIGH     | Remove the catch-and-return-empty in `getAll`; re-throw IDB errors so callers receive a rejection. Update the four internal callers (`notifyListeners`, `queryIndex` fallback, `getAllLocalIds`, circuit-breaker path) to handle rejections. |
| E-2             | MEDIUM   | Implement the retry loop in `optimisticUpdate` using `_maxRetries`, or remove the parameter and update the docstring.                                                                                                                        |
| I-2             | MEDIUM   | Add `                                                                                                                                                                                                                                        |     | row.syncStatus === 'pending'`to the dirty-row guard in`removeStaleEntries`. |
| R-2             | MEDIUM   | Call `clearTimeout` on the `getAll` and `queryByField` timeout handles after `Promise.race` settles.                                                                                                                                         |
| R-3             | LOW      | Add `dispose()` to `ReplicatedTableCacheManager` (clears timer + listeners); call from a `ReplicatedTable.dispose()` wrapper.                                                                                                                |
| C-3 / CON-2     | LOW      | Wrap the `get` LRU metadata update in a `readwrite` transaction.                                                                                                                                                                             |
| I-1             | LOW      | Add a comment documenting the "never expire before first sync" behaviour; add a unit test asserting it is intentional.                                                                                                                       |
