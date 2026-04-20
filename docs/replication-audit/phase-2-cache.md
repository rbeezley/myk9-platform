# Phase 2: Cache Audit — ReplicatedTableCache.ts + ReplicatedTableBatch.ts

**Audited:** packages/replication/src/core/ReplicatedTableCache.ts (381 lines), ReplicatedTableBatch.ts (157 lines)
**Date:** 2026-04-20
**Auditor:** Claude + Richard

## Scope

Cache TTL, invalidation, staleness, eviction. Batch commit atomicity and partial-failure semantics.
Out of scope: mutation queue (MutationManager), real-time subscriptions (Phase 1).

## Method map

### ReplicatedTableCache.ts

| Method                                | Lines   | Responsibility                                                                                                                                   |
| ------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `constructor`                         | 29–35   | Injects tableName, TTL getter, logger, getDb, getAllData                                                                                         |
| `setLastSuccessfulSync(timestamp)`    | 44–46   | Updates `lastSuccessfulSyncAt` (private state)                                                                                                   |
| `isExpired(row)`                      | 53–73   | Returns true when row.lastSyncedAt > TTL, with dirty/offline/un-synced guards                                                                    |
| `refreshTimestamps()`                 | 79–97   | Writes `lastSyncedAt = lastAccessedAt = now` on every row in a single readwrite tx; calls `setLastSuccessfulSync`                                |
| `cleanExpired()`                      | 102–124 | Iterates all rows, deletes those where `isExpired()` is true; returns deleted count                                                              |
| `estimateRowSize(row)`                | 133–140 | JSON-serialises row via `Blob.size`; falls back to `JSON.stringify.length * 2`                                                                   |
| `estimateTotalSize()`                 | 146–153 | Opens readonly tx, sums `estimateRowSize` for every row                                                                                          |
| `getCacheStats()`                     | 159–178 | Opens readonly tx; computes rowCount, sizeBytes, sizeMB, dirtyCount, oldestAccess, newestAccess                                                  |
| `evictLRU(targetSizeBytes)`           | 187–248 | Deletes rows in LFU+LRU score order until `currentSize <= target`; skips dirty and recently-accessed rows; notifies listeners                    |
| `subscribe(callback)`                 | 257–263 | Adds callback to Set, fires `getAllData()` immediately, returns unsubscribe fn                                                                   |
| `notifyListeners()`                   | 268–283 | Leading-edge debounce (NOTIFY_DEBOUNCE_MS = 100 ms); fires immediately on first call, resets flag on trailing edge                               |
| `actuallyNotifyListeners()` (private) | 285–294 | Calls `getAllData()`, then invokes each listener via `Promise.resolve().then(cb)`                                                                |
| `getListenerCount()`                  | 299–301 | Returns `this.listeners.size`                                                                                                                    |
| `getSyncMetadata()`                   | 310–330 | Reads SYNC_METADATA store with 5 s timeout via `Promise.race`                                                                                    |
| `updateSyncMetadata(updates)`         | 335–380 | Reads-then-writes SYNC_METADATA in readwrite tx; atomically increments `conflictCount` and `pendingMutations` if they already exist; 5 s timeout |

### ReplicatedTableBatch.ts

| Method                               | Lines   | Responsibility                                                                                                                           |
| ------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `constructor`                        | 26–33   | Injects tableName, logger, getDb, notifyListeners                                                                                        |
| `batchSet(items)`                    | 39–65   | Normalises IDs to string, wraps all puts in a single IDB readwrite tx, notifies listeners                                                |
| `batchSetChunked(items, chunkSize?)` | 75–119  | Delegates to `batchSet` when items ≤ chunkSize; otherwise opens a **new tx per chunk** (100-row default); notifies listeners once at end |
| `batchDelete(ids)`                   | 124–137 | Normalises IDs, deletes each in a single readwrite tx, notifies listeners                                                                |
| `clearCache()`                       | 142–156 | Gets all keys via `index.getAllKeys`, deletes each in a readwrite tx, notifies listeners                                                 |

## Findings

**Summary:** 3 high, 4 medium, 7 low findings across correctness, error surfacing, invariants, resource cleanup, concurrency, offline semantics, and test coverage.

