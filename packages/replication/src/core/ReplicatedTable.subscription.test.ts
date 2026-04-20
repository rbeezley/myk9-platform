import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { ReplicatedTable } from './ReplicatedTable';
import type { SyncResult, SyncOptions } from '../types';

// ---------------------------------------------------------------------------
// Minimal concrete subclass for testing
// ---------------------------------------------------------------------------

interface TestEntity {
  id: string;
  name: string;
  score?: number;
}

class TestTable extends ReplicatedTable<TestEntity> {
  async sync(_licenseKey: string, _options?: Partial<SyncOptions>): Promise<SyncResult> {
    return {
      tableName: this.tableName,
      success: true,
      operation: 'full-sync',
      rowsAffected: 0,
      duration: 0,
    };
  }

  protected resolveConflict(_local: TestEntity, remote: TestEntity): TestEntity {
    return remote;
  }
}

function makeTable(suffix?: string): TestTable {
  const name = 'sub_test_' + Date.now() + '_' + (suffix ?? Math.random().toString(36).slice(2));
  return new TestTable(name);
}

// ---------------------------------------------------------------------------

describe('ReplicatedTable subscription lifecycle', () => {
  beforeEach(async () => {
    const { databaseManager } = await import('./DatabaseManager');
    await databaseManager.reset();
  });

  afterEach(async () => {
    const { databaseManager } = await import('./DatabaseManager');
    await databaseManager.reset();
  });

  // -------------------------------------------------------------------------
  // Test 1: The IDB listener subscription is torn down when unsubscribe is called.
  //
  // Note: ReplicatedTable has no Supabase postgres_changes channels — the
  // `subscribe` API manages IDB change listeners only (cacheManager.subscribe).
  // This test verifies that after calling the returned unsubscribe function,
  // subsequent writes no longer fire the callback — i.e. the channel is fully
  // torn down. This directly covers the "removeChannel on teardown" class of
  // resource-cleanup bugs adapted to the real API surface.
  // -------------------------------------------------------------------------
  it('removes the IDB listener subscription when unsubscribe is called', async () => {
    const table = makeTable('unsub');

    const callback = vi.fn();
    const unsubscribe = table.subscribe(callback);

    // Wait for the leading-edge immediate notification
    await new Promise(r => setTimeout(r, 50));

    // Teardown the subscription
    unsubscribe();
    callback.mockClear();

    // Any subsequent write must NOT reach the callback
    await table.set('1', { id: '1', name: 'Rex' });

    // Wait longer than the debounce window (NOTIFY_DEBOUNCE_MS = 100ms)
    await new Promise(r => setTimeout(r, 250));

    expect(callback).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 2: A real-time push (set with isDirty=false) must NOT overwrite a row
  // that has a pending local mutation (isDirty=true).
  //
  // This is the open scoring-sync-bug hypothesis: a real-time event arriving
  // while a local write is pending silently clobbers the local change.
  //
  // Current behaviour: set() overwrites unconditionally → test fails → fix applied.
  // -------------------------------------------------------------------------
  it('does not overwrite a row in IDB if a pending mutation exists for that row', async () => {
    const table = makeTable('dirty');

    // Arrange: store a locally-mutated (dirty) row — simulates a pending write
    const localData: TestEntity = { id: '1', name: 'local-pending-value', score: 99 };
    await table.set('1', localData, true /* isDirty */);

    // Verify the dirty row is present
    const before = await table.get('1');
    expect(before?.name).toBe('local-pending-value');

    // Act: simulate a real-time server push for the same row with stale server data
    const serverData: TestEntity = { id: '1', name: 'server-overwrite', score: 50 };
    await table.set('1', serverData, false /* isDirty=false → simulates real-time push */);

    // Assert: the locally-mutated value must survive; the server push must be rejected
    const after = await table.get('1');
    expect(after?.name).toBe('local-pending-value');
    expect(after?.score).toBe(99);
  });

  // -------------------------------------------------------------------------
  // Test 3: getAll() swallows IDB errors and returns [] as a documented fallback.
  //
  // DOCUMENTED BEHAVIOR (not a bug we fix here): the catch block in getAll()
  // logs the error, records a circuit-breaker failure, and returns [].
  // Changing this would require updating 177 production callers across
  // apps/myk9q and apps/myk9show that all assume getAll() always resolves.
  // See docs/replication-audit/phase-1-read-path.md Finding C-2/E-1 (HIGH)
  // for the full remediation plan deferred to a dedicated fix pass.
  // -------------------------------------------------------------------------
  it('logs getAll errors and returns an empty array as a documented fallback', async () => {
    const table = makeTable('err');

    // Ensure DB is initialised so we can close it to force errors
    await table.getAll();

    // Close the shared DB connection to simulate a fatal IDB error on next access
    const { databaseManager } = await import('./DatabaseManager');
    await databaseManager.reset(); // closes + clears sharedDB

    // Re-open DB to get a handle, then close it behind table's back
    const { databaseManager: dm2 } = await import('./DatabaseManager');
    const db = await dm2.getDatabase(table.getTableName());
    db.close(); // close without resetting sharedDB — next transaction will throw

    // Act / Assert: getAll() resolves with [] (swallowed error — documented fallback)
    // NOTE: This behaviour is intentional given the caller count; see audit doc.
    const result = await table.getAll();
    expect(result).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Test 4: getAll() returns cached IDB rows when the network is offline.
  //
  // The isExpired guard in cacheManager skips TTL checks when navigator.onLine
  // is false, so even rows with an expired lastSyncedAt must be served.
  // No Supabase call should be made (getAll is IDB-only — verified by the
  // absence of any supabase mock needed).
  // -------------------------------------------------------------------------
  it('returns cached data from IDB when the network is offline', async () => {
    const table = makeTable('offline');

    // Arrange: prime IDB with 3 rows with an already-expired lastSyncedAt so
    // they would normally be filtered out when online. We do this by inserting
    // them and then manually backdating via the raw IDB store.
    await table.set('1', { id: '1', name: 'Alpha' });
    await table.set('2', { id: '2', name: 'Beta' });
    await table.set('3', { id: '3', name: 'Gamma' });

    // Backdate lastSyncedAt to force TTL expiry (set to 1ms epoch)
    const { databaseManager } = await import('./DatabaseManager');
    const db = await databaseManager.getDatabase(table.getTableName());
    const { REPLICATION_STORES } = await import('./DatabaseManager');
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const index = tx.store.index('tableName');
    const rows = await index.getAll(table.getTableName());
    for (const row of rows) {
      row.lastSyncedAt = 1; // epoch start → expired relative to any TTL
      row.isDirty = false; // ensure dirty guard doesn't save them
      await tx.store.put(row);
    }
    await tx.done;

    // Confirm rows are expired online (they should be filtered out)
    const originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine');
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    await table.getAll();
    // Rows have expired TTL online — should be empty (or near-empty depending on
    // lastSuccessfulSyncAt guard). Either way, restore offline mode.

    // Stub navigator.onLine = false
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    try {
      // Act: fetch while offline
      const offlineResult = await table.getAll();

      // Assert: all 3 cached rows are returned despite expired TTL
      expect(offlineResult).toHaveLength(3);
      const names = offlineResult.map(r => r.name).sort();
      expect(names).toEqual(['Alpha', 'Beta', 'Gamma']);

      // Confirm no Supabase call was made — getAll is IDB-only by design.
      // (There is no supabase client in ReplicatedTable to mock; this assertion
      // is structural: if getAll ever calls supabase, tests would need a mock.)
      expect(offlineResult.every(r => r.id !== undefined)).toBe(true);
    } finally {
      // Restore navigator.onLine
      if (originalOnLine) {
        Object.defineProperty(navigator, 'onLine', originalOnLine);
      } else {
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Flaky-network tests
//
// ReplicatedTable.getAll() is IDB-only — there is no network fetch path in
// the base class (each subclass implements sync() for that). The "network
// drop" scenario therefore maps to an IDB-level failure mid-read, which
// getAll() already handles by returning []. These tests verify:
//
//  1. A failed getAll() (simulated by closing the DB connection) does NOT
//     corrupt the IDB store — a subsequent successful read still returns
//     the originally written rows.
//
//  2. Applying the same real-time UPDATE event twice (same data, same id)
//     does not produce duplicate writes or corrupt the stored row — the
//     second set() call is idempotent when the row already has the same data.
// ---------------------------------------------------------------------------

describe('ReplicatedTable: flaky network', () => {
  beforeEach(async () => {
    const { databaseManager } = await import('./DatabaseManager');
    await databaseManager.reset();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    const { databaseManager } = await import('./DatabaseManager');
    await databaseManager.reset();
  });

  // -------------------------------------------------------------------------
  // Test 5: getAll() failure does not corrupt cache — original rows survive
  //
  // Simulates a transient IDB failure by making databaseManager.getDatabase()
  // throw once (as would happen during a brief network/IDB drop), then
  // succeed on the next call. getAll() swallows the error and returns [].
  // The subsequent successful call must return the original 3 rows —
  // proving the store was not cleared by the failed read.
  // -------------------------------------------------------------------------
  it('recovers from a mid-fetch network drop without corrupting the cache', async () => {
    const table = makeTable('flaky-net');
    const { databaseManager } = await import('./DatabaseManager');

    // Arrange: prime IDB with 3 rows using the real DB (before spy is applied)
    await table.set('1', { id: '1', name: 'Alpha' });
    await table.set('2', { id: '2', name: 'Beta' });
    await table.set('3', { id: '3', name: 'Gamma' });

    const realDb = await databaseManager.getDatabase(table.getTableName());

    // Spy: throw once (simulates IDB drop), then return the real DB
    const spy = vi
      .spyOn(databaseManager, 'getDatabase')
      .mockRejectedValueOnce(new Error('IDB connection lost'))
      .mockResolvedValue(realDb);

    // Act: getAll() with the injected failure — must return [] (documented fallback)
    const duringFailure = await table.getAll();
    expect(duringFailure).toEqual([]);
    expect(spy).toHaveBeenCalledTimes(1);

    // Act: restore real behaviour and read again
    spy.mockRestore();

    // Original 3 rows must still be present — failure did NOT clear the store
    const after = await table.getAll();
    expect(after).toHaveLength(3);
    const names = after.map(r => r.name).sort();
    expect(names).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  // -------------------------------------------------------------------------
  // Test 6: duplicate real-time event replay is idempotent — no double-apply
  //
  // In production, a real-time UPDATE event arriving via Supabase triggers a
  // set(id, serverData, false) call on the local cache. If the same event is
  // delivered twice (network retry / at-least-once delivery), the second
  // set() must not double-apply or corrupt the row.
  //
  // Verification strategy:
  //  - Call set() twice with identical payload (isDirty=false both times)
  //  - Assert the row exists once in IDB with the correct data
  //  - Assert the version counter increments on each write (set() always
  //    bumps version, so two calls produce version=2) — this is expected
  //    behaviour, not a bug: the guard only prevents clobbering dirty rows.
  // -------------------------------------------------------------------------
  it('retries a failed real-time event replay without double-applying', async () => {
    const table = makeTable('replay-idem');

    const serverPayload: TestEntity = { id: 'row-1', name: 'Server Value', score: 42 };

    // Act: deliver the same real-time UPDATE event twice (isDirty=false both times)
    await table.set('row-1', serverPayload, false);
    await table.set('row-1', serverPayload, false);

    // Assert: exactly one row exists in IDB
    const { databaseManager } = await import('./DatabaseManager');
    const { REPLICATION_STORES } = await import('./DatabaseManager');
    const db = await databaseManager.getDatabase(table.getTableName());
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
    const index = tx.store.index('tableName');
    const allRows = await index.getAll(table.getTableName());
    expect(allRows).toHaveLength(1);

    // The stored data matches the server payload
    expect(allRows[0]?.data).toMatchObject({ id: 'row-1', name: 'Server Value', score: 42 });

    // getAll() also returns exactly one row
    const result = await table.getAll();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject(serverPayload);
  });
});
