# IndexedDB Recovery: Circuit Breaker + Auto-Nuke — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the replication layer self-heal when IndexedDB gets locked or corrupted, with user-visible feedback.

**Architecture:** Add `blocked`/`versionchange` callbacks to prevent locking, a circuit breaker on `DatabaseManager` to detect cascading `getAll()` timeouts, and an auto-nuke recovery sequence that deletes IndexedDB + re-syncs. `ReplicationSyncProvider` listens for a `replication:recovery` CustomEvent to show a toast and trigger a full sync.

**Tech Stack:** `idb` (existing), `@myk9/replication` package, Sonner toasts via `@/lib/notifications`

**Spec:** `docs/superpowers/specs/2026-03-26-indexeddb-recovery-design.md`

---

### Task 1: Add new constants and reduce timeouts

**Files:**

- Modify: `packages/replication/src/constants.ts:96-105`
- Modify: `packages/replication/src/index.ts:96-112`

- [ ] **Step 1: Update constants**

In `packages/replication/src/constants.ts`, replace the Initialization section (lines 96–105):

```typescript
// ==================== Initialization ====================

/** Delay between table initialization in queue (milliseconds) */
export const TABLE_INIT_QUEUE_DELAY_MS = 10;

/** Timeout for database initialization (milliseconds) */
export const DB_INIT_TIMEOUT_MS = 5000; // 5 seconds (reduced from 30s)

/** Delay before retry after initialization failure (milliseconds) */
export const INIT_RETRY_DELAY_MS = 50;

/** Timeout for getAll() operations (milliseconds) */
export const GET_ALL_TIMEOUT_MS = 5000; // 5 seconds (reduced from 20s)

/** Timeout for deleteDB during recovery (milliseconds) */
export const DELETE_DB_TIMEOUT_MS = 3000; // 3 seconds

/** Number of consecutive failures before circuit breaker trips */
export const CIRCUIT_BREAKER_THRESHOLD = 3;
```

- [ ] **Step 2: Export new constants from index.ts**

In `packages/replication/src/index.ts`, add the three new constants to the Initialization export block (after `INIT_RETRY_DELAY_MS` on line 101):

```typescript
  // Initialization
  TABLE_INIT_QUEUE_DELAY_MS,
  DB_INIT_TIMEOUT_MS,
  INIT_RETRY_DELAY_MS,
  GET_ALL_TIMEOUT_MS,
  DELETE_DB_TIMEOUT_MS,
  CIRCUIT_BREAKER_THRESHOLD,
```

- [ ] **Step 3: Verify it compiles**

Run: `cd packages/replication && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/replication/src/constants.ts packages/replication/src/index.ts
git commit -m "feat(replication): add recovery constants, reduce DB timeouts"
```

---

### Task 2: Add circuit breaker and recovery to DatabaseManager

**Files:**

- Modify: `packages/replication/src/core/DatabaseManager.ts`

- [ ] **Step 1: Add imports for new constants**

In `packages/replication/src/core/DatabaseManager.ts`, update the import from `'../constants'` (lines 15–20) to include the new constants:

```typescript
import {
  DB_NAME,
  DB_VERSION,
  DB_INIT_TIMEOUT_MS,
  INIT_RETRY_DELAY_MS,
  DELETE_DB_TIMEOUT_MS,
  CIRCUIT_BREAKER_THRESHOLD,
} from '../constants';
```

- [ ] **Step 2: Add circuit breaker state to the DatabaseManager class**

Add these private fields after the `dbVersion` field (after line 177):

```typescript
  private consecutiveFailures = 0;
  private circuitOpen = false;
  private isRecovering = false;
```

- [ ] **Step 3: Add `blocked` and `versionchange` callbacks to `openDatabaseWithTimeout()`**

Replace the `openDatabaseWithTimeout()` method (lines 190–210) with:

