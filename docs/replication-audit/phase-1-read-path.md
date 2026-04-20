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

### Error surfacing

### Invariants

### Resource cleanup

### Concurrency

### Offline semantics

### Test coverage gaps

## Remediation plan
