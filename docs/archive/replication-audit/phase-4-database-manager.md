# Phase 4: DatabaseManager Lifecycle Audit

**Audited:** packages/replication/src/core/DatabaseManager.ts (509 lines)
**Date:** 2026-04-20
**Auditor:** Claude + Richard

## Scope

IDB open, version upgrades, onupgradeneeded migrations, close, recovery, versionchange cross-tab events, blocked events, quota handling.
Out of scope: reads/writes through tables (Phase 1/2), conflict resolution (Phase 3).

## Method map

| Method                           | Lines   | Responsibility                                                                                      |
| -------------------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| `createObjectStores` (module fn) | 90–178  | `onupgradeneeded` callback — creates/upgrades all 5 object stores and their indexes                 |
| `openDatabaseWithTimeout`        | 200–239 | Calls `idb.openDB` with upgrade, blocked, and versionchange handlers; wraps in `withTimeout`        |
| `getDatabase`                    | 245–370 | Public entry point — health-checks sharedDB, joins init queue if in-progress, or wins the init race |
| `isInitialized`                  | 375–377 | Returns `sharedDB !== null`                                                                         |
| `getStatus`                      | 382–398 | Returns diagnostic snapshot of all module-level state                                               |
| `reset`                          | 403–416 | Closes and clears all shared state; used by tests and logout flows                                  |
| `recordFailure`                  | 421–434 | Increments failure counter; trips circuit breaker at threshold and fires async `recover()`          |
| `resetFailures`                  | 439–442 | Clears failure counter and circuit flag after a success                                             |
| `recover`                        | 447–496 | Force-closes DB, deletes IDB, re-opens fresh DB, dispatches `replication:recovery` CustomEvent      |
| `isCircuitOpen`                  | 501–503 | Returns `this.circuitOpen`                                                                          |

## Findings

### Correctness

**MEDIUM — `blocked` handler force-closes `sharedDB` but uses the module-level singleton.**
The `blocked` callback (lines 212–222) closes and nulls `sharedDB`. But `blocked` fires on the _new_ `openDB` call (not the existing connection); the connection that is actually _blocking_ the upgrade belongs to another tab or to the existing `sharedDB`. Force-closing `sharedDB` here is the right intent but the handler also triggers when this same page opens a second version on a different DatabaseManager instance with a different `dbName`, because the module-level `sharedDB` is unconditional. In practice with a single DB name this is correct, but the coupling is fragile.

**LOW — `onversionchange` handler nulls module globals but the caller still holds the `db` reference.**
When another tab triggers an upgrade, `db.onversionchange` closes `db` and nulls `sharedDB` / `dbInitPromise` (lines 227–234). Any code that already received the `IDBPDatabase` instance from `getDatabase()` continues using it. Transactions will fail with `InvalidStateError: The database connection is closing`, which callers must handle. This is the correct WebIDB pattern, but callers have no documented obligation to retry.

**LOW — `dbInitInProgress` is not atomic; `getDatabase` can race without `dbInitPromise`.**
The check and set of `dbInitInProgress` (lines 336–343) are not wrapped in a microtask lock. In a same-tab concurrent call scenario two callers could both read `dbInitInProgress === false` before either sets it, both calling `openDatabaseWithTimeout` simultaneously. This is mitigated by the `dbInitPromise` check above it, but only if the promise was already assigned; if two calls arrive simultaneously before `dbInitPromise` is set, both can pass both guards.

