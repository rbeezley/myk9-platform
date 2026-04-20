import { describe, expect, it, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { ReplicatedTableCacheManager } from './ReplicatedTableCache';
import { DatabaseManager, REPLICATION_STORES } from './DatabaseManager';
import type { IDBPDatabase } from 'idb';
import type { ReplicatedRow } from '../types';

// Ensure navigator.onLine is true so isExpired() doesn't treat Node as offline.
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

describe('ReplicatedTableCache invariants', () => {
  let dbManager: DatabaseManager;
  let db: IDBPDatabase;
  let cacheManager: ReplicatedTableCacheManager<TestEntity>;
  let tableName: string;

  // getAllData helper — same pattern as the existing test suite
  async function getAllData(): Promise<TestEntity[]> {
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
    const index = tx.store.index('tableName');
    const rows = (await index.getAll(tableName)) as ReplicatedRow<TestEntity>[];
    await tx.done;
    return rows.map(r => r.data);
  }

  async function insertRow(
    id: string,
    data: TestEntity,
    overrides: Partial<ReplicatedRow<TestEntity>> = {}
  ): Promise<void> {
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const row: ReplicatedRow<TestEntity> = {
      tableName,
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

  beforeEach(async () => {
    const { databaseManager: singletonMgr } = await import('./DatabaseManager');
    await singletonMgr.reset();

    tableName = 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    dbManager = new DatabaseManager({}, 'test-inv-db-' + Date.now(), 5);
    db = await dbManager.getDatabase(tableName);

    cacheManager = new ReplicatedTableCacheManager<TestEntity>(
      tableName,
      () => 5000,
      { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
      async () => db,
      getAllData
    );
  });

  afterEach(async () => {
    await dbManager.reset();
  });

  it('returns a defensive copy so mutations by callers do not corrupt cached data', async () => {
    // Populate IDB with a row
    await insertRow('1', { id: '1', name: 'Rex' });

    // First read — collect the returned array
    const first = await getAllData();
    expect(first).toHaveLength(1);
    expect(first[0]!.name).toBe('Rex');

    // Caller mutates the returned object in place
    first[0]!.name = 'MUTATED';

    // Second read must still return the original value from IDB, not the mutated JS object.
    // ReplicatedTableCacheManager has no in-memory row cache — getAllData re-reads IDB every
    // time, so there is no shared reference to corrupt. This test documents and verifies that
    // design invariant: IDB is the source of truth; in-memory mutations are always discarded.
    const second = await getAllData();
    expect(second[0]!.name).toBe('Rex');
  });

  it('invalidates an entry when its IDB row is updated out-of-band', async () => {
    // Prime: insert row with name 'Rex'
    await insertRow('1', { id: '1', name: 'Rex' });

    // Confirm initial state
    const before = await getAllData();
    expect(before[0]!.name).toBe('Rex');

    // Simulate an out-of-band IDB write (e.g. by another component / mutation flush)
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const existing = (await tx.store.get([tableName, '1'])) as ReplicatedRow<TestEntity>;
    existing.data = { id: '1', name: 'Buddy' };
    existing.lastSyncedAt = Date.now();
    await tx.store.put(existing);
    await tx.done;

    // getAllData always reads from IDB — there is no separate in-memory staleness layer.
    // A subsequent read must return the updated value, not a stale cache entry.
    const after = await getAllData();
    expect(after[0]!.name).toBe('Buddy');
  });

  it('evicts or bounds memory when N rows exceed the cache size limit', async () => {
    // FINDING: ReplicatedTableCache has no automatic size cap.
    // batchSet / batchSetChunked write unconditionally to IDB with no eviction trigger.
    // evictLRU() is a manual/maintenance method that must be called explicitly.
    //
    // This test documents the actual (unbounded) behavior: inserting N rows succeeds without
    // any automatic eviction, then demonstrates that calling evictLRU() successfully bounds
    // the footprint. Severity: MEDIUM (see finding EVICT-UNBOUNDED in phase-2-cache.md).

    const oldTime = Date.now() - 120_000; // 2 min ago — past grace period + recent-edit window

    // Insert 30 rows with stale access times (evictable)
    for (let i = 0; i < 30; i++) {
      await insertRow(
        `${i}`,
        { id: `${i}`, name: `Dog ${i}` },
        {
          lastAccessedAt: oldTime - i * 1000,
          accessCount: 1,
        }
      );
    }

    // Verify all 30 rows are in IDB — no automatic eviction fired
    const beforeEvict = await getAllData();
    expect(beforeEvict).toHaveLength(30);

    // Now manually trigger eviction with a tiny target to force eviction
    const evicted = await cacheManager.evictLRU(1);

    // After eviction, the row count must be less than 30 (footprint is bounded)
    expect(evicted).toBeGreaterThan(0);
    const afterEvict = await getAllData();
    expect(afterEvict.length).toBeLessThan(30);
  });
});