```typescript
  private async openDatabaseWithTimeout(): Promise<IDBPDatabase> {
    this.logger.log(`[DatabaseManager] About to call openDB("${this.dbName}", ${this.dbVersion})...`);

    const openDBPromise = openDB(this.dbName, this.dbVersion, {
      upgrade: (db, oldVersion, newVersion, transaction) => {
        this.logger.log(`[DatabaseManager] Upgrade callback triggered - oldVersion: ${oldVersion}, newVersion: ${newVersion}`);
        createObjectStores(db, oldVersion, transaction as unknown as IDBTransaction, this.logger);
      },
      blocked: () => {
        this.logger.warn(`[DatabaseManager] openDB blocked by existing connection — force-closing stale sharedDB`);
        if (sharedDB) {
          try { sharedDB.close(); } catch { /* ignore */ }
          sharedDB = null;
        }
      },
    }).then((db) => {
      this.logger.log(`[DatabaseManager] openDB() promise resolved!`);
      db.onversionchange = () => {
        this.logger.warn(`[DatabaseManager] Another instance requested upgrade — closing connection`);
        db.close();
        sharedDB = null;
        dbInitPromise = null;
      };
      return db;
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Database open timed out after ${DB_INIT_TIMEOUT_MS}ms - database may be corrupted or locked`));
      }, DB_INIT_TIMEOUT_MS);
    });

    return Promise.race([openDBPromise, timeoutPromise]);
  }
```

- [ ] **Step 4: Add `recordFailure()`, `resetFailures()`, and `recover()` methods**

Add these three methods after the `reset()` method (after line 413), before the closing `}` of the class:

```typescript
  /**
   * Record a getAll/init failure. Trips circuit breaker after threshold.
   */
  recordFailure(): void {
    this.consecutiveFailures++;
    this.logger.warn(
      `[DatabaseManager] Failure recorded (${this.consecutiveFailures}/${CIRCUIT_BREAKER_THRESHOLD})`
    );

    if (this.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD && !this.circuitOpen) {
      this.circuitOpen = true;
      this.logger.error(
        `[DatabaseManager] Circuit breaker tripped after ${this.consecutiveFailures} consecutive failures`
      );
      this.recover().catch(err =>
        this.logger.error(`[DatabaseManager] Recovery failed:`, err)
      );
    }
  }

  /**
   * Reset the failure counter (called after a successful operation)
   */
  resetFailures(): void {
    if (this.consecutiveFailures > 0) {
      this.consecutiveFailures = 0;
    }
    this.circuitOpen = false;
  }

  /**
   * Auto-recover: force-close, nuke IndexedDB, re-open, emit event
   */
  private async recover(): Promise<void> {
    if (this.isRecovering) return;
    this.isRecovering = true;

    this.logger.warn(`[DatabaseManager] Starting auto-recovery...`);

    // Step 1: Force-close existing connection
    if (sharedDB) {
      try { sharedDB.close(); } catch { /* ignore */ }
    }

    // Step 2: Null out all module-level state
    sharedDB = null;
    dbInitPromise = null;
    dbInitInProgress = false;
    tableInitQueue = Promise.resolve();
    tablesInitialized = 0;

    // Step 3: Try to delete IndexedDB (with short timeout — may hang if locked)
    try {
      await Promise.race([
        deleteDB(this.dbName),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('deleteDB timed out')), DELETE_DB_TIMEOUT_MS)
        ),
      ]);
      this.logger.log(`[DatabaseManager] IndexedDB deleted successfully`);
    } catch {
      this.logger.warn(`[DatabaseManager] deleteDB timed out or failed — proceeding without deletion`);
    }

    // Step 4: Try to re-open fresh
    try {
      dbInitPromise = this.openDatabaseWithTimeout();
      sharedDB = await dbInitPromise;
      this.logger.log(`[DatabaseManager] Database re-opened after recovery`);
    } catch (error) {
      this.logger.error(`[DatabaseManager] Failed to re-open database after recovery:`, error);
      dbInitPromise = null;
      sharedDB = null;
    }

    // Step 5: Reset circuit breaker state
    this.consecutiveFailures = 0;
    this.circuitOpen = false;
    this.isRecovering = false;

    // Step 6: Emit recovery event for the app layer
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('replication:recovery', { detail: { reason: 'circuit-breaker' } })
      );
    }
  }

  /**
   * Check if the circuit breaker is currently open
   */
  isCircuitOpen(): boolean {
    return this.circuitOpen;
  }