**HIGH — Circuit breaker state is instance-scoped, but `sharedDB` is module-scoped.**
`consecutiveFailures` and `circuitOpen` live on `this`, but the DB they protect is shared by all `DatabaseManager` instances. Two instances (e.g., the default `databaseManager` singleton plus a table's own instance) can each trip independently without coordinating, leading to double recovery calls on the same shared DB.

### Error surfacing

**HIGH — Quota-exceeded errors are not surfaced distinctly.**
Writes to IDB that fail with `DOMException: QuotaExceededError` bubble through the `idb` wrapper but are caught by callers' generic `catch` blocks. `getDatabase` itself does not write, so quota only manifests inside table-level operations — but `recover()` called from `recordFailure()` will silently re-open a fresh empty DB and dispatch only a generic `replication:recovery` event with `reason: 'circuit-breaker'`. The user and UI have no signal that data was lost due to storage quota.

**LOW — `recover()` emits the same event regardless of trigger reason.**
The `detail.reason` is hardcoded to `'circuit-breaker'` even when `recover()` is invoked from `getDatabase`'s catch path (line 361). Consumers cannot distinguish a quota failure from a normal open failure.

### Invariants

**MEDIUM — After `onversionchange` closes the DB, `sharedDB` is null but `dbInitPromise` is also null.**
The next call to `getDatabase` will attempt a fresh open, which may trigger `blocked` on the already-in-progress upgrade in the other tab. This can create a livelock: tab A's upgrade is blocked by tab B's open attempt which itself gets blocked. The `blocked` handler force-closes `sharedDB` (already null at this point) which doesn't unblock anything.

**LOW — `isRecovering` guard is instance-scoped.**
If two `DatabaseManager` instances both call `recover()` concurrently (possible with the HIGH finding above), `isRecovering` doesn't prevent the second instance from proceeding.

### Resource cleanup

**LOW — Health check transaction is created but never awaited or aborted.**
Line 259 opens a readonly transaction `sharedDB.transaction(REPLICATION_STORES.SYNC_METADATA, 'readonly')` purely to detect if the DB is closing. The transaction object is never used or cleaned up. IDB auto-commits readonly transactions, so this is not a leak, but it creates a spurious IDB transaction on every `getDatabase` call after init.

**LOW — `reset()` calls `sharedDB.close()` without awaiting pending transactions.**
`waitForActiveTransactions()` is available but not called inside `reset()`. In tests this is fine because `fake-indexeddb` is synchronous, but in production a race exists between `reset()` and in-flight table operations.

### Concurrency

**HIGH — No cross-tab flush lock.**
`MutationManager.uploadPendingMutations` uses `this.isUploading` (an in-memory boolean) to prevent concurrent uploads, but this only prevents same-instance re-entrancy. Two browser tabs running `uploadPendingMutations` simultaneously will both read the full mutation queue from IDB and attempt to upload every mutation, potentially double-applying every pending mutation.

**MEDIUM — `tableInitQueue` serializes within a single open, but resets on recovery.**
After recovery, `tableInitQueue` is reset to `Promise.resolve()`. Any tables that were waiting in the old queue will not be re-queued; they'll join the fresh queue independently. This is probably correct but means the init queue isn't a reliable serializer across recovery events.

### Offline semantics

**LOW — Recovery dispatches `replication:recovery` only when `window` is defined.**
This is correct for the browser target, but means tests running under jsdom with `window` set will see the event, while Node.js environments (if ever used) will not. The guard is appropriate but worth noting.

**LOW — `deleteDB` during recovery is best-effort (times out and continues).**
This is intentional and correctly documented in the code comment. However, if `deleteDB` is skipped due to a lock timeout and the DB is subsequently re-opened, the new open may see the old corrupted schema, causing the same upgrade path to fail again and re-trip the circuit breaker.

### Test coverage gaps

1. No test for the `blocked` event path (another tab blocking upgrade).
2. No test for `onversionchange` closing the connection and triggering re-open.
3. No test verifying all 5 object stores and the expected DB version after open.
4. No test for quota-exceeded error propagation.
5. No test for the `dbInitInProgress` race (two concurrent `getDatabase` calls before `dbInitPromise` is set).
6. No test for recovery after `deleteDB` timeout (the "proceed without deletion" path).
7. No test for cross-tab double-flush of the mutation queue.

## Remediation plan

| #   | Severity | Finding                                                      | Fix                                                                                                                                             |
| --- | -------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | HIGH     | Circuit breaker is instance-scoped vs. module-scoped DB      | Move `consecutiveFailures`/`circuitOpen` to module scope, or use the module-level singleton exclusively                                         |
| R2  | HIGH     | No cross-tab flush lock                                      | Add `navigator.locks.request('myk9-replication-flush', ...)` in `uploadPendingMutations`; fall back to in-memory mutex if locks API unavailable |
| R3  | HIGH     | Quota-exceeded errors not surfaced                           | Catch `QuotaExceededError` in table write paths; emit `replication:quota-exceeded` event                                                        |
| R4  | MEDIUM   | `blocked` handler uses unconditional module-level `sharedDB` | Scope `blocked` handler to the specific `dbName` being opened                                                                                   |
| R5  | MEDIUM   | `onversionchange` livelock potential                         | After `onversionchange` fires, delay re-open by a short jitter to let the other tab complete its upgrade                                        |
| R6  | LOW      | Spurious health-check transaction on every call              | Cache a boolean `sharedDBHealthy` flag and set it on open/close rather than probing with a transaction                                          |
| R7  | LOW      | `reset()` doesn't drain active transactions                  | Call `waitForActiveTransactions()` before closing in `reset()`                                                                                  |
| R8  | LOW      | `recover()` reason hardcoded                                 | Pass reason string through to the CustomEvent detail                                                                                            |

---

## Task 4.4 status

Test file `packages/replication/src/core/DatabaseManager.multi-tab.test.ts` created with two `.skip`-ed tests encoding the R2 invariants. Tests will be un-skipped once R2 is implemented.

**Deferred fix rationale:** The minimum-safe cross-tab lock requires `navigator.locks.request('myk9-replication-flush', ...)` inside `uploadPendingMutations`, with a graceful fallback when the Locks API is unavailable (old Safari, test environments). A partial implementation (in-memory mutex without cross-tab) was attempted but provides false comfort — it only protects same-tab concurrency, which is already mostly handled by `this.isUploading`. A proper fix needs:

1. `navigator.locks.request` with a mode option (`exclusive`)
2. A fallback path for environments without `navigator.locks` that returns immediately (acceptable risk: same-tab-only protection)
3. Test harness support (stubbing `navigator.locks` in Vitest)

This is a real HIGH finding and should be addressed in a dedicated follow-up PR where the fix can be properly tested in a real browser.
