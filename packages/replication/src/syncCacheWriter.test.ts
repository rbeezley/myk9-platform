import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ReplicatedTable } from './core/ReplicatedTable';
import { SyncCacheWriter } from './syncCacheWriter';
import type { SyncOptions, SyncResult } from './types';

interface Row {
  id: string;
  name: string;
}

class TestTable extends ReplicatedTable<Row> {
  async sync(_scope: string, _options?: Partial<SyncOptions>): Promise<SyncResult> {
    throw new Error('not used');
  }
  protected resolveConflict(_local: Row, remote: Row): Row {
    return remote;
  }
}

// MYK9-1624: the sync-path delete door refuses once its signal aborts.
describe('SyncCacheWriter', () => {
  let table: TestTable;

  beforeEach(async () => {
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
    table = new TestTable(`rows_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    await table.set('a', { id: 'a', name: 'A' });
    await table.set('b', { id: 'b', name: 'B' });
    await table.set('c', { id: 'c', name: 'C' });
  });

  afterEach(async () => {
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
  });

  const aborted = () => {
    const controller = new AbortController();
    controller.abort();
    return new SyncCacheWriter(table, controller.signal);
  };

  it('an aborted signal refuses every delete method', async () => {
    const writer = aborted();

    expect(await writer.removeStale(new Set(['a']))).toBe(0);
    expect(await writer.deleteIfClean(['a', 'b'])).toEqual({ deleted: [], kept: ['a', 'b'] });
    await writer.batchDelete(['a']);
    await writer.delete('b');
    await writer.clear();
    expect(await writer.guarded('refused', async () => 'ran')).toBe('refused');

    expect((await table.getAll()).map(row => row.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('a live signal deletes through every method', async () => {
    const live = new SyncCacheWriter(table, new AbortController().signal);

    expect(await live.removeStale(new Set(['a', 'b']))).toBe(1);
    expect(await table.get('c')).toBeNull();
    expect(await live.deleteIfClean(['b'])).toEqual({ deleted: ['b'], kept: [] });
    await live.batchDelete(['a']);
    expect(await table.getAll()).toEqual([]);
    await table.set('d', { id: 'd', name: 'D' });
    await live.delete('d');
    expect(await table.get('d')).toBeNull();
    await table.set('e', { id: 'e', name: 'E' });
    await live.clear();
    expect(await table.getAll()).toEqual([]);
    expect(await live.guarded('refused', async () => 'ran')).toBe('ran');
  });

  it('a writer with no signal is live', async () => {
    expect(await new SyncCacheWriter(table).removeStale(new Set())).toBe(3);
  });

  it('the abort is read at the moment of the delete, not when the writer was made', async () => {
    const controller = new AbortController();
    const writer = new SyncCacheWriter(table, controller.signal);
    controller.abort();
    expect(await writer.removeStale(new Set())).toBe(0);
  });
});
