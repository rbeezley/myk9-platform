import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReplicatedTableCacheManager } from './ReplicatedTableCache';
import { DatabaseManager, REPLICATION_STORES } from './DatabaseManager';
import type { IDBPDatabase } from 'idb';
import type { ReplicatedRow } from '../types';

interface TestEntity {
  id: string;
  name: string;
}

describe('ReplicatedTableCacheManager', () => {
  let dbManager: DatabaseManager;
  let db: IDBPDatabase;
  let cacheManager: ReplicatedTableCacheManager<TestEntity>;
  let tableName: string;

  beforeEach(async () => {
    // Reset module-level singleton first
    const { databaseManager: singletonMgr } = await import('./DatabaseManager');
    await singletonMgr.reset();

    tableName = 'test_cache_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    dbManager = new DatabaseManager({}, 'test-cache-db-' + Date.now(), 5);
    db = await dbManager.getDatabase(tableName);

    const getDb = async () => db;
    const getAllData = async () => {
      const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
      const index = tx.store.index('tableName');
      const rows = (await index.getAll(tableName)) as ReplicatedRow<TestEntity>[];
      return { ok: true as const, rows: rows.map(r => r.data), error: null };
    };

    cacheManager = new ReplicatedTableCacheManager<TestEntity>(
      tableName,

      { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
      getDb,
      getAllData
    );
  });

  afterEach(async () => {
    // notifyListeners() is async: it first awaits the leading-edge
    // actuallyNotifyListeners() (which does an IDB read), and ONLY THEN
    // schedules a trailing-edge setTimeout (~100ms) that does another IDB
    // read. subscribe() fires notifyListeners() without awaiting it, so a
    // synchronous test that calls subscribe() leaves an in-flight async
    // call that hasn't reached the setTimeout yet when the test body ends.
    //
    // If afterEach reads `notifyDebounceTimer` and closes the DB before
    // that in-flight call finishes scheduling, the trailing-edge timer
    // fires later against a closed IDB handle and surfaces as an unhandled
    // InvalidStateError. So:
    //   1. Drop subscribers so callbacks no-op.
    //   2. Wait > NOTIFY_DEBOUNCE_MS so any in-flight notifyListeners()
    //      has time to schedule AND fire its trailing-edge timer against
    //      the still-open DB.
    //   3. Cancel any timer that somehow got rescheduled during the wait.
    const internals = cacheManager as unknown as {
      notifyDebounceTimer: ReturnType<typeof setTimeout> | null;
      hasNotifiedLeadingEdge: boolean;
      listeners: Set<unknown>;
    };
    internals.listeners.clear();

    // NOTIFY_DEBOUNCE_MS is 100; 150ms covers it plus the trailing-edge's
    // own IDB read latency before we tear down the DB.
    await new Promise(r => setTimeout(r, 150));

    if (internals.notifyDebounceTimer) {
      clearTimeout(internals.notifyDebounceTimer);
      internals.notifyDebounceTimer = null;
    }
    internals.hasNotifiedLeadingEdge = false;

    await dbManager.reset();
  });

  // Helper to insert a row directly into IDB
  async function insertRow(
    id: string,
    data: TestEntity,
    overrides: Partial<ReplicatedRow<TestEntity>> = {}
  ): Promise<void> {
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const row: ReplicatedRow<TestEntity> = {
      tableName: tableName,
      id,
      data,
      version: 1,
      lastSyncedAt: Date.now(),
      lastAccessedAt: Date.now(),
      isDirty: false,
      syncStatus: 'synced',
      ...overrides,
    };
    await tx.store.put(row);
    await tx.done;
  }

  describe('subscribe', () => {
    it('should call callback with current data immediately', async () => {
      await insertRow('1', { id: '1', name: 'Rex' });

      const callback = vi.fn();
      cacheManager.subscribe(callback);

      await new Promise(r => setTimeout(r, 50));

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0]![0]).toEqual([{ id: '1', name: 'Rex' }]);
    });

    it('should return an unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = cacheManager.subscribe(callback);

      expect(typeof unsubscribe).toBe('function');
    });

    it('can omit the current snapshot while retaining future notifications', async () => {
      const callback = vi.fn();
      cacheManager.subscribe(callback, { emitCurrent: false });

      await new Promise(r => setTimeout(r, 50));
      expect(callback).not.toHaveBeenCalled();

      await cacheManager.notifyListeners();
      expect(callback).toHaveBeenCalled();
    });

    it('should not call callback after unsubscribe', async () => {
      const callback = vi.fn();
      const unsubscribe = cacheManager.subscribe(callback);

      await new Promise(r => setTimeout(r, 50));
      callback.mockClear();

      unsubscribe();

      await cacheManager.notifyListeners();
      await new Promise(r => setTimeout(r, 200));

      expect(callback).not.toHaveBeenCalled();
    });

    it('should support multiple subscribers', async () => {
      await insertRow('1', { id: '1', name: 'Rex' });

      const cb1 = vi.fn();
      const cb2 = vi.fn();
      cacheManager.subscribe(cb1);
      cacheManager.subscribe(cb2);

      await new Promise(r => setTimeout(r, 50));

      expect(cb1).toHaveBeenCalled();
      expect(cb2).toHaveBeenCalled();
    });
  });

  describe('getListenerCount', () => {
    it('should return 0 with no subscribers', () => {
      expect(cacheManager.getListenerCount()).toBe(0);
    });

    it('should track subscriber count', () => {
      const unsub1 = cacheManager.subscribe(vi.fn());
      expect(cacheManager.getListenerCount()).toBe(1);

      const unsub2 = cacheManager.subscribe(vi.fn());
      expect(cacheManager.getListenerCount()).toBe(2);

      unsub1();
      expect(cacheManager.getListenerCount()).toBe(1);

      unsub2();
      expect(cacheManager.getListenerCount()).toBe(0);
    });
  });

  describe('notifyListeners', () => {
    it('should use leading-edge debounce', async () => {
      const callback = vi.fn();
      cacheManager.subscribe(callback);

      // Wait for initial subscribe callback
      await new Promise(r => setTimeout(r, 50));
      callback.mockClear();

      // Fire multiple notifications rapidly
      await cacheManager.notifyListeners();
      await cacheManager.notifyListeners();
      await cacheManager.notifyListeners();

      // Leading edge fires immediately, then debounced trailing edge
      // Wait for debounce to complete
      await new Promise(r => setTimeout(r, 200));

      // Should have been called with leading edge + trailing edge
      expect(callback.mock.calls.length).toBeGreaterThanOrEqual(1);
      expect(callback.mock.calls.length).toBeLessThanOrEqual(3);
    });

    it('should clear debounce state when trailing notification fails', async () => {
      const error = new Error('read failed');
      const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
      let readCount = 0;

      const rejectingManager = new ReplicatedTableCacheManager<TestEntity>(
        tableName,

        logger,
        async () => db,
        async () => {
          readCount++;
          if (readCount === 1) return { ok: true as const, rows: [], error: null };
          throw error;
        }
      );

      await rejectingManager.notifyListeners();
      await new Promise(r => setTimeout(r, 150));

      const internals = rejectingManager as unknown as {
        notifyDebounceTimer: ReturnType<typeof setTimeout> | null;
        hasNotifiedLeadingEdge: boolean;
      };

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to notify listeners'),
        error
      );
      expect(internals.notifyDebounceTimer).toBeNull();
      expect(internals.hasNotifiedLeadingEdge).toBe(false);
    });
  });

  describe('estimateTotalSize', () => {
    it('should return 0 for empty table', async () => {
      const size = await cacheManager.estimateTotalSize();
      expect(size).toBe(0);
    });

    it('should return positive number for populated table', async () => {
      await insertRow('1', { id: '1', name: 'Rex' });
      await insertRow('2', { id: '2', name: 'Buddy' });

      const size = await cacheManager.estimateTotalSize();
      expect(size).toBeGreaterThan(0);
    });
  });

  describe('getCacheStats', () => {
    it('should return stats for empty table', async () => {
      const stats = await cacheManager.getCacheStats();

      expect(stats.rowCount).toBe(0);
      expect(stats.sizeBytes).toBe(0);
      expect(stats.dirtyCount).toBe(0);
      expect(stats.oldestAccess).toBe(0);
      expect(stats.newestAccess).toBe(0);
    });

    it('should return accurate stats', async () => {
      const now = Date.now();
      await insertRow(
        '1',
        { id: '1', name: 'Rex' },
        { lastAccessedAt: now - 1000, isDirty: true, syncStatus: 'pending' }
      );
      await insertRow('2', { id: '2', name: 'Buddy' }, { lastAccessedAt: now });

      const stats = await cacheManager.getCacheStats();

      expect(stats.rowCount).toBe(2);
      expect(stats.sizeBytes).toBeGreaterThan(0);
      expect(stats.sizeMB).toBeGreaterThan(0);
      expect(stats.dirtyCount).toBe(1);
      expect(stats.oldestAccess).toBeLessThan(stats.newestAccess);
    });
  });

  describe('evictLRU', () => {
    it('should not evict when already under target size', async () => {
      await insertRow('1', { id: '1', name: 'Rex' });

      const evicted = await cacheManager.evictLRU(1024 * 1024); // 1MB target

      expect(evicted).toBe(0);
    });

    it('should evict rows to reach target size', async () => {
      // Insert many rows with old access times
      const oldTime = Date.now() - 60000; // 60 seconds ago (past grace period)
      for (let i = 0; i < 20; i++) {
        await insertRow(
          `${i}`,
          { id: `${i}`, name: `Dog ${i}` },
          {
            lastAccessedAt: oldTime - i * 1000,
            accessCount: 1,
          }
        );
      }

      // Target: very small, should force eviction
      const evicted = await cacheManager.evictLRU(1);

      expect(evicted).toBeGreaterThan(0);
    });

    it('should not evict dirty rows', async () => {
      const oldTime = Date.now() - 60000;
      await insertRow(
        '1',
        { id: '1', name: 'Rex' },
        {
          isDirty: true,
          syncStatus: 'pending',
          lastAccessedAt: oldTime,
        }
      );

      const evicted = await cacheManager.evictLRU(1);

      expect(evicted).toBe(0);
    });

    it('should not evict recently accessed rows (grace period)', async () => {
      // Insert with very recent access
      await insertRow(
        '1',
        { id: '1', name: 'Rex' },
        {
          lastAccessedAt: Date.now(),
        }
      );

      const evicted = await cacheManager.evictLRU(1);

      expect(evicted).toBe(0);
    });
  });

  describe('evictRetainingFraction', () => {
    it('evicts roughly the oldest fraction of the footprint', async () => {
      const oldTime = Date.now() - 60000; // past the grace period
      for (let i = 0; i < 20; i++) {
        await insertRow(
          `${i}`,
          { id: `${i}`, name: `Dog ${i}` },
          { lastAccessedAt: oldTime - i * 1000, accessCount: 1 }
        );
      }

      // Retain ~70% → shed ~30% of the (uniform) rows.
      const evicted = await cacheManager.evictRetainingFraction(0.7);

      expect(evicted).toBeGreaterThan(0);
      expect(evicted).toBeLessThan(20);
    });

    it('never drops dirty rows even under aggressive retention', async () => {
      const oldTime = Date.now() - 60000;
      await insertRow(
        '1',
        { id: '1', name: 'Rex' },
        { isDirty: true, syncStatus: 'pending', lastAccessedAt: oldTime }
      );

      // Retain 0% would evict everything — but the only row is dirty.
      const evicted = await cacheManager.evictRetainingFraction(0);

      expect(evicted).toBe(0);
    });

    it('returns 0 on an empty table', async () => {
      const evicted = await cacheManager.evictRetainingFraction(0.7);

      expect(evicted).toBe(0);
    });
  });

  describe('getSyncMetadata / updateSyncMetadata', () => {
    it('should return falsy when no metadata exists', async () => {
      const metadata = await cacheManager.getSyncMetadata();
      expect(metadata).toBeFalsy();
    });

    it('should persist and retrieve metadata', async () => {
      await cacheManager.updateSyncMetadata({
        lastFullSyncAt: 12345,
        syncStatus: 'syncing',
      });

      const metadata = await cacheManager.getSyncMetadata();

      expect(metadata).not.toBeNull();
      expect(metadata!.tableName).toBe(tableName);
      expect(metadata!.lastFullSyncAt).toBe(12345);
      expect(metadata!.syncStatus).toBe('syncing');
    });

    it('should merge updates with existing metadata', async () => {
      await cacheManager.updateSyncMetadata({
        lastFullSyncAt: 1000,
        syncStatus: 'idle',
      });

      await cacheManager.updateSyncMetadata({
        syncStatus: 'syncing',
      });

      const metadata = await cacheManager.getSyncMetadata();

      expect(metadata!.lastFullSyncAt).toBe(1000); // preserved from explicit field
      expect(metadata!.syncStatus).toBe('syncing'); // updated
    });

    it('should atomically increment conflictCount', async () => {
      await cacheManager.updateSyncMetadata({
        conflictCount: 5,
      });

      await cacheManager.updateSyncMetadata({
        conflictCount: 3,
      });

      const metadata = await cacheManager.getSyncMetadata();
      expect(metadata!.conflictCount).toBe(8);
    });

    it('should atomically increment pendingMutations', async () => {
      await cacheManager.updateSyncMetadata({
        pendingMutations: 10,
      });

      await cacheManager.updateSyncMetadata({
        pendingMutations: 5,
      });

      const metadata = await cacheManager.getSyncMetadata();
      expect(metadata!.pendingMutations).toBe(15);
    });
  });
});
