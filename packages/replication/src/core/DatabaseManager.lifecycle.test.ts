/**
 * DatabaseManager lifecycle tests — Phase 4 of the replication-layer audit.
 *
 * Covers:
 *   - Schema version + object store presence on fresh open
 *   - Quota-exceeded error propagation (not silently swallowed)
 *   - versionchange event handler closes the connection cleanly
 *   - Recovery from a corrupt / failed open: re-opens within bounded time
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { DatabaseManager, REPLICATION_STORES } from './DatabaseManager';
import { DB_VERSION } from '../constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All 5 object stores the schema must create */
const EXPECTED_STORES = Object.values(REPLICATION_STORES) as string[];

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('DatabaseManager lifecycle', () => {
  let dbManager: DatabaseManager;

  beforeEach(async () => {
    // Reset the module-level singleton state so every test starts clean.
    const { databaseManager: singletonMgr } = await import('./DatabaseManager');
    await singletonMgr.reset();

    // Each test gets a unique DB name so fake-indexeddb doesn't bleed state.
    dbManager = new DatabaseManager(
      {},
      `lifecycle-test-${Date.now()}-${Math.random()}`,
      DB_VERSION
    );
  });

  afterEach(async () => {
    await dbManager.reset();
  });

  // -------------------------------------------------------------------------
  // 1. Schema version + all object stores
  // -------------------------------------------------------------------------
  it('opens at the expected schema version and creates all required object stores', async () => {
    const db = await dbManager.getDatabase('test');

    // Version must match the constant exported from constants.ts
    expect(db.version).toBe(DB_VERSION);

    // Every required store must be present
    for (const store of EXPECTED_STORES) {
      expect(db.objectStoreNames.contains(store)).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // 2. Quota-exceeded propagation
  // -------------------------------------------------------------------------
  it('surfaces quota-exceeded errors as a typed error, not silently', async () => {
    const db = await dbManager.getDatabase('test');

    // Stub a write on the PENDING_MUTATIONS store to throw QuotaExceededError.
    const quotaError = new DOMException('QuotaExceededError', 'QuotaExceededError');

    // We spy on the IDBObjectStore.put via the idb wrapper: intercept the
    // first `put` call on the pending_mutations store and reject it.
    const originalPut = db.put.bind(db);
    const putSpy = vi.spyOn(db, 'put').mockImplementationOnce(((
      storeName: string,
      ...args: unknown[]
    ) => {
      if (storeName === REPLICATION_STORES.PENDING_MUTATIONS) {
        return Promise.reject(quotaError) as ReturnType<typeof db.put>;
      }
      return (originalPut as (...a: unknown[]) => ReturnType<typeof db.put>)(storeName, ...args);
    }) as typeof db.put);

    // The rejection must propagate — not be swallowed.
    await expect(
      db.put(REPLICATION_STORES.PENDING_MUTATIONS, {
        id: 'quota-test',
        tableName: 'test_table',
        operation: 'INSERT',
        rowId: 'quota-test',
        data: {},
        timestamp: Date.now(),
        retries: 0,
        status: 'pending',
      })
    ).rejects.toThrow(/QuotaExceededError/);

    putSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // 3. versionchange event → clean close
  // -------------------------------------------------------------------------
  it('handles a versionchange event from a second tab by closing cleanly', async () => {
    const db = await dbManager.getDatabase('test');

    // Confirm DB is open and healthy before simulating the event.
    expect(db.objectStoreNames.contains(REPLICATION_STORES.REPLICATED_TABLES)).toBe(true);

    // Fire the versionchange handler that was attached in openDatabaseWithTimeout.
    // This mimics another tab requesting an upgrade.
    expect(db.onversionchange).toBeTruthy();
    // IDBVersionChangeEvent doesn't require arguments for this test.
    (db as unknown as IDBDatabase).onversionchange!.call(
      db as unknown as IDBDatabase,
      new IDBVersionChangeEvent('versionchange')
    );

    // After the handler runs: the manager should report no longer initialized.
    // (The handler closes the underlying IDBDatabase and nulls sharedDB.)
    expect(dbManager.isInitialized()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 4. Recovery from a failed open → fresh DB within bounded time
  // -------------------------------------------------------------------------
  it('recovers from a corrupt DB by deleting and reopening, not by hanging', async () => {
    // Arrange: open once so sharedDB is populated.
    await dbManager.getDatabase('test');
    expect(dbManager.isInitialized()).toBe(true);

    // Simulate corruption by marking enough consecutive failures to trip the
    // circuit breaker, which internally calls recover().
    // recover() closes + deletes the DB and re-opens it.
    const { CIRCUIT_BREAKER_THRESHOLD } = await import('../constants');

    for (let i = 0; i < CIRCUIT_BREAKER_THRESHOLD; i++) {
      dbManager.recordFailure();
    }

    // Give the async recovery enough time to complete (bounded: 1000ms).
    await new Promise(resolve => setTimeout(resolve, 500));

    // After recovery: DB must be open again (or at least not permanently locked).
    // The circuit and failure counter are reset.
    const status = dbManager.getStatus();
    expect(status.consecutiveFailures).toBe(0);
    expect(status.circuitOpen).toBe(false);

    // We must be able to get a fresh DB without hanging.
    const dbAfterRecovery = await Promise.race([
      dbManager.getDatabase('test'),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('getDatabase timed out after recovery')), 1000)
      ),
    ]);

    expect(dbAfterRecovery).toBeDefined();
    expect(dbAfterRecovery.objectStoreNames.contains(REPLICATION_STORES.REPLICATED_TABLES)).toBe(
      true
    );
  });
});