| ID               | Sev    | Category                  | Short description                                                                  |
| ---------------- | ------ | ------------------------- | ---------------------------------------------------------------------------------- |
| B1               | HIGH   | Correctness / Invariants  | batchSet overwrites dirty rows — same class as Phase 1 set() bug                   |
| B2               | HIGH   | Correctness / Concurrency | batchSetChunked partial-failure leaves IDB in inconsistent state                   |
| B1-test          | HIGH   | Test coverage             | No test: batchSet + dirty row collision                                            |
| B2-test          | HIGH   | Test coverage             | No test: batchSetChunked partial-failure semantics                                 |
| C1               | MEDIUM | Resource cleanup          | Dangling setTimeout in getSyncMetadata / updateSyncMetadata                        |
| EVICT-UNBOUNDED  | MEDIUM | Invariants                | No auto-eviction on batchSet — unbounded IDB growth                                |
| CONCURRENT-CHUNK | MEDIUM | Concurrency               | Concurrent batchSetChunked calls can interleave dirty-row writes                   |
| B3               | LOW    | Correctness               | batchSet hardcodes version:1 on every put                                          |
| REFRESH-DIRTY    | LOW    | Invariants                | refreshTimestamps updates lastSyncedAt on dirty rows                               |
| TIMER-LEAK       | MEDIUM | Resource cleanup          | notifyDebounceTimer not cleared on teardown (no destroy())                         |
| ERR-CLEAN        | LOW    | Error surfacing           | cleanExpired errors propagate instead of being swallowed+logged                    |
| NOTIFY-ERR       | LOW    | Error surfacing           | getAllData failure in actuallyNotifyListeners silently dropped by evictLRU callers |

### Correctness

**[HIGH] batchSet silently overwrites dirty rows (B1)**
File: `ReplicatedTableBatch.ts:39–65`
`batchSet` always calls `tx.store.put(row)` with `isDirty: false, syncStatus: 'synced'`. If a row has local unsaved mutations (`isDirty: true`) when the server sync returns and calls `batchSet`, those mutations are overwritten in IDB. This is the same class of bug fixed in Phase 1 for `set()`. Phase 1 added a dirty-row guard to `set()`; the same guard is missing here.
Proposed fix: before each `put`, read the existing row and skip (or merge) if `existingRow?.isDirty === true`.

**[HIGH] batchSetChunked opens a new transaction per chunk — partial-failure leaves cache inconsistent (B2)**
File: `ReplicatedTableBatch.ts:86–115`
Each chunk is an independent IDB transaction. If chunk 3 of 5 fails (e.g. IDB throws a `QuotaExceededError`), chunks 1–2 are committed and chunks 3–5 are not. The caller receives a rejected Promise, but IDB now holds a half-written dataset — no rollback, no retry. Callers see mixed server-fresh data and stale data with no indication.
Proposed fix: Either wrap the entire operation in a single transaction (preferred, unless size pressure disallows it), or on any chunk failure delete all previously committed chunk rows and rethrow so callers can retry cleanly.

**[MEDIUM] updateSyncMetadata: timeout Promise leaks its setTimeout on success (C1)**
File: `ReplicatedTableCache.ts:366–379`
The `timeoutPromise` `setTimeout` is never cleared when `updatePromise` wins the race. Same pattern in `getSyncMetadata` (line 318). This causes a dangling timer that fires after the successful return, calling `reject()` on an already-resolved race — harmless today but leaks a timer handle and will pollute test output.
Proposed fix: wrap with `AbortController` or clear the timeout via a `finally` block.

**[LOW] batchSet version always written as 1 — loses version on re-sync (B3)**
File: `ReplicatedTableBatch.ts:52`
`version: 1` is hardcoded. When the server re-syncs a row that was previously cached at version N, the version resets to 1, breaking any downstream conflict-detection logic that relies on version incrementing.
Proposed fix: read the existing row's version and set `version: (existing?.version ?? 0) + 1`, or use a server-supplied version field if available.

### Error surfacing

**[MEDIUM] batchSetChunked swallows partial-failure silently from caller's perspective (B2, same as above)**
The caller awaits `batchSetChunked` and either gets `undefined` (all good) or a thrown error from the first failing chunk. There is no partial-success signal. Since chunks 1..N-1 are already committed, the caller cannot determine which rows landed and which did not.

