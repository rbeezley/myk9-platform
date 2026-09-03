import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedTable } from './ReplicatedTable';
import { databaseManager } from './DatabaseManager';
import type { SyncResult } from '../types';

interface Entry {
  id: string;
  name: string;
  class_id: string;
  license_key: string;
}

class EntryTable extends ReplicatedTable<Entry> {
  protected resolveConflict(local: Entry): Entry {
    return local;
  }

  async sync(): Promise<SyncResult> {
    throw new Error('Retention tests must not request network sync');
  }
}

const savedAt = Date.parse('2026-09-01T12:00:00Z');
const oldEntry: Entry = {
  id: 'old',
  name: 'Cooper',
  class_id: 'class-a',
  license_key: 'show-a',
};

describe('replica retention through public reads and subscriptions', () => {
  beforeEach(async () => {
    await databaseManager.reset();
  });

  afterEach(async () => {
    // Let the real notification debounce finish before closing IndexedDB.
    await new Promise(resolve => setTimeout(resolve, 150));
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await databaseManager.reset();
  });

  it.each([true, false])('serves aged rows through every read when online=%s', async online => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(savedAt);
    const table = new EntryTable('retention-reads');
    await table.set(oldEntry.id, oldEntry, false);

    clock.mockReturnValue(savedAt + 45 * 24 * 60 * 60 * 1000);
    vi.stubGlobal('navigator', { onLine: online });
    // An incremental arrival must not age unchanged rows out of the replica.
    await table.set('new', { ...oldEntry, id: 'new', name: 'Mabel' }, false);

    expect(await table.get(oldEntry.id)).toEqual(oldEntry);
    expect(await table.getReplicatedRow(oldEntry.id)).toMatchObject({
      data: oldEntry,
      lastSyncedAt: savedAt,
      isDirty: false,
    });
    expect(await table.getAll()).toContainEqual(oldEntry);
    expect(await table.getAll('show-a')).toContainEqual(oldEntry);
    expect(await table.getAll('other-show')).toEqual([]);
    expect(await table.getAllWithStatus()).toMatchObject({ ok: true, error: null });
    expect((await table.getAllWithStatus()).rows).toContainEqual(oldEntry);
    expect(await table.queryByField('class_id', 'class-a')).toContainEqual(oldEntry);
    expect(await table.queryIndex('name', 'Cooper')).toEqual([oldEntry]);
    expect(await table.getAllLocalIds()).toEqual(new Set(['old', 'new']));

    const callback = vi.fn();
    const unsubscribe = table.subscribe(callback);
    try {
      await vi.waitFor(() =>
        expect(callback).toHaveBeenCalledWith(expect.arrayContaining([oldEntry]))
      );
    } finally {
      unsubscribe();
    }
  });

  it('preserves aged pending edits while reconciling authoritative server deletions', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(savedAt);
    const table = new EntryTable('retention-reconciliation');
    await table.set('kept', { ...oldEntry, id: 'kept' }, false);
    await table.set('removed', { ...oldEntry, id: 'removed' }, false);
    await table.set('pending', { ...oldEntry, id: 'pending', name: 'Local edit' }, true);
    clock.mockReturnValue(savedAt + 45 * 24 * 60 * 60 * 1000);

    await table.set('pending', { ...oldEntry, id: 'pending', name: 'Stale server' }, false);
    expect(await table.get('pending')).toMatchObject({ name: 'Local edit' });
    expect(await table.removeStaleEntries(new Set(['kept']))).toBe(1);
    expect(await table.getAllLocalIds()).toEqual(new Set(['kept', 'pending']));
    expect(await table.getReplicatedRow('pending')).toMatchObject({
      isDirty: true,
      syncStatus: 'pending',
      lastSyncedAt: savedAt,
    });
    expect(await table.get('removed')).toBeNull();
  });

  it('reports a failed aged snapshot without emitting false emptiness, then recovers', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(savedAt);
    const table = new EntryTable('retention-read-error');
    await table.set(oldEntry.id, oldEntry, false);
    clock.mockReturnValue(savedAt + 45 * 24 * 60 * 60 * 1000);
    // Fail the storage boundary, not the table/read implementation.
    const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    expect(await table.getAllWithStatus()).toMatchObject({ ok: false, rows: [] });

    const callback = vi.fn();
    const onError = vi.fn();
    const unsubscribe = table.subscribe(callback, { onError });
    try {
      await vi.waitFor(() => expect(onError).toHaveBeenCalled());
      expect(callback).not.toHaveBeenCalled();
      transaction.mockRestore();
      await databaseManager.reset();
      expect(await table.getAll()).toEqual([oldEntry]);
      await table.set('new', { ...oldEntry, id: 'new' }, false);
      await vi.waitFor(() =>
        expect(callback).toHaveBeenCalledWith(expect.arrayContaining([oldEntry]))
      );
    } finally {
      unsubscribe();
    }
  });
});
