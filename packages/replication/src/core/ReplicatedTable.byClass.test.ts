/**
 * MYK9-1366: getEntriesByClass and getClassesByTrial filtered a whole-table
 * read in JS. getByClassWithStatus / getByTrialWithStatus read one class's or
 * one trial's rows through their own index, with the same account visibility,
 * redaction and ReplicaReadError shape as the show read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { ReplicatedTable } from './ReplicatedTable';
import { CLASS_ID_INDEX, TRIAL_ID_INDEX } from './DatabaseManager';
import { ReplicatedTableCacheManager } from './ReplicatedTableCache';
import type { MutationManager } from '../MutationManager';
import type { SyncResult } from '../types';

interface ScopedRow {
  id: string;
  classId?: string;
  trialId?: string;
  name: string;
}

const who = { current: 'user-a' as string | null };

class ScopedTable extends ReplicatedTable<ScopedRow> {
  async sync(): Promise<SyncResult> {
    return {
      tableName: this.tableName,
      success: true,
      operation: 'full-sync',
      rowsAffected: 0,
      duration: 0,
    };
  }

  protected resolveConflict(_local: ScopedRow, remote: ScopedRow): ScopedRow {
    return remote;
  }
}

class OwnedScopedTable extends ScopedTable {
  override usesAccountOwnedRows(): boolean {
    return true;
  }
}

function withSignedInUser(table: ReplicatedTable<ScopedRow>): void {
  table.setMutationManager({
    resolveCurrentUserId: async () => who.current,
    getPendingMutationsForRow: async () => [],
    getFailedMutations: async () => [],
    rowRefetchers: { register: () => () => {} },
  } as unknown as MutationManager);
}

const CLASSES = 10;
const ROWS_PER_CLASS = 20;

function replica(): ScopedRow[] {
  const rows: ScopedRow[] = [];
  for (let cls = 0; cls < CLASSES; cls++) {
    for (let n = 0; n < ROWS_PER_CLASS; n++) {
      rows.push({
        id: `class-${cls}-row-${n}`,
        classId: `class-${cls}`,
        trialId: `trial-${cls % 2}`,
        name: `Dog ${n}`,
      });
    }
  }
  return rows;
}

const uniqueName = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

describe('ReplicatedTable class and trial index reads (MYK9-1366)', () => {
  let table: ScopedTable;
  let otherTable: ScopedTable;

  beforeEach(async () => {
    const { databaseManager } = await import('./DatabaseManager');
    await databaseManager.reset();
    // Same reason as the show-index tests: a trailing listener notification
    // reads the whole table inside a later index-spy window (MYK9-978).
    vi.spyOn(ReplicatedTableCacheManager.prototype, 'notifyListeners').mockResolvedValue();
    who.current = 'user-a';
    table = new ScopedTable(uniqueName('entries'));
    otherTable = new ScopedTable(uniqueName('classes'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    const { databaseManager } = await import('./DatabaseManager');
    await databaseManager.reset();
  });

  it("getByClassOrThrow returns only that class's rows, through the class index", async () => {
    await table.batchSet(replica());
    // Same class id in another table: must not leak in.
    await otherTable.batchSet([{ id: 'other-1', classId: 'class-3', name: 'Other' }]);
    // No classId: not in the index.
    await table.batchSet([{ id: 'orphan', name: 'No class' }]);

    const indexSpy = vi.spyOn(IDBObjectStore.prototype, 'index');
    const rows = await table.getByClassOrThrow('class-3');

    expect(rows).toHaveLength(ROWS_PER_CLASS);
    expect(new Set(rows.map(row => row.classId))).toEqual(new Set(['class-3']));
    expect(rows.map(row => row.id)).not.toContain('other-1');
    const opened = indexSpy.mock.calls.map(call => call[0]);
    expect(opened).toContain(CLASS_ID_INDEX);
    expect(opened).not.toContain('tableName');
  });

  it("getByTrialOrThrow returns only that trial's rows, through the trial index", async () => {
    await table.batchSet(replica());

    const indexSpy = vi.spyOn(IDBObjectStore.prototype, 'index');
    const rows = await table.getByTrialOrThrow('trial-1');

    expect(rows).toHaveLength((CLASSES / 2) * ROWS_PER_CLASS);
    expect(new Set(rows.map(row => row.trialId))).toEqual(new Set(['trial-1']));
    const opened = indexSpy.mock.calls.map(call => call[0]);
    expect(opened).toContain(TRIAL_ID_INDEX);
    expect(opened).not.toContain('tableName');
  });

  it('includes an unsynced local write and follows a row that moves class', async () => {
    await table.batchSet([{ id: 'synced', classId: 'class-1', name: 'Synced' }]);
    await table.set('local', { id: 'local', classId: 'class-1', name: 'Local' });
    await table.set('synced', { id: 'synced', classId: 'class-2', name: 'Synced' });

    expect((await table.getByClassOrThrow('class-1')).map(row => row.id)).toEqual(['local']);
    expect((await table.getByClassOrThrow('class-2')).map(row => row.id)).toEqual(['synced']);
  });

  it('answers an unknown class as a confirmed empty read', async () => {
    await table.batchSet(replica().slice(0, 5));
    await expect(table.getByClassWithStatus('class-none')).resolves.toEqual({
      ok: true,
      rows: [],
      error: null,
    });
    await expect(table.getByTrialWithStatus('trial-none')).resolves.toEqual({
      ok: true,
      rows: [],
      error: null,
    });
  });

  it('reports a failed read instead of an empty class', async () => {
    const { databaseManager } = await import('./DatabaseManager');
    vi.spyOn(databaseManager, 'getDatabase').mockRejectedValue(new Error('IndexedDB unavailable'));

    const byClass = await table.getByClassWithStatus('class-1');
    const byTrial = await table.getByTrialWithStatus('trial-1');
    expect(byClass).toMatchObject({ ok: false, rows: [] });
    expect(byTrial).toMatchObject({ ok: false, rows: [] });
  });

  it('throws the same ReplicaReadError as getByShowOrThrow on a failed read', async () => {
    const { databaseManager } = await import('./DatabaseManager');
    const failure = new Error('IndexedDB unavailable');
    vi.spyOn(databaseManager, 'getDatabase').mockRejectedValue(failure);

    const expected = {
      name: 'ReplicaReadError',
      message: "This device couldn't read its saved show data. Try again.",
      cause: { table: table.getTableName(), error: failure },
    };
    await expect(table.getByClassOrThrow('class-1')).rejects.toMatchObject(expected);
    await expect(table.getByTrialOrThrow('trial-1')).rejects.toMatchObject(expected);
    await expect(table.getByShowOrThrow('show-1')).rejects.toMatchObject(expected);
  });

  it('applies the presentRows redaction the show read applies', async () => {
    class RedactingTable extends ScopedTable {
      protected override presentRows(rows: ScopedRow[]): ScopedRow[] {
        return rows.map(row => ({ ...row, name: 'redacted' }));
      }
    }
    const redacting = new RedactingTable(uniqueName('redacting'));
    await redacting.batchSet([{ id: 'a', classId: 'class-1', trialId: 'trial-1', name: 'Rex' }]);

    expect((await redacting.getByClassOrThrow('class-1'))[0]?.name).toBe('redacted');
    expect((await redacting.getByTrialOrThrow('trial-1'))[0]?.name).toBe('redacted');
  });

  describe('on a table that keeps rows per account (MYK9-1133)', () => {
    let owned: OwnedScopedTable;

    beforeEach(() => {
      owned = new OwnedScopedTable(uniqueName('owned'));
      withSignedInUser(owned);
    });

    it("returns the signed-in account's rows of the class and none of another account's", async () => {
      who.current = 'user-a';
      await owned.batchSet([
        { id: 'a1', classId: 'class-1', trialId: 'trial-1', name: 'A1' },
        { id: 'a2', classId: 'class-1', trialId: 'trial-1', name: 'A2' },
        { id: 'a3', classId: 'class-2', trialId: 'trial-1', name: 'A3' },
      ]);
      who.current = 'user-b';
      await owned.batchSet([{ id: 'b1', classId: 'class-1', trialId: 'trial-1', name: 'B1' }]);

      // Positive control: each account reads its own rows through both readers.
      who.current = 'user-a';
      expect((await owned.getByClassOrThrow('class-1')).map(row => row.id).sort()).toEqual([
        'a1',
        'a2',
      ]);
      expect((await owned.getByTrialOrThrow('trial-1')).map(row => row.id).sort()).toEqual([
        'a1',
        'a2',
        'a3',
      ]);
      who.current = 'user-b';
      expect((await owned.getByClassOrThrow('class-1')).map(row => row.id)).toEqual(['b1']);
      expect((await owned.getByClassOrThrow('class-2')).map(row => row.id)).toEqual([]);

      // The same filter the show read applies: an account that cannot be settled sees none.
      who.current = null;
      expect(await owned.getByClassOrThrow('class-1')).toEqual([]);
      expect(await owned.getByTrialOrThrow('trial-1')).toEqual([]);
      expect(await owned.getByShowOrThrow('show-1')).toEqual([]);
    });
  });
});
