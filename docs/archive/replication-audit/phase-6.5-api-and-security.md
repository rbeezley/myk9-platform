# Phase 6.5: Public API + Security Audit

**Audited:** `packages/replication/src/index.ts` (144 lines)
**Date:** 2026-04-20

## Public API

Consumer count is number of files in `apps/` that reference the symbol. "Primary consumer" is `apps/myk9q`; `apps/myk9show` also imports a subset.

| Export                                                                                                                                                     | Kind           | Consumer(s)                  | Verdict                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------- | ------------------------ |
| `ReplicatedRow`                                                                                                                                            | type           | both apps                    | correct                  |
| `SyncStatus`                                                                                                                                               | type           | both apps                    | correct                  |
| `SyncMetadata`                                                                                                                                             | type           | both apps                    | correct                  |
| `PendingMutation`                                                                                                                                          | type           | both apps                    | correct                  |
| `MutationOperation`                                                                                                                                        | type           | both apps                    | correct                  |
| `MutationStatus`                                                                                                                                           | type           | both apps                    | correct                  |
| `SyncResult`                                                                                                                                               | type           | both apps                    | correct                  |
| `SyncOperation`                                                                                                                                            | type           | both apps                    | correct                  |
| `SyncOptions`                                                                                                                                              | type           | both apps                    | correct                  |
| `PerformanceReport`                                                                                                                                        | type           | myk9q                        | correct                  |
| `SyncProgress`                                                                                                                                             | type           | myk9q                        | correct                  |
| `SyncFailure`                                                                                                                                              | type           | myk9q                        | correct                  |
| `Conflict`                                                                                                                                                 | type           | myk9q                        | correct                  |
| `ResolutionContext`                                                                                                                                        | type           | myk9q                        | correct                  |
| `ConflictStrategy`                                                                                                                                         | type           | myk9q                        | correct                  |
| `ConflictResolutionResult`                                                                                                                                 | type           | myk9q                        | correct                  |
| `FieldAuthority`                                                                                                                                           | type           | myk9q                        | correct                  |
| `TableFilter`                                                                                                                                              | type           | myk9q                        | correct                  |
| `QueryOptions`                                                                                                                                             | type           | myk9q                        | correct                  |
| `CacheStats`                                                                                                                                               | type           | myk9q                        | correct                  |
| `ConflictResolver`                                                                                                                                         | class          | both apps (7 files)          | correct                  |
| `conflictResolver`                                                                                                                                         | singleton      | both apps (14 files)         | correct                  |
| `ConflictManager`                                                                                                                                          | class          | myk9q (2 files)              | correct                  |
| `conflictManager`                                                                                                                                          | singleton      | myk9q (5 files)              | correct                  |
| `ConflictEvent` / `ConflictEventType` / `ConflictStats`                                                                                                    | type           | myk9q                        | correct                  |
| `Logger`                                                                                                                                                   | type           | both apps                    | correct                  |
| `DiagnosticReport`                                                                                                                                         | type           | myk9q                        | correct                  |
| `GetTableTTL` / `LogDiagnostics` / `HandleDatabaseCorruption`                                                                                              | type           | myk9q                        | correct                  |
| `ReplicatedTableDependencies`                                                                                                                              | type           | both apps                    | correct                  |
| `DatabaseManagerDependencies`                                                                                                                              | type           | myk9q                        | correct                  |
| `noopLogger`                                                                                                                                               | fn             | both apps                    | correct                  |
| `defaultGetTableTTL`                                                                                                                                       | fn             | both apps                    | correct                  |
| `noopDiagnostics`                                                                                                                                          | fn             | myk9q                        | correct                  |
| `noopCorruptionHandler`                                                                                                                                    | fn             | myk9q                        | correct                  |
| `DB_NAME` / `DB_VERSION` / `TOTAL_REPLICATED_TABLES`                                                                                                       | const          | myk9q                        | correct                  |
| TTL constants (`DEFAULT_TTL_MS`, `SHOW_TTL_MS`, `TRIAL_TTL_MS`, `ENTRY_TTL_MS`, `RESULT_TTL_MS`)                                                           | const          | myk9q                        | correct                  |
| Query perf (`QUERY_TIMEOUT_MS`, `SLOW_QUERY_THRESHOLD_MS`)                                                                                                 | const          | myk9q                        | correct                  |
| Batch (`DEFAULT_CHUNK_SIZE`, `MAX_CHUNK_SIZE`)                                                                                                             | const          | myk9q                        | correct                  |
| Sync engine (`SYNC_INTERVAL_MS`, `SYNC_BACKOFF_MULTIPLIER`, `MAX_SYNC_BACKOFF_MS`, `INITIAL_SYNC_BACKOFF_MS`, `MAX_SYNC_RETRIES`)                          | const          | myk9q                        | correct                  |
| Conflict (`TIMESTAMP_PRECISION_TOLERANCE_MS`, `MAX_CONFLICT_AGE_MS`)                                                                                       | const          | myk9q                        | correct                  |
| Prefetch (`PREFETCH_FRESH_WINDOW_MS`, `PREFETCH_START_DELAY_MS`, `PREFETCH_BATCH_INTERVAL_MS`)                                                             | const          | myk9q                        | correct                  |
| Debounce (`NOTIFY_DEBOUNCE_MS`, `DIRTY_ROW_DEBOUNCE_MS`)                                                                                                   | const          | myk9q                        | correct                  |
| Init (`TABLE_INIT_QUEUE_DELAY_MS`, `DB_INIT_TIMEOUT_MS`, `INIT_RETRY_DELAY_MS`, `GET_ALL_TIMEOUT_MS`, `DELETE_DB_TIMEOUT_MS`, `CIRCUIT_BREAKER_THRESHOLD`) | const          | myk9q                        | correct                  |
| Replication mgr (`SUBSCRIPTION_HEALTH_CHECK_INTERVAL_MS`, `SUBSCRIPTION_INIT_TIMEOUT_MS`, `MAX_CONCURRENT_SUBSCRIPTIONS`)                                  | const          | myk9q                        | correct                  |
| Optimistic update (`MAX_OPTIMISTIC_UPDATE_RETRIES`, `OPTIMISTIC_UPDATE_BACKOFF_BASE_MS`)                                                                   | const          | myk9q                        | correct                  |
| Transaction (`MAX_TRANSACTION_DURATION_MS`, `TRANSACTION_ABORT_DELAY_MS`)                                                                                  | const          | myk9q                        | correct                  |
| `DatabaseManager`                                                                                                                                          | class          | myk9q                        | correct                  |
| `databaseManager`                                                                                                                                          | singleton      | both apps                    | correct                  |
| `REPLICATION_STORES`                                                                                                                                       | const          | both apps                    | correct                  |
| `trackTransaction`                                                                                                                                         | fn             | myk9q                        | correct                  |
| `getActiveTransactionCount`                                                                                                                                | fn             | myk9q                        | correct                  |
| `waitForActiveTransactions`                                                                                                                                | fn             | myk9q                        | correct                  |
| `ReplicatedTableCacheManager`                                                                                                                              | class          | 0 app files (re-export only) | should-narrow (deferred) |
| `ReplicatedTableBatchManager`                                                                                                                              | class          | 0 app files (re-export only) | should-narrow (deferred) |
| `ReplicatedTable`                                                                                                                                          | abstract class | both apps (41 files)         | correct                  |
| `TimeoutError`                                                                                                                                             | class          | myk9q                        | correct                  |
| `withTimeout`                                                                                                                                              | fn             | myk9q                        | correct                  |
| `calculateBackoffDelay`                                                                                                                                    | fn             | myk9q                        | correct                  |
| `backoffDelay`                                                                                                                                             | fn             | myk9q                        | correct                  |
| `isRetryableError`                                                                                                                                         | fn             | myk9q                        | correct                  |
| `TIMEOUT_PRESETS`                                                                                                                                          | const          | myk9q                        | correct                  |
| `DEFAULT_TIMEOUT_MS` / `DEFAULT_MAX_RETRIES` / `DEFAULT_BACKOFF_BASE_MS` / `MAX_BACKOFF_MS` / `BACKOFF_JITTER`                                             | const          | myk9q                        | correct                  |
| `MutationManager`                                                                                                                                          | class          | both apps (14 files)         | correct                  |
| `MutationManagerOptions`                                                                                                                                   | type           | myk9q                        | correct                  |