**[LOW] cleanExpired errors are not caught — throws propagate to caller**
File: `ReplicatedTableCache.ts:102–124`
If IDB throws during `cleanExpired` the error propagates unhandled. The method is called as housekeeping; a silent swallow with a `logger.error` would be more appropriate.

**[LOW] actuallyNotifyListeners errors are caught per-listener but getAllData failure propagates**
File: `ReplicatedTableCache.ts:285–294`
If `getAllData()` rejects, the entire `actuallyNotifyListeners` rejects; the rejection propagates into `notifyListeners` which is `async` but its callers (e.g. `evictLRU` line 245) do not await the return value. This means subscriber errors in eviction are silently dropped.

### Invariants

**[HIGH] batchSet does not preserve isDirty — dirty-row invariant violated (B1, same as Correctness)**
The invariant "a dirty row is never overwritten by a server sync without merging local mutations" is violated by `batchSet` and `batchSetChunked`. Phase 1 established this invariant for `set()`; the batch path bypasses it.

**[MEDIUM] No maximum row-count or byte-size cap is enforced on write**
There is no eviction trigger on `batchSet`/`batchSetChunked`. `evictLRU` is a manual/maintenance method; nothing calls it automatically after a batch sync. A large initial sync loads unbounded data into IDB.
Actual behavior: unbounded growth until `evictLRU` is called externally.

**[LOW] refreshTimestamps resets lastSyncedAt on dirty rows**
File: `ReplicatedTableCache.ts:87–89`
`refreshTimestamps` does not skip dirty rows. Updating `lastSyncedAt` on a dirty row makes `isExpired()` believe the row was recently synced when it was not, potentially hiding staleness.

### Resource cleanup

**[MEDIUM] Dangling setTimeout in getSyncMetadata and updateSyncMetadata (C1, same as Correctness)**
File: `ReplicatedTableCache.ts:318–329`, `366–379`
Both race helpers create a `setTimeout` that is never cleared when the fast path wins. In tests with many iterations or in long-lived browser sessions this accumulates uncleaned timer handles.

**[LOW] notifyDebounceTimer not cleared on garbage collection / teardown**
File: `ReplicatedTableCache.ts:23`, `278`
There is no `destroy()` or `dispose()` method. If a `ReplicatedTableCacheManager` is abandoned while a debounce timer is still pending, the timer fires on the orphaned instance, calling `getAllData()` and potentially crashing on a closed IDB connection.

### Concurrency

**[MEDIUM] batchSetChunked uses separate transactions — concurrent writes can interleave (B2)**
Two concurrent calls to `batchSetChunked` interleave transactions. IDB serialises individual transactions but two overlapping series of chunk-transactions can interleave. Result: a concurrent `set()` of a dirty row between chunk 1 and chunk 2 gets overwritten by chunk 2 (since `batchSet` ignores `isDirty`).

**[LOW] updateSyncMetadata read-modify-write is not race-safe across tabs**
File: `ReplicatedTableCache.ts:342–363`
Each call opens a readwrite transaction with a read-then-write pattern. In a single browser context IDB serialises these. Across two tabs (two `ReplicatedTableCacheManager` instances sharing the same IDB) the read-modify-write is not atomic — two concurrent increments of `conflictCount` can lose one increment. Low risk in practice (tabs rarely sync simultaneously) but worth noting.

### Offline semantics

