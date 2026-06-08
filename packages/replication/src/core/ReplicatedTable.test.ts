import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReplicatedTable } from './ReplicatedTable';
import type { SyncResult, SyncOptions } from '../types';

interface TestEntity {
  id: string;
  name: string;
  score?: number;
  class_id?: string;
  status?: string;
}

class TestReplicatedTable extends ReplicatedTable<TestEntity> {
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

describe('ReplicatedTable', () => {
  let table: TestReplicatedTable;
  let tableName: string;

  beforeEach(async () => {
    const { databaseManager } = await import('./DatabaseManager');
    await databaseManager.reset();

    // Use unique table name per test to avoid cross-contamination
    tableName = 'test_entities_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    table = new TestReplicatedTable(tableName);
  });

  afterEach(async () => {
    const { databaseManager } = await import('./DatabaseManager');
    await databaseManager.reset();
  });

  describe('getTableName', () => {
    it('should return the table name', () => {
      expect(table.getTableName()).toBe(tableName);
    });
  });

  describe('set and get', () => {
    it('should store and retrieve a row', async () => {
      const entity: TestEntity = { id: '1', name: 'Rex' };
      await table.set('1', entity);

      const result = await table.get('1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('1');
      expect(result!.name).toBe('Rex');
    });

    it('should return null for non-existent row', async () => {
      const result = await table.get('nonexistent');

      expect(result).toBeNull();
    });

    it('should normalize IDs to strings', async () => {
      const entity: TestEntity = { id: '42', name: 'Buddy' };
      await table.set('42', entity);

      const result = await table.get('42');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('42');
    });

    it('should increment version on update', async () => {
      const entity: TestEntity = { id: '1', name: 'Rex' };
      await table.set('1', entity);
      await table.set('1', { ...entity, name: 'Rex Jr.' });

      const result = await table.get('1');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Rex Jr.');
    });

    it('should mark row as dirty when isDirty is true', async () => {
      const entity: TestEntity = { id: '1', name: 'Rex' };
      await table.set('1', entity, true);

      // Row should be retrievable (dirty rows don't expire)
      const result = await table.get('1');
      expect(result).not.toBeNull();
    });

    it('should throw on version conflict with expectedVersion', async () => {
      const entity: TestEntity = { id: '1', name: 'Rex' };
      await table.set('1', entity); // version = 1

      // Update to version 2
      await table.set('1', { ...entity, name: 'Rex v2' });

      // Try to update with stale version 1
      await expect(table.set('1', { ...entity, name: 'conflict' }, false, 1)).rejects.toThrow(
        'Concurrent modification detected'
      );
    });

    it('should succeed with correct expectedVersion', async () => {
      const entity: TestEntity = { id: '1', name: 'Rex' };
      await table.set('1', entity); // version = 1

      await expect(table.set('1', { ...entity, name: 'Rex v2' }, false, 1)).resolves.not.toThrow();
    });

    it('stores the clean base row when a row first becomes dirty', async () => {
      await table.set('1', { id: '1', name: 'Rex', status: 'ready' });
      const clean = await table.getReplicatedRow('1');

      await table.set('1', { id: '1', name: 'Rex', status: 'checked-in' }, true);

      await expect(table.getReplicatedRow('1')).resolves.toMatchObject({
        isDirty: true,
        syncStatus: 'pending',
        baseVersion: clean?.version,
        baseData: { id: '1', name: 'Rex', status: 'ready' },
      });
    });

    it('preserves the original base when an already dirty row changes again', async () => {
      await table.set('1', { id: '1', name: 'Rex', status: 'ready' });
      await table.set('1', { id: '1', name: 'Rex', status: 'checked-in' }, true);
      await table.set('1', { id: '1', name: 'Rex', status: 'absent' }, true);

      await expect(table.getReplicatedRow('1')).resolves.toMatchObject({
        baseData: { id: '1', name: 'Rex', status: 'ready' },
      });
    });

    it('clears base and conflict metadata when a clean server row is stored', async () => {
      await table.set('1', { id: '1', name: 'Rex', status: 'ready' });
      await table.set('1', { id: '1', name: 'Rex', status: 'checked-in' }, true);
      await table.markConflict('1', {
        tableName: table.getTableName(),
        rowId: '1',
        fields: ['status'],
        localData: { id: '1', name: 'Rex', status: 'checked-in' },
        remoteData: { id: '1', name: 'Rex', status: 'absent' },
        baseData: { id: '1', name: 'Rex', status: 'ready' },
        baseVersion: 1,
        localVersion: 2,
        remoteServerVersion: 0,
        detectedAt: 1,
      });

      await table.replaceFromRemote('1', { id: '1', name: 'Rex', status: 'absent' });

      await expect(table.getReplicatedRow('1')).resolves.toMatchObject({
        isDirty: false,
        syncStatus: 'synced',
        baseData: undefined,
        baseVersion: undefined,
        conflict: undefined,
      });
    });

    it('stores conflict metadata on an existing dirty row and returns true', async () => {
      await table.set('1', { id: '1', name: 'Rex', status: 'ready' });
      await table.set('1', { id: '1', name: 'Rex', status: 'checked-in' }, true);
      const row = await table.getReplicatedRow('1');

      const result = await table.markConflict('1', {
        tableName: table.getTableName(),
        rowId: '1',
        fields: ['status'],
        localData: { id: '1', name: 'Rex', status: 'checked-in' },
        remoteData: { id: '1', name: 'Rex', status: 'absent' },
        baseData: { id: '1', name: 'Rex', status: 'ready' },
        baseVersion: row!.baseVersion!,
        localVersion: row!.version,
        remoteServerVersion: 0,
        detectedAt: 1,
      });

      expect(result).toBe(true);
      await expect(table.getReplicatedRow('1')).resolves.toMatchObject({
        isDirty: true,
        syncStatus: 'conflict',
        conflict: expect.objectContaining({
          fields: ['status'],
          localVersion: row!.version,
        }),
      });
    });

    it('is a no-op when marking conflict for a missing row and returns false', async () => {
      const result = await table.markConflict('does-not-exist', {
        tableName: table.getTableName(),
        rowId: 'does-not-exist',
        fields: ['status'],
        localData: { id: 'does-not-exist', name: 'Rex', status: 'checked-in' },
        remoteData: { id: 'does-not-exist', name: 'Rex', status: 'absent' },
        baseData: { id: 'does-not-exist', name: 'Rex', status: 'ready' },
        baseVersion: 1,
        localVersion: 1,
        remoteServerVersion: 0,
        detectedAt: 1,
      });

      expect(result).toBe(false);
      await expect(table.getReplicatedRow('does-not-exist')).resolves.toBeNull();
    });

    it('keeps a conflicted row conflicted when another dirty edit happens before explicit resolution', async () => {
      await table.set('1', { id: '1', name: 'Rex', status: 'ready' });
      await table.set('1', { id: '1', name: 'Rex', status: 'checked-in' }, true);
      const row = await table.getReplicatedRow('1');
      await table.markConflict('1', {
        tableName: table.getTableName(),
        rowId: '1',
        fields: ['status'],
        localData: { id: '1', name: 'Rex', status: 'checked-in' },
        remoteData: { id: '1', name: 'Rex', status: 'absent' },
        baseData: { id: '1', name: 'Rex', status: 'ready' },
        baseVersion: row!.baseVersion!,
        localVersion: row!.version,
        remoteServerVersion: 0,
        detectedAt: 1,
      });

      await table.set('1', { id: '1', name: 'Rex', status: 'scratched' }, true);

      await expect(table.getReplicatedRow('1')).resolves.toMatchObject({
        isDirty: true,
        syncStatus: 'conflict',
        conflict: expect.objectContaining({ fields: ['status'] }),
      });
    });

    it('does not mark conflict from a stale local version after a newer dirty edit lands and returns false', async () => {
      await table.set('1', { id: '1', name: 'Rex', status: 'ready' });
      await table.set('1', { id: '1', name: 'Rex', status: 'checked-in' }, true);
      const stale = await table.getReplicatedRow('1');
      await table.set('1', { id: '1', name: 'Rex', status: 'scratched' }, true);

      const result = await table.markConflict('1', {
        tableName: table.getTableName(),
        rowId: '1',
        fields: ['status'],
        localData: { id: '1', name: 'Rex', status: 'checked-in' },
        remoteData: { id: '1', name: 'Rex', status: 'absent' },
        baseData: { id: '1', name: 'Rex', status: 'ready' },
        baseVersion: stale!.baseVersion!,
        localVersion: stale!.version,
        remoteServerVersion: 0,
        detectedAt: 1,
      });

      expect(result).toBe(false);
      await expect(table.getReplicatedRow('1')).resolves.toMatchObject({
        isDirty: true,
        syncStatus: 'pending',
        data: { status: 'scratched' },
        conflict: undefined,
      });
    });

    it('clearConflict resets syncStatus to pending and removes the conflict snapshot', async () => {
      await table.set('1', { id: '1', name: 'Rex', status: 'ready' });
      await table.set('1', { id: '1', name: 'Rex', status: 'checked-in' }, true);
      const row = await table.getReplicatedRow('1');
      await table.markConflict('1', {
        tableName: table.getTableName(),
        rowId: '1',
        fields: ['status'],
        localData: { id: '1', name: 'Rex', status: 'checked-in' },
        remoteData: { id: '1', name: 'Rex', status: 'absent' },
        baseData: { id: '1', name: 'Rex', status: 'ready' },
        baseVersion: row!.baseVersion!,
        localVersion: row!.version,
        remoteServerVersion: 0,
        detectedAt: 1,
      });

      await table.clearConflict('1');

      await expect(table.getReplicatedRow('1')).resolves.toMatchObject({
        isDirty: true,
        syncStatus: 'pending',
        conflict: undefined,
        data: { status: 'checked-in' },
      });
    });

    it('clearConflict is a no-op on a non-conflicted row', async () => {
      await table.set('1', { id: '1', name: 'Rex', status: 'checked-in' }, true);

      await expect(table.clearConflict('1')).resolves.not.toThrow();
      await expect(table.getReplicatedRow('1')).resolves.toMatchObject({
        syncStatus: 'pending',
      });
    });
  });

  // markAsSynced bypasses the dirty-row guard at set():253. Use this after a
  // side-channel server confirmation (e.g., direct submitScore() that doesn't
  // route through MutationManager) so the cache row stops triggering the
  // wasteful mergeDirtyRow branch on every subsequent pull. See
  // project_scoring_sync_bug.md.
  describe('markAsSynced', () => {
    it('clears isDirty on a previously-dirty row', async () => {
      const entity: TestEntity = { id: '1', name: 'Rex' };
      await table.set('1', entity, true);

      let row = await table.getReplicatedRow('1');
      expect(row?.isDirty).toBe(true);
      expect(row?.syncStatus).toBe('pending');

      await table.markAsSynced('1');

      row = await table.getReplicatedRow('1');
      expect(row?.isDirty).toBe(false);
      expect(row?.syncStatus).toBe('synced');
    });

    it('preserves the row data and version when clearing the dirty bit', async () => {
      const entity: TestEntity = { id: '1', name: 'Rex' };
      await table.set('1', entity, true);
      const before = await table.getReplicatedRow('1');

      await table.markAsSynced('1');

      const after = await table.getReplicatedRow('1');
      expect(after?.data).toEqual(before?.data);
      expect(after?.version).toBe(before?.version);
    });

    it('is a no-op for a non-existent row', async () => {
      await expect(table.markAsSynced('does-not-exist')).resolves.not.toThrow();
      const row = await table.getReplicatedRow('does-not-exist');
      expect(row).toBeNull();
    });

    it('is a no-op for a row that is already clean (idempotent)', async () => {
      const entity: TestEntity = { id: '1', name: 'Rex' };
      await table.set('1', entity, false); // clean from the start
      const before = await table.getReplicatedRow('1');

      await table.markAsSynced('1');

      const after = await table.getReplicatedRow('1');
      expect(after?.data).toEqual(before?.data);
      expect(after?.version).toBe(before?.version);
      expect(after?.isDirty).toBe(false);
    });

    it('allows a subsequent server push (set with isDirty=false) to overwrite the row', async () => {
      // Regression: the original bug was that set(id, data, false) was BLOCKED
      // by the dirty-row guard. After markAsSynced, the row should be clean
      // and the natural set(..., false) path should work normally.
      const entity: TestEntity = { id: '1', name: 'Rex' };
      await table.set('1', entity, true);
      await table.markAsSynced('1');

      await expect(table.set('1', { id: '1', name: 'Rex from server' }, false)).resolves.not.toThrow();
      const result = await table.get('1');
      expect(result?.name).toBe('Rex from server');
    });

    it('clears base metadata when marking a dirty row as synced so the next dirty edit captures a fresh base', async () => {
      await table.set('1', { id: '1', name: 'Rex', status: 'ready' });
      await table.set('1', { id: '1', name: 'Rex', status: 'checked-in' }, true);

      await table.markAsSynced('1');

      await expect(table.getReplicatedRow('1')).resolves.toMatchObject({
        isDirty: false,
        syncStatus: 'synced',
        baseData: undefined,
        baseVersion: undefined,
        conflict: undefined,
      });

      await table.set('1', { id: '1', name: 'Rex', status: 'absent' }, true);

      await expect(table.getReplicatedRow('1')).resolves.toMatchObject({
        baseData: { id: '1', name: 'Rex', status: 'checked-in' },
      });
    });

    // Race-condition regression for PR #351 review finding #1. The original
    // split-transaction implementation did get() in one tx, then put() in a
    // second tx — leaving a window in which a concurrent set(..., true) could
    // mark the row dirty AND have that dirty bit silently clobbered when the
    // put landed. The fix collapses both into a single readwrite transaction.
    // This test pins the race closed.
    it('does NOT clobber a concurrent dirty mutation that lands between read and write', async () => {
      const entity: TestEntity = { id: '1', name: 'Rex' };
      await table.set('1', entity, true);

      // Fire markAsSynced without awaiting, then immediately fire a follow-up
      // dirty set. With a single-transaction implementation, the set must
      // either land BEFORE markAsSynced's get (in which case its data wins
      // and the put doesn't clobber it) or AFTER markAsSynced's put (in
      // which case it correctly re-dirties the row). Either way, the final
      // state must reflect the NEWER data and a DIRTY status — never the
      // older data with isDirty=false.
      const pending = table.markAsSynced('1');
      await table.set('1', { id: '1', name: 'Updated' }, true);
      await pending;

      const final = await table.getReplicatedRow('1');
      expect(final?.data.name).toBe('Updated');
      expect(final?.isDirty).toBe(true);
    });
  });

  describe('getConflictedRows', () => {
    const makeSnapshot = (version: number) => ({
      tableName: '',
      rowId: '1',
      fields: ['status'],
      localData: { id: '1', name: 'Rex', status: 'checked-in' },
      remoteData: { id: '1', name: 'Rex', status: 'absent' },
      baseData: { id: '1', name: 'Rex', status: 'ready' },
      baseVersion: 1,
      localVersion: version,
      remoteServerVersion: 5,
      detectedAt: 1,
    });

    it('returns empty array when no rows exist', async () => {
      expect(await table.getConflictedRows()).toEqual([]);
    });

    it('returns empty array when rows exist but none are conflicted', async () => {
      await table.set('1', { id: '1', name: 'Rex', status: 'ready' });
      await table.set('1', { id: '1', name: 'Rex', status: 'checked-in' }, true);
      expect(await table.getConflictedRows()).toEqual([]);
    });

    it('returns the conflict snapshot for a row in syncStatus:conflict', async () => {
      await table.set('1', { id: '1', name: 'Rex', status: 'ready' });
      await table.set('1', { id: '1', name: 'Rex', status: 'checked-in' }, true);
      const row = await table.getReplicatedRow('1');
      const snapshot = { ...makeSnapshot(row!.version), tableName: table.getTableName() };

      await table.markConflict('1', snapshot);

      const conflicts = await table.getConflictedRows();
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]).toMatchObject({
        rowId: '1',
        fields: ['status'],
        remoteServerVersion: 5,
      });
    });

    it('returns snapshots for all conflicted rows and excludes non-conflicted ones', async () => {
      // Row 1: conflicted
      await table.set('1', { id: '1', name: 'Rex', status: 'ready' });
      await table.set('1', { id: '1', name: 'Rex', status: 'checked-in' }, true);
      const row1 = await table.getReplicatedRow('1');
      await table.markConflict('1', { ...makeSnapshot(row1!.version), tableName: table.getTableName(), rowId: '1' });

      // Row 2: just pending (not conflicted)
      await table.set('2', { id: '2', name: 'Buddy', status: 'ready' });
      await table.set('2', { id: '2', name: 'Buddy', status: 'checked-in' }, true);

      // Row 3: conflicted
      await table.set('3', { id: '3', name: 'Max', status: 'ready' });
      await table.set('3', { id: '3', name: 'Max', status: 'checked-in' }, true);
      const row3 = await table.getReplicatedRow('3');
      await table.markConflict('3', { ...makeSnapshot(row3!.version), tableName: table.getTableName(), rowId: '3' });

      const conflicts = await table.getConflictedRows();
      expect(conflicts).toHaveLength(2);
      const ids = conflicts.map(c => c.rowId).sort();
      expect(ids).toEqual(['1', '3']);
    });

    it('returns empty after clearConflict resolves the row', async () => {
      await table.set('1', { id: '1', name: 'Rex', status: 'ready' });
      await table.set('1', { id: '1', name: 'Rex', status: 'checked-in' }, true);
      const row = await table.getReplicatedRow('1');
      await table.markConflict('1', { ...makeSnapshot(row!.version), tableName: table.getTableName() });

      await table.clearConflict('1');

      expect(await table.getConflictedRows()).toEqual([]);
    });
  });

  describe('getAll', () => {
    it('should return empty array when no data', async () => {
      const results = await table.getAll();

      expect(results).toEqual([]);
    });

    it('should return all rows for the table', async () => {
      await table.set('1', { id: '1', name: 'Rex' });
      await table.set('2', { id: '2', name: 'Buddy' });
      await table.set('3', { id: '3', name: 'Max' });

      const results = await table.getAll();

      expect(results).toHaveLength(3);
      const names = results.map(r => r.name).sort();
      expect(names).toEqual(['Buddy', 'Max', 'Rex']);
    });

    it('should not return rows from other tables', async () => {
      await table.set('1', { id: '1', name: 'Rex' });

      const otherTableName = 'other_entities_' + Date.now();
      const otherTable = new TestReplicatedTable(otherTableName);
      await otherTable.set('2', { id: '2', name: 'Buddy' });

      const results = await table.getAll();
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Rex');
    });
  });

  describe('delete', () => {
    it('should remove a row from cache', async () => {
      await table.set('1', { id: '1', name: 'Rex' });

      await table.delete('1');

      const result = await table.get('1');
      expect(result).toBeNull();
    });

    it('should not throw when deleting non-existent row', async () => {
      await expect(table.delete('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('subscribe', () => {
    it('should call callback immediately with current data', async () => {
      await table.set('1', { id: '1', name: 'Rex' });

      const callback = vi.fn();
      table.subscribe(callback);

      // Wait for async callback
      await new Promise(r => setTimeout(r, 50));

      expect(callback).toHaveBeenCalled();
      const data = callback.mock.calls[0]![0] as TestEntity[];
      expect(data).toHaveLength(1);
    });

    it('should return an unsubscribe function that stops future notifications', async () => {
      const callback = vi.fn();
      const unsubscribe = table.subscribe(callback);

      // Wait for the initial async callback from subscribe
      await new Promise(r => setTimeout(r, 50));

      expect(typeof unsubscribe).toBe('function');
      unsubscribe();

      // Clear any calls from the initial subscribe
      callback.mockClear();

      await table.set('2', { id: '2', name: 'Buddy' });

      // Wait for debounced notification
      await new Promise(r => setTimeout(r, 200));

      // The callback should not have been called after unsubscribe
      expect(callback).not.toHaveBeenCalled();
    });

    it('should notify on set operations', async () => {
      const callback = vi.fn();
      table.subscribe(callback);

      // Wait for initial notification
      await new Promise(r => setTimeout(r, 50));
      callback.mockClear();

      await table.set('1', { id: '1', name: 'Rex' });

      // Wait for debounced notification
      await new Promise(r => setTimeout(r, 200));

      expect(callback).toHaveBeenCalled();
    });

    it('should notify on delete operations', async () => {
      await table.set('1', { id: '1', name: 'Rex' });

      const callback = vi.fn();
      table.subscribe(callback);

      // Wait for initial notification
      await new Promise(r => setTimeout(r, 50));
      callback.mockClear();

      await table.delete('1');

      // Wait for debounced notification
      await new Promise(r => setTimeout(r, 200));

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('optimisticUpdate', () => {
    it('should apply update function to current data', async () => {
      await table.set('1', { id: '1', name: 'Rex', score: 90 });

      const result = await table.optimisticUpdate('1', current => ({
        ...current,
        score: 95,
      }));

      expect(result.score).toBe(95);
      expect(result.name).toBe('Rex');
    });

    it('should throw when row does not exist', async () => {
      await expect(table.optimisticUpdate('nonexistent', current => current)).rejects.toThrow(
        'not found for optimistic update'
      );
    });

    it('should persist the updated data', async () => {
      await table.set('1', { id: '1', name: 'Rex', score: 90 });

      await table.optimisticUpdate('1', current => ({
        ...current,
        name: 'Rex Updated',
      }));

      const fetched = await table.get('1');
      expect(fetched).not.toBeNull();
      expect(fetched!.name).toBe('Rex Updated');
    });

    it('should mark updated row as dirty', async () => {
      await table.set('1', { id: '1', name: 'Rex' });

      await table.optimisticUpdate('1', current => ({
        ...current,
        name: 'Rex Updated',
      }));

      // The row should still be retrievable (dirty rows never expire)
      const result = await table.get('1');
      expect(result).not.toBeNull();
    });

    it('should support async update functions', async () => {
      await table.set('1', { id: '1', name: 'Rex', score: 90 });

      const result = await table.optimisticUpdate('1', async current => {
        await new Promise(r => setTimeout(r, 10));
        return { ...current, score: 100 };
      });

      expect(result.score).toBe(100);
    });
  });

  describe('batchSet', () => {
    it('should insert multiple rows at once', async () => {
      const items: TestEntity[] = [
        { id: '1', name: 'Rex' },
        { id: '2', name: 'Buddy' },
        { id: '3', name: 'Max' },
      ];

      await table.batchSet(items);

      const all = await table.getAll();
      expect(all).toHaveLength(3);
    });
  });

  describe('batchDelete', () => {
    it('should delete multiple rows at once', async () => {
      await table.batchSet([
        { id: '1', name: 'Rex' },
        { id: '2', name: 'Buddy' },
        { id: '3', name: 'Max' },
      ]);

      await table.batchDelete(['1', '3']);

      const all = await table.getAll();
      expect(all).toHaveLength(1);
      expect(all[0]!.name).toBe('Buddy');
    });
  });

  describe('clearCache', () => {
    it('should remove all rows for this table', async () => {
      await table.batchSet([
        { id: '1', name: 'Rex' },
        { id: '2', name: 'Buddy' },
      ]);

      await table.clearCache();

      const all = await table.getAll();
      expect(all).toHaveLength(0);
    });
  });

  describe('getAllLocalIds', () => {
    it('should return a Set of all local IDs', async () => {
      await table.batchSet([
        { id: '1', name: 'Rex' },
        { id: '2', name: 'Buddy' },
      ]);

      const ids = await table.getAllLocalIds();

      expect(ids).toBeInstanceOf(Set);
      expect(ids.size).toBe(2);
      expect(ids.has('1')).toBe(true);
      expect(ids.has('2')).toBe(true);
    });

    it('should return empty Set when no data', async () => {
      const ids = await table.getAllLocalIds();

      expect(ids.size).toBe(0);
    });
  });

  describe('removeStaleEntries', () => {
    it('should remove entries not in server set', async () => {
      await table.batchSet([
        { id: '1', name: 'Rex' },
        { id: '2', name: 'Buddy' },
        { id: '3', name: 'Max' },
      ]);

      const serverIds = new Set(['1', '3']);
      const removed = await table.removeStaleEntries(serverIds);

      expect(removed).toBe(1);
      const all = await table.getAll();
      expect(all).toHaveLength(2);
      expect(all.map(r => r.id).sort()).toEqual(['1', '3']);
    });

    it('should preserve dirty rows even if not in server set', async () => {
      await table.set('1', { id: '1', name: 'Rex' }, true); // dirty
      await table.set('2', { id: '2', name: 'Buddy' });

      const serverIds = new Set<string>(); // empty - all stale
      const removed = await table.removeStaleEntries(serverIds);

      // Only non-dirty row should be removed
      expect(removed).toBe(1);
      const all = await table.getAll();
      expect(all).toHaveLength(1);
      expect(all[0]!.id).toBe('1');
    });

    it('should return 0 when all entries are in server set', async () => {
      await table.batchSet([
        { id: '1', name: 'Rex' },
        { id: '2', name: 'Buddy' },
      ]);

      const serverIds = new Set(['1', '2']);
      const removed = await table.removeStaleEntries(serverIds);

      expect(removed).toBe(0);
    });
  });

  describe('sync', () => {
    it('should return a successful SyncResult', async () => {
      const result = await table.sync('license-123');

      expect(result.success).toBe(true);
      expect(result.tableName).toBe(tableName);
      expect(result.operation).toBe('full-sync');
    });
  });

  describe('getCacheStats', () => {
    it('should return stats for cached data', async () => {
      await table.batchSet([
        { id: '1', name: 'Rex' },
        { id: '2', name: 'Buddy' },
      ]);

      const stats = await table.getCacheStats();

      expect(stats.rowCount).toBe(2);
      expect(stats.sizeBytes).toBeGreaterThan(0);
      expect(stats.sizeMB).toBeGreaterThan(0);
      expect(stats.dirtyCount).toBe(0);
    });

    it('should count dirty rows', async () => {
      await table.set('1', { id: '1', name: 'Rex' }, true);
      await table.set('2', { id: '2', name: 'Buddy' }, false);

      const stats = await table.getCacheStats();

      expect(stats.dirtyCount).toBe(1);
    });
  });

  describe('getSyncMetadata / updateSyncMetadata', () => {
    it('should return falsy when no metadata exists', async () => {
      const metadata = await table.getSyncMetadata();

      expect(metadata).toBeFalsy();
    });

    it('should persist and retrieve sync metadata', async () => {
      await table.updateSyncMetadata({
        lastFullSyncAt: 1000,
        syncStatus: 'syncing',
        totalRows: 50,
      });

      const metadata = await table.getSyncMetadata();

      expect(metadata).not.toBeNull();
      expect(metadata!.lastFullSyncAt).toBe(1000);
      expect(metadata!.syncStatus).toBe('syncing');
      expect(metadata!.totalRows).toBe(50);
    });

    it('should merge updates with existing metadata', async () => {
      await table.updateSyncMetadata({
        lastFullSyncAt: 1000,
        syncStatus: 'idle',
      });

      await table.updateSyncMetadata({
        syncStatus: 'syncing',
      });

      const metadata = await table.getSyncMetadata();

      expect(metadata!.lastFullSyncAt).toBe(1000); // preserved
      expect(metadata!.syncStatus).toBe('syncing'); // updated
    });
  });

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
      // Verify the constant is imported and used (no hardcoded 20000).
      // Value raised 5s → 15s in a40154d7 to fix real IndexedDB timeouts;
      // pin to whatever the production constant is so this test catches
      // unintended drops back to a too-aggressive timeout.
      const { GET_ALL_TIMEOUT_MS } = await import('../constants');
      expect(GET_ALL_TIMEOUT_MS).toBe(15000);
    });
  });
});
