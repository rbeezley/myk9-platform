/**
 * MYK9-788: a show-scoped read went through getAllWithStatus(), which reads
 * every show's rows on the device and filters afterwards. On a tablet holding
 * many shows that read can hit GET_ALL_TIMEOUT_MS, and the desk late entry
 * then refuses on every retry. getByShowWithStatus() reads one show's rows
 * through the show index.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { ReplicatedTable } from './ReplicatedTable';
import { SHOW_ID_INDEX } from './DatabaseManager';
import type { SyncResult } from '../types';

interface ShowRow {
  id: string;
  showId?: string;
  name: string;
}

class ShowScopedTable extends ReplicatedTable<ShowRow> {
  async sync(): Promise<SyncResult> {
    return {
      tableName: this.tableName,
      success: true,
      operation: 'full-sync',
      rowsAffected: 0,
      duration: 0,
    };
  }

  protected resolveConflict(_local: ShowRow, remote: ShowRow): ShowRow {
    return remote;
  }
}

const SHOWS = 20;
const ROWS_PER_SHOW = 50;

function largeReplica(): ShowRow[] {
  const rows: ShowRow[] = [];
  for (let show = 0; show < SHOWS; show++) {
    for (let n = 0; n < ROWS_PER_SHOW; n++) {
      rows.push({ id: `show-${show}-row-${n}`, showId: `show-${show}`, name: `Dog ${n}` });
    }
  }
  return rows;
}

describe('ReplicatedTable.getByShowWithStatus (MYK9-788)', () => {
  let table: ShowScopedTable;
  let otherTable: ShowScopedTable;

  beforeEach(async () => {
    const { databaseManager } = await import('./DatabaseManager');
    await databaseManager.reset();
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    table = new ShowScopedTable(`entries_${suffix}`);
    otherTable = new ShowScopedTable(`trials_${suffix}`);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    const { databaseManager } = await import('./DatabaseManager');
    await databaseManager.reset();
  });

  it("reads exactly one show's rows of this table from a large replica, through the show index", async () => {
    await table.batchSet(largeReplica());
    // Same show, another table: must not leak in.
    await otherTable.batchSet([{ id: 'trial-1', showId: 'show-7', name: 'Trial' }]);
    // No showId: not in the index, and never one show's row anyway.
    await table.batchSet([{ id: 'orphan', name: 'No show' }]);

    const indexSpy = vi.spyOn(IDBObjectStore.prototype, 'index');
    const result = await table.getByShowWithStatus('show-7');

    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
    expect(result.rows).toHaveLength(ROWS_PER_SHOW);
    expect(new Set(result.rows.map(row => row.showId))).toEqual(new Set(['show-7']));
    // Bounded: the whole-table index is never opened for this read.
    const opened = indexSpy.mock.calls.map(call => call[0]);
    expect(opened).toContain(SHOW_ID_INDEX);
    expect(opened).not.toContain('tableName');
    // Seeding a thousand rows into fake-indexeddb takes ~1.5s locally; CI runs
    // under coverage on slower hardware.
  }, 20_000);

  it('includes a row written on this device that has not synced yet', async () => {
    await table.batchSet([{ id: 'synced', showId: 'show-1', name: 'Synced' }]);
    await table.set('local', { id: 'local', showId: 'show-1', name: 'Local' });

    const result = await table.getByShowWithStatus('show-1');
    expect(result.rows.map(row => row.id).sort()).toEqual(['local', 'synced']);
  });

  it('follows a row that moves to another show', async () => {
    await table.batchSet([{ id: 'moved', showId: 'show-1', name: 'Rex' }]);
    await table.set('moved', { id: 'moved', showId: 'show-2', name: 'Rex' });

    await expect(table.getByShowWithStatus('show-1')).resolves.toMatchObject({ rows: [] });
    await expect(table.getByShowWithStatus('show-2')).resolves.toMatchObject({
      rows: [{ id: 'moved' }],
    });
  });

  it('answers a show with no rows as a confirmed empty read', async () => {
    await table.batchSet(largeReplica().slice(0, 10));
    await expect(table.getByShowWithStatus('show-none')).resolves.toEqual({
      ok: true,
      rows: [],
      error: null,
    });
  });

  it('reports a failed read instead of an empty show', async () => {
    const { databaseManager } = await import('./DatabaseManager');
    vi.spyOn(databaseManager, 'getDatabase').mockRejectedValueOnce(
      new Error('IndexedDB unavailable')
    );

    const result = await table.getByShowWithStatus('show-1');
    expect(result.ok).toBe(false);
    expect(result.rows).toEqual([]);
    expect(result.error).toBeInstanceOf(Error);
  });
});