**[MEDIUM] batchSet/batchSetChunked don't guard against overwriting dirty rows offline (B1)**
Offline, `batchSet` is typically not called (sync doesn't run). However if connectivity returns and a full sync fires before the mutation queue drains, batchSet runs while the user still has dirty rows. The dirty-row guard missing in batchSet is especially dangerous here because the mutation queue may not have uploaded yet.

**[LOW] isExpired returns false when offline (correct) but evictLRU can still evict dirty rows — it checks isDirty correctly**
No issue — `evictLRU` explicitly skips dirty rows (line 212). Offline semantics for eviction are correct.

**[LOW] cleanExpired is safe offline (isExpired returns false) — no issue**
`isExpired` guards against offline expiration. `cleanExpired` is safe to call offline.

### Test coverage gaps

**[HIGH] No test: batchSet called with a dirty row in IDB does not overwrite it**
This is the B1 bug. No existing test covers the collision between batchSet and an in-flight dirty row.

**[HIGH] No test: batchSetChunked partial failure leaves cache in intermediate state**
No existing test verifies the partial-failure behavior of chunked writes.

**[MEDIUM] No test: evictLRU is never called automatically after a large batchSet**
The unbounded-growth finding (no auto-eviction trigger) has no test coverage demonstrating the footprint behavior.

**[MEDIUM] No test: defensive copy — callers mutating returned getAllData objects corrupt cache**
`getAllData` is injected by the caller (not owned by `ReplicatedTableCacheManager`) so the cache itself doesn't store an in-memory copy to corrupt; however the invariant is worth documenting (see Task 2.3).

**[LOW] No test: refreshTimestamps updates dirty rows' lastSyncedAt**
The subtle invariant violation (refreshTimestamps not skipping dirty rows) is untested.

**[LOW] No test: timeout cleanup in getSyncMetadata / updateSyncMetadata**
Timer-leak finding (C1) has no test.

## Remediation plan

| ID              | Severity | File                                     | Fix summary                                                                                                |
| --------------- | -------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| B1              | HIGH     | ReplicatedTableBatch.ts:39–65, 86–115    | Guard batchSet/batchSetChunked: read existing row, skip put if `isDirty: true` (mirrors Phase 1 set() fix) |
| B2              | HIGH     | ReplicatedTableBatch.ts:75–119           | Wrap chunked batch in a single IDB transaction OR implement rollback/retry on partial chunk failure        |
| C1              | MEDIUM   | ReplicatedTableCache.ts:318–329, 366–379 | Clear the race-timeout `setTimeout` in a `finally` block when the fast path resolves                       |
| B3              | LOW      | ReplicatedTableBatch.ts:52               | Read existing row version, write `version: (existing?.version ?? 0) + 1` instead of hardcoded `1`          |
| EVICT-UNBOUNDED | MEDIUM   | ReplicatedTableBatch.ts                  | Document no auto-eviction; consider calling `evictLRU` after large batchSet if size exceeds threshold      |
| REFRESH-DIRTY   | LOW      | ReplicatedTableCache.ts:87–89            | Skip dirty rows in refreshTimestamps                                                                       |
| TIMER-LEAK      | MEDIUM   | ReplicatedTableCache.ts                  | Add `destroy()` method clearing `notifyDebounceTimer`                                                      |

### B1 — dirty-row guard in batchSet (Task 2.3)

**Approach:** Before each `put` in `batchSet`, the implementation now reads the existing IDB row via `tx.store.get([tableName, id])`. If `existingRow?.isDirty === true` and the incoming item carries `isDirty: false` (a clean server value), the row is skipped and a log line is emitted — exactly mirroring the Phase 1 `set()` guard. The same read also fixes the pre-existing B3 finding: `version` is now written as `existingRow.version + 1` rather than the hardcoded `1`.

The `batchSetChunked` path inherits the guard automatically because its inner chunk loop was rewritten to use the same per-row read-before-put pattern (duplicate of `batchSet`'s loop rather than delegating, to keep the chunked path's WAL rollback self-contained).

### B2 — write-ahead log atomicity in batchSetChunked (Task 2.3)

**Approach chosen:** Write-ahead log (WAL), not a single IDB transaction.

A single spanning transaction was considered and rejected. The comment on `batchSetChunked` explains why chunking exists: to prevent transaction timeouts on large initial syncs. Wrapping hundreds of rows in one transaction would re-introduce that timeout risk.

Instead, before the first chunk write begins, a read-only snapshot of every affected row's pre-existing IDB state is captured into a `Map<id, ReplicatedRow | undefined>`. If any chunk throws (e.g. `QuotaExceededError`), a rollback transaction iterates the snapshot: rows that did not exist before are deleted; rows that existed are restored to their snapshotted value. The error is re-thrown so callers can retry with a clean IDB state.

Both fixes are covered by regression tests in `src/core/ReplicatedTableCache.batch-dirty.test.ts` (2 new tests, both GREEN as of this commit).