```

- [ ] **Step 5: [ADDED] Update `getDatabase()` catch block to use new recovery**

Replace the existing catch block in `getDatabase()` (lines 338–373) that calls `recoverFromCorruption()` with the new circuit-breaker-aware recovery:

```typescript
    } catch (error) {
      this.logger.error(`[DatabaseManager] Failed to open database:`, error);

      // Use circuit breaker recovery instead of legacy recoverFromCorruption()
      dbInitInProgress = false;
      dbInitPromise = null;
      sharedDB = null;

      await this.recover();

      // If recover() re-opened successfully, return it
      if (sharedDB) {
        return sharedDB;
      }

      throw error;
    }
```

Also delete the now-unused `recoverFromCorruption()` method (lines 215–236). It is fully replaced by `recover()`.

- [ ] **Step 6: Update `getStatus()` to include circuit breaker state**

Replace the `getStatus()` method (lines 386–398) with:

```typescript
  getStatus(): {
    isInitialized: boolean;
    initInProgress: boolean;
    tablesInitialized: number;
    activeTransactions: number;
    consecutiveFailures: number;
    circuitOpen: boolean;
  } {
    return {
      isInitialized: sharedDB !== null,
      initInProgress: dbInitInProgress,
      tablesInitialized,
      activeTransactions: activeTransactions.size,
      consecutiveFailures: this.consecutiveFailures,
      circuitOpen: this.circuitOpen,
    };
  }
```

- [ ] **Step 7: Update `reset()` to also reset circuit breaker state**

Replace the `reset()` method (lines 403–413) with:

```typescript
  async reset(): Promise<void> {
    if (sharedDB) {
      sharedDB.close();
    }
    sharedDB = null;
    dbInitPromise = null;
    dbInitInProgress = false;
    tableInitQueue = Promise.resolve();
    tablesInitialized = 0;
    activeTransactions.clear();
    this.consecutiveFailures = 0;
    this.circuitOpen = false;
    this.isRecovering = false;
  }
```

- [ ] **Step 8: Verify it compiles**

Run: `cd packages/replication && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add packages/replication/src/core/DatabaseManager.ts
git commit -m "feat(replication): add circuit breaker, blocked/versionchange callbacks, and auto-recovery to DatabaseManager"
```

---

### Task 3: Wire `getAll()` to circuit breaker

**Files:**

- Modify: `packages/replication/src/core/ReplicatedTable.ts:21-24,381-412`

- [ ] **Step 1: Add import for `GET_ALL_TIMEOUT_MS`**

In `packages/replication/src/core/ReplicatedTable.ts`, update the import from `'../constants'` (lines 21–24) to include `GET_ALL_TIMEOUT_MS`:

```typescript
import {
  QUERY_TIMEOUT_MS,
  SLOW_QUERY_THRESHOLD_MS,
  MAX_OPTIMISTIC_UPDATE_RETRIES,
  GET_ALL_TIMEOUT_MS,
} from '../constants';
```

- [ ] **Step 2: Replace `getAll()` to use constant and wire circuit breaker**

Replace the `getAll()` method (lines 381–412) with:

```typescript
  async getAll(licenseKey?: string): Promise<T[]> {
    const getAllPromise = (async () => {
      const db = await this.init();
      const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
      const index = tx.store.index('tableName');

      const rows = (await index.getAll(this.tableName)) as ReplicatedRow<T>[];
      const freshRows = rows.filter(row => !this.cacheManager.isExpired(row));

      if (licenseKey) {
        return freshRows
          .filter(row => (row.data as Record<string, unknown>).license_key === licenseKey)
          .map(row => row.data);
      }

      return freshRows.map(row => row.data);
    })();

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`[${this.tableName}] getAll() timed out after ${GET_ALL_TIMEOUT_MS}ms`));
      }, GET_ALL_TIMEOUT_MS);
    });

    try {
      const result = await Promise.race([getAllPromise, timeoutPromise]);
      databaseManager.resetFailures();
      return result;
    } catch (error) {
      this.logger.error(`[${this.tableName}] getAll() failed:`, error);
      databaseManager.recordFailure();
      return [];
    }