### Notable findings

**`ReplicatedTableCacheManager` and `ReplicatedTableBatchManager`** are exported but not consumed directly by apps. They are internal collaborators of `ReplicatedTable` and do not need to be part of the public contract. Narrowing them to `internal` is a low-risk follow-up (defer — not a `bypass-bug`, no data loss, purely API surface hygiene).

**No `bypass-bug` findings.** Every export that apps consume has a legitimate offline-first use case. The earlier feedback note "never bypass the replication layer" is satisfied structurally: apps never import `supabase` and the `@myk9/replication` symbols in the same write path. Reads go through `ReplicatedTable.getAll()` / `queryByField()`. Writes go through subclass methods that call `set(..., isDirty=true)` and `queueMutation(...)`.

**`databaseManager` + `REPLICATION_STORES` exported broadly** — a handful of wrapper files use them to run bespoke transactions (e.g. stats-view recomputation). The Phase 5 wrapper audit already covered these; no additional finding here.

## RLS pass-through

**Scope.** The `@myk9/replication` package does NOT perform Supabase reads. The only Supabase interaction inside the package is in `MutationManager.uploadMutation` (writes). All server-side _reads_ (sync downloads, real-time change feeds) happen in concrete `Replicated*Table` subclasses inside the apps, or in `SyncExecutor` / `ReplicationManager`.

