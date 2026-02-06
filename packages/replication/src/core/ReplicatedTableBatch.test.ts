import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReplicatedTableBatchManager } from './ReplicatedTableBatch';
import { DatabaseManager, REPLICATION_STORES } from './DatabaseManager';
import type { IDBPDatabase } from 'idb';
import type { ReplicatedRow } from '../types';

interface TestEntity {
  id: string;
  name: string;
}

describe('ReplicatedTableBatchManager', () => {
  let dbManager: DatabaseManager;
  let db: IDBPDatabase;
  let batchManager: ReplicatedTableBatchManager<TestEntity>;
  let notifyListeners: ReturnType<typeof vi.fn>;
  let tableName: string;

  beforeEach(async () => {
    // Reset module-level singleton state
    const { databaseManager: singletonMgr } = await import('./DatabaseManager');
    await singletonMgr.reset();

    tableName = 'test_batch_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    dbManager = new DatabaseManager({}, 'test-batch-db-' + Date.now(), 5);
    db = await dbManager.getDatabase(tableName);
    notifyListeners = vi.fn();

    batchManager = new ReplicatedTableBatchManager<TestEntity>(
      tableName,
      { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
      async () => db,
      notifyListeners as () => void
    );
  });

  afterEach(async () => {
    await dbManager.reset();
  });

  async function getAllRows(): Promise<ReplicatedRow<TestEntity>[]> {
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
    const index = tx.store.index('tableName');
    const rows = (await index.getAll(tableName)) as ReplicatedRow<TestEntity>[];
    await tx.done;
    return rows;
  }

  describe('batchSet', () => {
    it('should insert multiple items in a single transaction', async () => {
      const items: TestEntity[] = [
        { id: '1', name: 'Rex' },
        { id: '2', name: 'Buddy' },
        { id: '3', name: 'Max' },
      ];

      await batchManager.batchSet(items);

      const rows = await getAllRows();
      expect(rows).toHaveLength(3);
    });

    it('should normalize IDs to strings', async () => {
      // Simulate numeric IDs from Supabase
      const items = [
        { id: 42 as unknown as string, name: 'Rex' },
        { id: 123 as unknown as string, name: 'Buddy' },
      ];

      await batchManager.batchSet(items as TestEntity[]);

      const rows = await getAllRows();
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => typeof r.id === 'string')).toBe(true);
      expect(rows.map((r) => r.id).sort()).toEqual(['123', '42']);
    });

    it('should set all rows as synced and not dirty', async () => {
      await batchManager.batchSet([{ id: '1', name: 'Rex' }]);

      const rows = await getAllRows();
      expect(rows[0]!.isDirty).toBe(false);
      expect(rows[0]!.syncStatus).toBe('synced');
      expect(rows[0]!.version).toBe(1);
    });

    it('should normalize data ID to match string ID', async () => {
      await batchManager.batchSet([{ id: 42 as unknown as string, name: 'Rex' } as TestEntity]);

      const rows = await getAllRows();
      expect(rows[0]!.data.id).toBe('42');
    });

    it('should notify listeners after batch set', async () => {
      await batchManager.batchSet([{ id: '1', name: 'Rex' }]);

      expect(notifyListeners).toHaveBeenCalled();
    });

    it('should handle empty array', async () => {
      await batchManager.batchSet([]);

      const rows = await getAllRows();
      expect(rows).toHaveLength(0);
      expect(notifyListeners).toHaveBeenCalled();
    });

    it('should overwrite existing rows with same ID', async () => {
      await batchManager.batchSet([{ id: '1', name: 'Rex' }]);
      await batchManager.batchSet([{ id: '1', name: 'Rex Updated' }]);

      const rows = await getAllRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.data.name).toBe('Rex Updated');
    });
  });

  describe('batchSetChunked', () => {
    it('should delegate to batchSet for small arrays', async () => {
      const items: TestEntity[] = [
        { id: '1', name: 'Rex' },
        { id: '2', name: 'Buddy' },
      ];

      await batchManager.batchSetChunked(items, 10);

      const rows = await getAllRows();
      expect(rows).toHaveLength(2);
    });

    it('should process in chunks for large arrays', async () => {
      const items: TestEntity[] = Array.from({ length: 25 }, (_, i) => ({
        id: String(i),
        name: `Dog ${i}`,
      }));

      await batchManager.batchSetChunked(items, 10);

      const rows = await getAllRows();
      expect(rows).toHaveLength(25);
    });

    it('should handle exact chunk size boundary', async () => {
      const items: TestEntity[] = Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        name: `Dog ${i}`,
      }));

      await batchManager.batchSetChunked(items, 10);

      const rows = await getAllRows();
      expect(rows).toHaveLength(10);
    });

    it('should handle remainder chunk', async () => {
      const items: TestEntity[] = Array.from({ length: 13 }, (_, i) => ({
        id: String(i),
        name: `Dog ${i}`,
      }));

      await batchManager.batchSetChunked(items, 5);

      const rows = await getAllRows();
      expect(rows).toHaveLength(13);
    });

    it('should notify listeners after all chunks are processed', async () => {
      const items: TestEntity[] = Array.from({ length: 15 }, (_, i) => ({
        id: String(i),
        name: `Dog ${i}`,
      }));

      await batchManager.batchSetChunked(items, 5);

      expect(notifyListeners).toHaveBeenCalled();
    });
  });

  describe('batchDelete', () => {
    it('should delete multiple rows by ID', async () => {
      await batchManager.batchSet([
        { id: '1', name: 'Rex' },
        { id: '2', name: 'Buddy' },
        { id: '3', name: 'Max' },
      ]);

      await batchManager.batchDelete(['1', '3']);

      const rows = await getAllRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe('2');
    });

    it('should normalize IDs for deletion', async () => {
      await batchManager.batchSet([{ id: '42', name: 'Rex' }]);

      await batchManager.batchDelete([42 as unknown as string]);

      const rows = await getAllRows();
      expect(rows).toHaveLength(0);
    });

    it('should not throw when deleting non-existent IDs', async () => {
      await expect(batchManager.batchDelete(['nonexistent'])).resolves.not.toThrow();
    });

    it('should notify listeners after batch delete', async () => {
      await batchManager.batchSet([{ id: '1', name: 'Rex' }]);
      notifyListeners.mockClear();

      await batchManager.batchDelete(['1']);

      expect(notifyListeners).toHaveBeenCalled();
    });

    it('should handle empty array', async () => {
      await expect(batchManager.batchDelete([])).resolves.not.toThrow();
    });
  });

  describe('clearCache', () => {
    it('should remove all rows for this table', async () => {
      await batchManager.batchSet([
        { id: '1', name: 'Rex' },
        { id: '2', name: 'Buddy' },
        { id: '3', name: 'Max' },
      ]);

      await batchManager.clearCache();

      const rows = await getAllRows();
      expect(rows).toHaveLength(0);
    });

    it('should not affect rows from other tables', async () => {
      // Insert a row for another table directly
      const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
      await tx.store.put({
        tableName: 'other_table',
        id: '1',
        data: { id: '1', name: 'Other' },
        version: 1,
        lastSyncedAt: Date.now(),
        lastAccessedAt: Date.now(),
        isDirty: false,
        syncStatus: 'synced',
      });
      await tx.done;

      // Insert row for our table
      await batchManager.batchSet([{ id: '1', name: 'Rex' }]);

      // Clear our table's cache
      await batchManager.clearCache();

      // Other table's rows should remain
      const tx2 = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
      const allRows = await tx2.store.getAll();
      await tx2.done;

      expect(allRows).toHaveLength(1);
      expect((allRows[0] as ReplicatedRow<TestEntity>).tableName).toBe('other_table');
    });

    it('should notify listeners after clearing', async () => {
      await batchManager.batchSet([{ id: '1', name: 'Rex' }]);
      notifyListeners.mockClear();

      await batchManager.clearCache();

      expect(notifyListeners).toHaveBeenCalled();
    });
  });
});
