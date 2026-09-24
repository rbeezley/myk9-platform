import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IDBPDatabase } from 'idb';
import { ReplicatedTableCacheManager } from './ReplicatedTableCache';
import { DatabaseManager } from './DatabaseManager';

/**
 * A scoped watermark rewind must keep that scope's coverage counts.
 *
 * myK9Show's offline-readiness prime rewinds short scopes so the next sync
 * re-fetches evicted rows. It used to write `{ lastIncrementalSyncAt: 0,
 * scopes: {} }`, wiping every scope's `expectedRemoteRows` — the count
 * readiness is judged by — and a sync already in flight never wrote it back,
 * so the "offline ready" badge stayed red for good (MYK9-738). Prime now
 * rewinds per scope; this pins the property it relies on.
 */
describe('ReplicatedTableCacheManager — scoped watermark rewind', () => {
  let db: IDBPDatabase;
  let cacheManager: ReplicatedTableCacheManager<{ id: string }>;

  beforeEach(async () => {
    const { databaseManager: singletonMgr } = await import('./DatabaseManager');
    await singletonMgr.reset();
    const tableName = 'test_rewind_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const dbManager = new DatabaseManager({}, 'test-rewind-db-' + Date.now(), 5);
    db = await dbManager.getDatabase(tableName);
    cacheManager = new ReplicatedTableCacheManager<{ id: string }>(
      tableName,
      { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
      async () => db,
      async () => ({ ok: true as const, rows: [], error: null })
    );
  });

  afterEach(() => {
    db.close();
  });

  it('resets only the watermark of the rewound scope and keeps its counts', async () => {
    await cacheManager.updateSyncMetadata(
      { lastIncrementalSyncAt: 5_000, totalRows: 4, expectedRemoteRows: 4 },
      { scopeValue: 'show-1' }
    );
    await cacheManager.updateSyncMetadata(
      { lastIncrementalSyncAt: 7_000, totalRows: 2, expectedRemoteRows: 2 },
      { scopeValue: 'show-2' }
    );

    await cacheManager.updateSyncMetadata({ lastIncrementalSyncAt: 0 }, { scopeValue: 'show-1' });

    expect(await cacheManager.getSyncMetadata('show-1')).toMatchObject({
      lastIncrementalSyncAt: 0,
      totalRows: 4,
      expectedRemoteRows: 4,
    });
    // A rewind of one scope never touches another.
    expect(await cacheManager.getSyncMetadata('show-2')).toMatchObject({
      lastIncrementalSyncAt: 7_000,
      totalRows: 2,
      expectedRemoteRows: 2,
    });
  });

  it('the old whole-map rewind is what lost the counts (positive control)', async () => {
    await cacheManager.updateSyncMetadata(
      { lastIncrementalSyncAt: 5_000, totalRows: 4, expectedRemoteRows: 4 },
      { scopeValue: 'show-1' }
    );

    await cacheManager.updateSyncMetadata({ lastIncrementalSyncAt: 0, scopes: {} });

    const meta = await cacheManager.getSyncMetadata('show-1');
    expect(meta?.expectedRemoteRows).toBeUndefined();
  });
});