The audited read path is `ReplicatedTable.getAll()` / `ReplicatedTable.get()` — both read from IndexedDB only:

```ts
// packages/replication/src/core/ReplicatedTable.ts:394-427
async getAll(licenseKey?: string): Promise<T[]> {
  const getAllPromise = (async () => {
    const db = await this.init();
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
    const index = tx.store.index('tableName');
    const rows = (await index.getAll(this.tableName)) as ReplicatedRow<T>[];
    // ...
    return freshRows.map(row => row.data);
  })();

  // On any error, logs and returns [].
  try {
    const result = await Promise.race([getAllPromise, timeoutPromise]);
    databaseManager.resetFailures();
    return result;
  } catch (error) {
    this.logger.error(`[${this.tableName}] getAll() failed:`, error);
    databaseManager.recordFailure();
    return [];
  }
}
```

There is no Supabase `{ data, error }` unwrapping here — the only errors possible are IndexedDB failures (quota exceeded, DB closed, corruption). Returning `[]` on those is intentional: apps degrade gracefully offline when IDB is temporarily unavailable. Throwing would cascade up through React Query and crash the scoring screen.

**Write path (`MutationManager.uploadMutation`, lines 421–466):** Supabase errors _are_ thrown:

```ts
const { data: rows, error } = await withTimeout(
  this.supabase.from(tableName).insert(data).select('id'),
  ...
);
if (error) throw error;
```

RLS denials (`42501`) propagate through this `throw error` as the raw `PostgrestError`. `processMutationQueue` (around line 320–365) catches it, classifies via `isRetryableError(error)`, and either retries or marks the mutation as permanently failed. The global `replication:sync-failed` toast listener in `ReplicationSyncProvider.tsx` (noted in the scoring-sync memory update 2026-04-16) surfaces this to the user.

### Verdict

**No silent-[]-on-RLS-denial defect in the package.** The concern in the task brief ("`getAll()` might swallow `42501`") does not apply because `getAll()` does not call Supabase at all — it reads IDB.

The _sync_ download path (where `view_myk9q_*` is read and `{ data, error }` unpacked) lives in wrapper subclasses like `apps/myk9q/src/services/replication/tables/ReplicatedEntriesTable.ts`. Inspected lines 120–128:

```ts
const { data: remoteEntries, error: fetchError } = result as {
  data: Entry[] | null;
  error: unknown;
};

if (fetchError) {
  logger.error(`[${this.tableName}] Fetch error:`, fetchError);
  throw fetchError;
}
```

This correctly throws on RLS denial. The `sync()` outer catch wraps the thrown error into a failed `SyncResult` with `success: false` and `errorMessage`, which the sync orchestrator then emits as `replication:sync-failed`. User is notified via toast.

**No fix required in Phase 6.5.** Typed `RlsDeniedError` would be cosmetic here — the existing `PostgrestError` object already carries `code === '42501'`, and `isRetryableError` correctly classifies it as non-retryable. Deferring to a future hardening pass if we decide to type-narrow Supabase errors broadly.
