import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { ReplicatedTableCacheManager } from './ReplicatedTableCache';
import { DatabaseManager, REPLICATION_STORES } from './DatabaseManager';
import type { IDBPDatabase } from 'idb';
import type { ReplicatedRow } from '../types';

// Ensure navigator.onLine is true for tests. In Node environments,
// navigator may not exist or may lack onLine, which tricks isExpired()
// into thinking we're offline.
const nav = typeof navigator !== 'undefined' ? navigator : (globalThis.navigator = {} as Navigator);
const originalOnLine = Object.getOwnPropertyDescriptor(nav, 'onLine');
beforeAll(() => {
  Object.defineProperty(nav, 'onLine', { value: true, configurable: true });
});
afterAll(() => {
  if (originalOnLine) {
    Object.defineProperty(nav, 'onLine', originalOnLine);
  }
});

interface TestEntity {
  id: string;
  name: string;
}

describe('ReplicatedTableCacheManager', () => {
  let dbManager: DatabaseManager;
  let db: IDBPDatabase;
  let cacheManager: ReplicatedTableCacheManager<TestEntity>;
  let tableName: string;
  const TTL_MS = 5000;

  beforeEach(async () => {
    // Reset module-level singleton first
    const { databaseManager: singletonMgr } = await import('./DatabaseManager');
    await singletonMgr.reset();

    tableName = 'test_cache_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    dbManager = new DatabaseManager({}, 'test-cache-db-' + Date.now(), 5);
    db = await dbManager.getDatabase(tableName);

    const getDb = async () => db;
    const getAllData = async (): Promise<TestEntity[]> => {
      const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
      const index = tx.store.index('tableName');
      const rows = (await index.getAll(tableName)) as ReplicatedRow<TestEntity>[];
      return rows.map(r => r.data);
    };

    cacheManager = new ReplicatedTableCacheManager<TestEntity>(
      tableName,
      () => TTL_MS,
      { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
      getDb,
      getAllData
    );
  });

  afterEach(async () => {
    // notifyListeners() schedules a trailing-edge setTimeout that calls
    // getAllData() against the IDB handle ~100ms later. If we close the DB
    // before that fires, the timer hits a closed handle and surfaces as an
    // unhandled InvalidStateError after the test has already passed. Cancel
    // the pending timer and drop subscribers before tearing down the DB.
    const internals = cacheManager as unknown as {
      notifyDebounceTimer: ReturnType<typeof setTimeout> | null;
      hasNotifiedLeadingEdge: boolean;
      listeners: Set<unknown>;
    };
    if (internals.notifyDebounceTimer) {
      clearTimeout(internals.notifyDebounceTimer);
      internals.notifyDebounceTimer = null;
    }
    internals.hasNotifiedLeadingEdge = false;
    internals.listeners.clear();

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

  describe('isExpired', () => {
    it('should return false for non-expired rows', () => {
      const row: ReplicatedRow<TestEntity> = {
        tableName: tableName,
        id: '1',
        data: { id: '1', name: 'Rex' },
        version: 1,
        lastSyncedAt: Date.now(),
        lastAccessedAt: Date.now(),
        isDirty: false,
        syncStatus: 'synced',
      };

      // We need a recent sync for expiration to be checked
      cacheManager.setLastSuccessfulSync(Date.now());

      expect(cacheManager.isExpired(row)).toBe(false);
    });

    it('should return true for expired rows when recently synced', () => {
      cacheManager.setLastSuccessfulSync(Date.now());

      const row: ReplicatedRow<TestEntity> = {
        tableName: tableName,
        id: '1',
        data: { id: '1', name: 'Rex' },
        version: 1,
        lastSyncedAt: Date.now() - TTL_MS - 1000, // past TTL
        lastAccessedAt: Date.now(),
        isDirty: false,
        syncStatus: 'synced',
      };

      expect(cacheManager.isExpired(row)).toBe(true);
    });

    it('should never expire dirty rows', () => {
      cacheManager.setLastSuccessfulSync(Date.now());

      const row: ReplicatedRow<TestEntity> = {
        tableName: tableName,
        id: '1',
        data: { id: '1', name: 'Rex' },
        version: 1,
        lastSyncedAt: Date.now() - TTL_MS - 100000, // way past TTL
        lastAccessedAt: Date.now(),
        isDirty: true,
        syncStatus: 'pending',
      };

      expect(cacheManager.isExpired(row)).toBe(false);
    });

    it('should not expire when never synced successfully (lastSuccessfulSync = 0)', () => {
      // Default lastSuccessfulSyncAt is 0, so timeSinceLastSync > ttl * 2
      const row: ReplicatedRow<TestEntity> = {
        tableName: tableName,
        id: '1',
        data: { id: '1', name: 'Rex' },
        version: 1,
        lastSyncedAt: Date.now() - TTL_MS - 1000, // past TTL
        lastAccessedAt: Date.now(),
        isDirty: false,
        syncStatus: 'synced',
      };

      expect(cacheManager.isExpired(row)).toBe(false);
    });
  });

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
  });

  describe('refreshTimestamps', () => {
    it('should update lastSyncedAt and lastAccessedAt on all rows', async () => {
      const oldTime = Date.now() - 60000;
      await insertRow(
        '1',
        { id: '1', name: 'Rex' },
        { lastSyncedAt: oldTime, lastAccessedAt: oldTime }
      );
      await insertRow(
        '2',
        { id: '2', name: 'Buddy' },
        { lastSyncedAt: oldTime, lastAccessedAt: oldTime }
      );

      await cacheManager.refreshTimestamps();

      const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
      const row1 = (await tx.store.get([tableName, '1'])) as ReplicatedRow<TestEntity>;
      const row2 = (await tx.store.get([tableName, '2'])) as ReplicatedRow<TestEntity>;
      await tx.done;

      expect(row1.lastSyncedAt).toBeGreaterThan(oldTime);
      expect(row1.lastAccessedAt).toBeGreaterThan(oldTime);
      expect(row2.lastSyncedAt).toBeGreaterThan(oldTime);
    });
  });

  describe('cleanExpired', () => {
    it('should remove expired rows', async () => {
      cacheManager.setLastSuccessfulSync(Date.now());

      const expiredTime = Date.now() - TTL_MS - 1000;
      await insertRow('1', { id: '1', name: 'Rex' }, { lastSyncedAt: expiredTime });
      await insertRow('2', { id: '2', name: 'Buddy' }); // fresh

      const deleted = await cacheManager.cleanExpired();

      expect(deleted).toBe(1);

      const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
      const remaining = (await tx.store
        .index('tableName')
        .getAll(tableName)) as ReplicatedRow<TestEntity>[];
      await tx.done;

      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.id).toBe('2');
    });

    it('should not remove dirty rows even if expired', async () => {
      cacheManager.setLastSuccessfulSync(Date.now());

      const expiredTime = Date.now() - TTL_MS - 1000;
      await insertRow(
        '1',
        { id: '1', name: 'Rex' },
        { lastSyncedAt: expiredTime, isDirty: true, syncStatus: 'pending' }
      );

      const deleted = await cacheManager.cleanExpired();

      expect(deleted).toBe(0);
    });

    it('should return 0 when nothing is expired', async () => {
      await insertRow('1', { id: '1', name: 'Rex' });

      const deleted = await cacheManager.cleanExpired();

      expect(deleted).toBe(0);
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
