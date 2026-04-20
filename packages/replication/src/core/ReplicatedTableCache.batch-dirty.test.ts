/**
 * Regression tests for Phase 2 findings B1 and B2.
 *
 * B1: batchSet must not overwrite a locally-dirty row with a clean server value.
 * B2: batchSetChunked must be atomic — a mid-chunk failure must not leave IDB
 *     in a partially-written state.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReplicatedTableBatchManager } from './ReplicatedTableBatch';
import { DatabaseManager, REPLICATION_STORES } from './DatabaseManager';
import type { IDBPDatabase } from 'idb';
import type { ReplicatedRow } from '../types';

interface TestEntity {
  id: string;
  name: string;
}

describe('ReplicatedTableCache batch-write dirty protection', () => {
  let dbManager: DatabaseManager;
  let db: IDBPDatabase;
  let batchManager: ReplicatedTableBatchManager<TestEntity>;
  let tableName: string;

  async function getAllRows(): Promise<ReplicatedRow<TestEntity>[]> {
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
    const index = tx.store.index('tableName');
    const rows = (await index.getAll(tableName)) as ReplicatedRow<TestEntity>[];
    await tx.done;
    return rows;
  }

  async function insertDirtyRow(id: string, data: TestEntity): Promise<void> {
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const row: ReplicatedRow<TestEntity> = {
      tableName,
      id,
      data,
      version: 2,
      lastSyncedAt: Date.now() - 5000,
      lastAccessedAt: Date.now(),
      isDirty: true,
      syncStatus: 'pending',
    };
    await tx.store.put(row);
    await tx.done;
  }

  beforeEach(async () => {
    const { databaseManager: singletonMgr } = await import('./DatabaseManager');
    await singletonMgr.reset();

    tableName = 'batch_dirty_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    dbManager = new DatabaseManager({}, 'test-batch-dirty-db-' + Date.now(), 5);
    db = await dbManager.getDatabase(tableName);

    batchManager = new ReplicatedTableBatchManager<TestEntity>(
      tableName,
      { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
      async () => db,
      vi.fn() as () => void
    );
  });

  afterEach(async () => {
    await dbManager.reset();
  });

  // ── B1: dirty-row guard ──────────────────────────────────────────────────

  it('batchSet does not overwrite a locally-dirty row with a clean server value', async () => {
    // Arrange: row id='1' is dirty with a locally-mutated name
    await insertDirtyRow('1', { id: '1', name: 'LocalMutation' });

    // Act: server sync arrives with a clean copy of the same row
    await batchManager.batchSet([{ id: '1', name: 'ServerValue' }]);

    // Assert: IDB still holds the dirty local mutation
    const rows = await getAllRows();
    const row = rows.find(r => r.id === '1');
    expect(row).toBeDefined();
    expect(row!.isDirty).toBe(true);
    expect(row!.data.name).toBe('LocalMutation');
  });

  // ── B2: batchSetChunked atomicity ────────────────────────────────────────

  it('batchSetChunked rolls back all chunks when any chunk fails', async () => {
    // Arrange: 15 rows across 3 chunks of 5. Pre-populate IDB with the first
    // 5 as "pre-existing synced" rows so we can verify rollback.
    const preExistingItems: TestEntity[] = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      name: `PreExisting ${i}`,
    }));
    await batchManager.batchSet(preExistingItems);

    const preBatch = await getAllRows();
    expect(preBatch).toHaveLength(5);
    const preNames = preBatch.map(r => r.data.name).sort();

    // 15-item batch that will be chunked 5+5+5.
    const newItems: TestEntity[] = Array.from({ length: 15 }, (_, i) => ({
      id: String(i), // ids 0-14; ids 0-4 overlap with pre-existing rows
      name: `NewValue ${i}`,
    }));

    // Stub: capture the real getDb, then make the 2nd chunk's transaction fail.
    // We count batchSet calls: batchSetChunked(15, 5) → 3 internal batchSet invocations.
    // We can't easily intercept individual IDB txs, so instead we wrap the internal
    // batchSet by monkey-patching db.transaction on the 2nd open.
    let transactionCallCount = 0;
    const realTransaction = db.transaction.bind(db);
    const dbProxy = new Proxy(db, {
      get(target, prop) {
        if (prop === 'transaction') {
          return (storeNames: string | string[], mode?: IDBTransactionMode) => {
            transactionCallCount++;
            // Throw on the 2nd readwrite transaction opened during chunked set
            if (transactionCallCount === 2 && mode === 'readwrite') {
              throw new Error('Simulated IDB QuotaExceededError on chunk 2');
            }
            return realTransaction(storeNames as Parameters<typeof realTransaction>[0], mode);
          };
        }
        const val = (target as Record<string | symbol, unknown>)[prop as string | symbol];
        return typeof val === 'function' ? val.bind(target) : val;
      },
    });

    const failingBatchManager = new ReplicatedTableBatchManager<TestEntity>(
      tableName,
      { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
      async () => dbProxy as unknown as IDBPDatabase,
      vi.fn() as () => void
    );

    // Act: batchSetChunked should throw because chunk 2 fails
    await expect(failingBatchManager.batchSetChunked(newItems, 5)).rejects.toThrow();

    // Assert: IDB must be in a consistent state — either fully rolled back to
    // pre-existing state OR fully written (the implementation defines which).
    // Atomicity contract: rows 0-4 must still carry the PRE-EXISTING names
    // (because the operation failed and should have rolled back).
    const afterRows = await getAllRows();
    const afterNames = afterRows
      .filter(r => Number(r.id) < 5)
      .map(r => r.data.name)
      .sort();
    expect(afterNames).toEqual(preNames);
  });
});
