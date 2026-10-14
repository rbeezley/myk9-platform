import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ReplicatedTable } from './ReplicatedTable';
import { buildRemoteReplacementRow } from './ReplicatedTableConflict';
import { buildReplicatedRowForSet } from './ReplicatedTableRowState';
import type { MutationManager } from '../MutationManager';
import type { ReplicatedRow, ReplicationConflictSnapshot, SyncResult } from '../types';

/**
 * MYK9-1133: a row's owner survives every path that replaces or rebuilds the
 * row. A replacement that dropped it would make the row ownerless, invisible to
 * the account it belongs to, while the scope still reads as that account's
 * whole download.
 */

interface Row {
  id: string;
  showId: string;
  name: string;
}

class OwnedTable extends ReplicatedTable<Row> {
  override usesAccountOwnedRows(): boolean {
    return true;
  }
  async sync(): Promise<SyncResult> {
    return {
      tableName: this.getTableName(),
      success: true,
      operation: 'incremental-sync',
      rowsAffected: 0,
      duration: 0,
    };
  }
  protected resolveConflict(_local: Row, remote: Row): Row {
    return remote;
  }
}

const who = { current: 'user-a' as string | null };
const data = (name: string): Row => ({ id: 'r1', showId: 'show-1', name });

describe('the row owner survives replacement (MYK9-1133)', () => {
  let table: OwnedTable;

  beforeEach(async () => {
    const { databaseManager } = await import('./DatabaseManager');
    await databaseManager.reset();
    who.current = 'user-a';
    table = new OwnedTable(`rows_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    table.setMutationManager({
      resolveCurrentUserId: async () => who.current,
      getPendingMutationsForRow: async () => [],
      getFailedMutations: async () => [],
      reconcilePendingMutationsForRow: async () => 0,
      rowRefetchers: { register: () => () => {} },
    } as unknown as MutationManager);
  });

  afterEach(async () => {
    const { databaseManager } = await import('./DatabaseManager');
    await databaseManager.reset();
  });

  async function conflictedRow() {
    await table.set('r1', data('server base'));
    await table.set('r1', data('local edit'), true);
    const row = (await table.getReplicatedRow('r1'))!;
    const snapshot: ReplicationConflictSnapshot<Row> = {
      tableName: table.getTableName(),
      rowId: 'r1',
      fields: ['name'],
      localData: data('local edit'),
      remoteData: data('remote edit'),
      baseData: data('server base'),
      baseVersion: 1,
      localVersion: row.version,
      remoteServerVersion: 5,
      detectedAt: Date.now(),
    };
    expect(await table.markConflict('r1', snapshot, 5)).toBe(true);
  }

  async function readersSee(id: string) {
    return {
      get: (await table.get(id)) !== null,
      row: (await table.getReplicatedRow(id)) !== null,
      all: (await table.getAllOrThrow()).some(r => r.id === id),
      show: (await table.getByShowOrThrow('show-1')).some(r => r.id === id),
      ids: (await table.getAllLocalIds()).has(id),
    };
  }

  const allSee = { get: true, row: true, all: true, show: true, ids: true };
  const noneSee = { get: false, row: false, all: false, show: false, ids: false };

  it.each(['take-remote', 'keep-local'] as const)(
    'resolving a conflict with %s keeps the row visible to its own account only',
    async resolution => {
      await conflictedRow();
      expect(await readersSee('r1')).toEqual(allSee);

      expect(await table.resolveReplicationConflict('r1', resolution)).toBe(true);

      expect((await table.getReplicatedRow('r1'))?.ownerAuthUserId).toBe('user-a');
      expect(await readersSee('r1')).toEqual(allSee);
      who.current = 'user-b';
      expect(await readersSee('r1')).toEqual(noneSee);
    }
  );

  it('taking the remote copy directly keeps the owner', async () => {
    await table.set('r1', data('server base'));
    await table.replaceFromRemote('r1', data('remote edit'), 7);

    expect((await table.get('r1'))?.name).toBe('remote edit');
    expect((await table.getReplicatedRow('r1'))?.ownerAuthUserId).toBe('user-a');
  });

  it('reconciling a dirty row against the server keeps the owner', async () => {
    await table.set('r1', data('server base'));
    await table.set('r1', data('local edit'), true);
    await table.reconcileDirtyRow('r1', {
      base: data('server base'),
      remote: { ...data('server base'), name: 'server base' },
      remoteServerVersion: 9,
    });

    expect((await table.getReplicatedRow('r1'))?.ownerAuthUserId).toBe('user-a');
  });

  it('marking a row synced keeps the owner', async () => {
    await table.set('r1', data('local edit'), true);
    await table.markAsSynced('r1');

    expect((await table.getReplicatedRow('r1'))?.ownerAuthUserId).toBe('user-a');
  });

  it('a download written while the account cannot be settled keeps the owner it replaces', async () => {
    await table.set('r1', data('first'));
    who.current = null;
    await table.batchSet([data('second')]);
    await table.batchSetChunked([data('third')], 1);
    who.current = 'user-a';

    expect((await table.get('r1'))?.name).toBe('third');
    expect((await table.getReplicatedRow('r1'))?.ownerAuthUserId).toBe('user-a');
  });

  it('a set while the account cannot be settled keeps the owner it replaces', async () => {
    await table.set('r1', data('first'));
    who.current = null;
    await table.set('r1', data('second'));
    who.current = 'user-a';

    expect((await table.getReplicatedRow('r1'))?.ownerAuthUserId).toBe('user-a');
  });

  describe('the pure row builders', () => {
    const existing = {
      tableName: 't',
      id: 'r1',
      data: data('x'),
      version: 1,
      lastSyncedAt: 1,
      lastAccessedAt: 1,
      isDirty: false,
      syncStatus: 'synced',
      ownerAuthUserId: 'user-a',
    } as ReplicatedRow<Row>;

    it('buildRemoteReplacementRow (conflict take-remote, discard replacement) keeps it', () => {
      const row = buildRemoteReplacementRow({
        tableName: 't',
        id: 'r1',
        remoteData: data('y'),
        existingRow: existing,
      });
      expect(row.ownerAuthUserId).toBe('user-a');
    });

    it('buildReplicatedRowForSet (set, the stuck-flag repair) keeps it, and a settled writer replaces it', () => {
      const base = {
        tableName: 't',
        id: 'r1',
        data: data('y'),
        isDirty: false,
        existingRow: existing,
        now: 2,
      };
      expect(buildReplicatedRowForSet(base).ownerAuthUserId).toBe('user-a');
      expect(buildReplicatedRowForSet({ ...base, ownerAuthUserId: 'user-b' }).ownerAuthUserId).toBe(
        'user-b'
      );
    });
  });
});