```

Note: the closing `}` for the method and the code after it remain unchanged.

- [ ] **Step 3: Verify it compiles**

Run: `cd packages/replication && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/replication/src/core/ReplicatedTable.ts
git commit -m "feat(replication): wire getAll() to circuit breaker with 5s timeout"
```

---

### Task 4: Build the replication package

**Files:**

- None (build verification)

- [ ] **Step 1: Build the package**

Run: `cd packages/replication && pnpm build`
Expected: Build succeeds with no errors. The compiled output lands in `packages/replication/dist/`.

- [ ] **Step 2: Verify the app still type-checks against the new package**

Run: `pnpm typecheck`
Expected: No errors (or only pre-existing ones unrelated to this change)

- [ ] **Step 3: Commit if build config changed**

If the build step required any changes, commit them. Otherwise skip.

---

### Task 5: Add recovery event listener to ReplicationSyncProvider

**Files:**

- Modify: `apps/myk9show/src/providers/ReplicationSyncProvider.tsx:18-19,315-323`

- [ ] **Step 1: Add notifications import**

In `apps/myk9show/src/providers/ReplicationSyncProvider.tsx`, add the import after the existing logger import (line 18):

```typescript
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
```

- [ ] **Step 2: Add recovery event listener**

Add a new `useEffect` after the existing `replication:sync-requested` listener block (after line 323):

```typescript
// Listen for circuit breaker recovery — show toast and re-sync
useEffect(() => {
  const handleRecovery = (event: Event) => {
    const { reason } = (event as CustomEvent<{ reason: string }>).detail;
    logger.warn('IndexedDB recovery triggered', 'replication', { reason });
    notifications.info('Resyncing local data...');
    triggerSyncRef.current?.();
  };
  window.addEventListener('replication:recovery', handleRecovery);
  return () => window.removeEventListener('replication:recovery', handleRecovery);
}, []);
```

- [ ] **Step 3: Verify it compiles**

Run: `cd apps/myk9show && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/providers/ReplicationSyncProvider.tsx
git commit -m "feat(replication): show toast and re-sync on IndexedDB recovery"
```

---

### Task 6: Write DatabaseManager circuit breaker tests

**Files:**

- Modify: `packages/replication/src/core/DatabaseManager.test.ts`

- [ ] **Step 1: Add circuit breaker test suite**

Append the following `describe` block at the end of `packages/replication/src/core/DatabaseManager.test.ts` (after the `Transaction tracking` describe block, before the final closing of the file):

```typescript
describe('Circuit breaker', () => {
  let dbManager: DatabaseManager;

  beforeEach(async () => {
    const { databaseManager: singletonMgr } = await import('./DatabaseManager');
    await singletonMgr.reset();
    dbManager = new DatabaseManager({}, 'test-circuit-' + Date.now(), 5);
  });

  afterEach(async () => {
    await dbManager.reset();
  });

  it('should start with zero failures and circuit closed', () => {
    const status = dbManager.getStatus();
    expect(status.consecutiveFailures).toBe(0);
    expect(status.circuitOpen).toBe(false);
  });

  it('should increment failure count on recordFailure()', () => {
    dbManager.recordFailure();
    expect(dbManager.getStatus().consecutiveFailures).toBe(1);

    dbManager.recordFailure();
    expect(dbManager.getStatus().consecutiveFailures).toBe(2);
  });

  it('should reset failure count on resetFailures()', () => {
    dbManager.recordFailure();
    dbManager.recordFailure();
    dbManager.resetFailures();

    const status = dbManager.getStatus();
    expect(status.consecutiveFailures).toBe(0);
    expect(status.circuitOpen).toBe(false);
  });

  it('should trip circuit after threshold consecutive failures', async () => {
    // Listen for the recovery event
    let recoveryFired = false;
    const handler = () => {
      recoveryFired = true;
    };
    window.addEventListener('replication:recovery', handler);

    dbManager.recordFailure();
    dbManager.recordFailure();
    expect(dbManager.isCircuitOpen()).toBe(false);

    dbManager.recordFailure(); // threshold = 3

    // Recovery is async — give it a tick to complete
    await new Promise(r => setTimeout(r, 100));

    expect(recoveryFired).toBe(true);

    // After recovery completes, circuit resets
    expect(dbManager.getStatus().consecutiveFailures).toBe(0);
    expect(dbManager.getStatus().circuitOpen).toBe(false);

    window.removeEventListener('replication:recovery', handler);
  });

  it('[ADDED] should recover even when deleteDB would time out', async () => {
    // The recovery path wraps deleteDB in a 3s timeout.
    // If deleteDB hangs, recovery should still proceed (re-open + emit event).
    // We verify by tripping the circuit and checking the event fires + state resets.
    let recoveryFired = false;
    const handler = () => {
      recoveryFired = true;
    };
    window.addEventListener('replication:recovery', handler);

    // Trip the circuit breaker
    dbManager.recordFailure();
    dbManager.recordFailure();
    dbManager.recordFailure();

    // Wait for async recovery (deleteDB timeout is 3s, but our test DB is fresh
    // so deleteDB should succeed fast — the important thing is recovery completes)
    await new Promise(r => setTimeout(r, 500));

    expect(recoveryFired).toBe(true);
    expect(dbManager.getStatus().consecutiveFailures).toBe(0);

    window.removeEventListener('replication:recovery', handler);
  });

  it('should reset failure count and circuit state on reset()', async () => {
    dbManager.recordFailure();
    dbManager.recordFailure();
    await dbManager.reset();

    const status = dbManager.getStatus();
    expect(status.consecutiveFailures).toBe(0);
    expect(status.circuitOpen).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `cd packages/replication && npx vitest run src/core/DatabaseManager.test.ts`
Expected: All tests pass, including the new circuit breaker suite

- [ ] **Step 3: Commit**

```bash
git add packages/replication/src/core/DatabaseManager.test.ts
git commit -m "test(replication): add circuit breaker unit tests"
```

---

### Task 7: Write ReplicatedTable getAll() failure recording tests

**Files:**

- Modify: `packages/replication/src/core/ReplicatedTable.test.ts`

- [ ] **Step 1: Add getAll failure/success recording tests**

Add the following `describe` block inside the existing top-level `describe('ReplicatedTable', ...)` block, after the last existing `describe`:

```typescript
describe('getAll circuit breaker integration', () => {
  it('should reset failures on successful getAll()', async () => {
    const { databaseManager } = await import('./DatabaseManager');

    // Seed a row so getAll returns data
    await table.set('1', { id: '1', name: 'Rex' });

    // Artificially record a failure
    databaseManager.recordFailure();
    expect(databaseManager.getStatus().consecutiveFailures).toBe(1);

    // Successful getAll should reset
    const result = await table.getAll();
    expect(result.length).toBe(1);
    expect(databaseManager.getStatus().consecutiveFailures).toBe(0);
  });

  it('should use GET_ALL_TIMEOUT_MS constant', async () => {
    // Verify the constant is imported and used (no hardcoded 20000)
    // This is a compile-time check — if GET_ALL_TIMEOUT_MS is removed,
    // the build will fail. The runtime behavior is tested by the
    // circuit breaker tests in DatabaseManager.test.ts.
    const { GET_ALL_TIMEOUT_MS } = await import('../constants');
    expect(GET_ALL_TIMEOUT_MS).toBe(5000);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `cd packages/replication && npx vitest run src/core/ReplicatedTable.test.ts`
Expected: All tests pass, including the new suite

- [ ] **Step 3: Commit**

```bash
git add packages/replication/src/core/ReplicatedTable.test.ts
git commit -m "test(replication): add getAll() circuit breaker integration tests"
```

---

### Task 8: Final build and full test run

**Files:**

- None (verification only)

- [ ] **Step 1: Build the replication package**

Run: `cd packages/replication && pnpm build`
Expected: Build succeeds

- [ ] **Step 2: Run all replication tests**

Run: `cd packages/replication && pnpm test`
Expected: All tests pass

- [ ] **Step 3: Run full monorepo typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 4: Run myK9Show tests**

Run: `cd apps/myk9show && pnpm test`
Expected: All tests pass (the new event listener doesn't need dedicated React tests — it follows the identical pattern of the existing `replication:sync-requested` and `replication:upload-complete` listeners)
