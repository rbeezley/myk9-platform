# IndexedDB Recovery: Circuit Breaker + Auto-Nuke

**Date:** 2026-03-26
**Status:** Approved
**Scope:** `packages/replication`, `apps/myk9show/src/providers/ReplicationSyncProvider.tsx`

## Problem

When IndexedDB gets locked or corrupted (stale HMR connections, browser crashes, partial writes), the current recovery flow fails:

1. `openDB()` hangs for 30s with no `blocked` callback to distinguish locked vs corrupted
2. `getAll()` times out at 20s per table and silently returns `[]`
3. Recovery tries `deleteDB()` which also hangs because the lock prevents deletion
4. The app renders empty data with no user feedback

The result: 60s+ of cascading timeouts, empty UI, confused user.

## Constraints

- Offline mutations (dirty writes during show-day scoring) must be preserved when possible, but for the admin/creation side, aggressive nuke-and-resync is acceptable
- Single-tab usage is the norm — no cross-tab coordination needed
- User prefers auto-recovery with a toast notification ("Resyncing local data...")

## Design

### 1. Prevention: `blocked` / `versionchange` callbacks

Add two callbacks to the `openDB()` call in `DatabaseManager.openDatabaseWithTimeout()`:

- **`blocked`**: Fires when `openDB` triggers a version upgrade but an existing connection won't close. Log a warning and force-close the stale `sharedDB` if it exists.
- **`db.onversionchange`**: After successfully opening, register a handler that closes the connection when another instance requests an upgrade. Prevents this connection from blocking a future open.

Both are additions to the existing `openDatabaseWithTimeout()` method. No new files.

### 2. Detection: Circuit breaker on `getAll()` timeouts

Add a circuit breaker to `DatabaseManager` (the shared singleton all tables use):

- **State**: `consecutiveFailures: number` and `circuitOpen: boolean` on the `DatabaseManager` class.
- **Increment**: `getAll()` calls `databaseManager.recordFailure()` on timeout or "corrupted/locked" errors.
- **Trip threshold**: 3 consecutive failures.
- **Reset**: `databaseManager.resetFailures()` called after a successful `getAll()` or after recovery completes.
- **When tripped**: Run recovery (section 3).

The circuit breaker is database-wide (not per-table) because the failure is always database-wide — if shows times out, trials/classes/entries will too.

### 3. Recovery: Auto-nuke and re-sync

When the circuit breaker trips, `DatabaseManager` runs:

1. **Force-close** the existing `sharedDB` connection via `db.close()`
2. **Null out** all module-level state (`sharedDB`, `dbInitPromise`, `dbInitInProgress`, queues, counters)
3. **Delete IndexedDB** via `deleteDB(dbName)` — wrapped in a 3s timeout. If `deleteDB` also hangs, skip it and proceed. The next `openDB` at the same version doesn't need an upgrade so it won't block.
4. **Re-open** the database fresh
5. **Emit** `replication:recovery` CustomEvent with `{ reason: 'circuit-breaker' }`

On the app side, `ReplicationSyncProvider` listens for `replication:recovery` and:

- Shows a toast: "Resyncing local data..." (via the existing `notifications` system)
- Triggers a full sync via `triggerSync()`

### 4. Timeout reductions

| Timeout                | Current         | New | Constant                     | Rationale                            |
| ---------------------- | --------------- | --- | ---------------------------- | ------------------------------------ |
| DB open                | 30s             | 5s  | `DB_INIT_TIMEOUT_MS`         | If it doesn't open in 5s, it's stuck |
| `getAll()`             | 20s (hardcoded) | 5s  | `GET_ALL_TIMEOUT_MS` (new)   | Extract to constant, same logic      |
| `deleteDB` in recovery | none            | 3s  | `DELETE_DB_TIMEOUT_MS` (new) | Don't let recovery hang              |

Worst-case timeline: first `getAll` fails at 5s → circuit trips at 3rd failure (~15s) → recovery takes 3-8s → full re-sync starts. Total: ~20-25s vs the current 60s+.

### 5. Testing

Unit tests extending existing suites:

**`DatabaseManager.test.ts`:**

- `recordFailure()` increments counter, `resetFailures()` clears it
- Circuit trips after 3 consecutive failures
- Recovery resets all module-level state
- Recovery works even when `deleteDB` times out

**`ReplicatedTable.test.ts`:**

- `getAll()` calls `databaseManager.recordFailure()` on timeout
- `getAll()` calls `databaseManager.resetFailures()` on success
- `getAll()` respects the new 5s timeout constant

## Files Changed

- `packages/replication/src/constants.ts` — add `GET_ALL_TIMEOUT_MS`, `DELETE_DB_TIMEOUT_MS`; reduce `DB_INIT_TIMEOUT_MS` from 30s to 5s
- `packages/replication/src/core/DatabaseManager.ts` — add `blocked`/`versionchange` callbacks, circuit breaker state/methods, recovery sequence
- `packages/replication/src/core/ReplicatedTable.ts` — wire `getAll()` to circuit breaker, use `GET_ALL_TIMEOUT_MS` constant
- `packages/replication/src/core/DatabaseManager.test.ts` — circuit breaker and recovery tests
- `packages/replication/src/core/ReplicatedTable.test.ts` — `getAll()` failure/success recording tests
- `apps/myk9show/src/providers/ReplicationSyncProvider.tsx` — listen for `replication:recovery` event, show toast, trigger re-sync
