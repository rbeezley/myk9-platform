import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ReplicatedTable } from './core/ReplicatedTable';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import { ReplicatedTableBatchManager } from './core/ReplicatedTableBatch';
import { MutationManager } from './MutationManager';
import { markReplicatedRowSynced } from './mutation-row-sync';
import { syncReplicatedTable, type SyncReplicatedTableAdapter } from './syncReplicatedTable';
import type { PendingMutation, ReplicatedRow, SyncResult } from './types';

/**
 * MYK9-1633: after a server-side version regression (point-in-time restore,
 * delete-and-recreate, a repair that rewrites `version`), rows this account
 * owns hold a HIGHER serverVersion than the server. One full sync must bring
 * them to the server's copy, while a newer version this device learned AFTER
 * the fetch began (an acknowledged own write, MYK9-1050; a realtime or refetch
 * write) still keeps the older download out.
 */

interface LocalRow {
  id: string;
  showId: string;
  name: string;
}
interface RemoteRow extends LocalRow {
  version: number;
}

class OwnedTable extends ReplicatedTable<LocalRow> {
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
  protected resolveConflict(_local: LocalRow, remote: LocalRow): LocalRow {
    return remote;
  }
}

const restoredRows: RemoteRow[] = [
  { id: 'e1', showId: 'show-1', name: 'server-1', version: 2 },
  { id: 'e2', showId: 'show-1', name: 'server-2', version: 3 },
];

const adapterFor = (
  rows: RemoteRow[],
  duringFetch: () => Promise<void> = async () => {}
): SyncReplicatedTableAdapter<RemoteRow, LocalRow> => ({
  fetchRemoteRows: async () => {
    await duringFetch();
    return rows;
  },
  getRemoteRowCount: async () => rows.length,
  getRemoteId: r => r.id,
  getRemoteUpdatedAt: () => undefined,
  toLocalRow: r => ({ id: r.id, showId: r.showId, name: r.name }),
  filterLocalRows: (local, scope) => local.filter(r => r.showId === scope.value),
  cleanupStaleRowsOnFullSync: true,
});

describe('owned rows recover from a server version regression (MYK9-1633)', () => {
  let table: OwnedTable;

  beforeEach(async () => {
    await databaseManager.reset();
    table = new OwnedTable(`regress_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    table.setMutationManager({
      resolveCurrentUserId: async () => 'user-a',
      getPendingMutationsForRow: async () => [],
      getFailedMutations: async () => [],
      rowRefetchers: { register: () => () => {} },
    } as unknown as MutationManager);
  });

  afterEach(async () => {
    await databaseManager.reset();
  });

  const seedOwned = (version: number) =>
    table.batchSet(
      [
        { id: 'e1', showId: 'show-1', name: 'before-restore-1' },
        { id: 'e2', showId: 'show-1', name: 'before-restore-2' },
        { id: 'gone', showId: 'show-1', name: 'not-on-server' },
      ],
      new Map([
        ['e1', version],
        ['e2', version],
        ['gone', version],
      ]),
      'user-a'
    );

  const fullSync = (adapter: SyncReplicatedTableAdapter<RemoteRow, LocalRow>) =>
    syncReplicatedTable(table, adapter, { value: 'show-1' }, { forceFullSync: true });

  it('one full sync takes the restored server copy and stamps the scope owned', async () => {
    await seedOwned(31);

    const result = await fullSync(adapterFor(restoredRows));

    expect(result.success).toBe(true);
    const rows = await table.getAllOrThrow();
    expect(rows.map(r => `${r.id}:${r.name}`).sort()).toEqual(['e1:server-1', 'e2:server-2']);
    expect((await table.getReplicatedRow('e1'))?.serverVersion).toBe(2);
    expect((await table.getReplicatedRow('e2'))?.serverVersion).toBe(3);
    expect((await table.getReplicatedRow('e2'))?.ownerAuthUserId).toBe('user-a');
    expect((await table.getSyncMetadata('show-1'))?.syncedByAuthUserId).toBe('user-a');
  });

  it('keeps a newer version stored while the download was in flight', async () => {
    await seedOwned(5);

    // A realtime or refetch write lands after the fetch began: the download
    // read the server before it, so its v5 copy is the older one.
    const result = await fullSync(
      adapterFor(
        [
          { id: 'e1', showId: 'show-1', name: 'download-1', version: 5 },
          { id: 'e2', showId: 'show-1', name: 'download-2', version: 5 },
        ],
        () =>
          table.batchSet(
            [{ id: 'e1', showId: 'show-1', name: 'realtime-1' }],
            new Map([['e1', 6]]),
            'user-a'
          )
      )
    );

    expect(result.success).toBe(true);
    const e1 = await table.getReplicatedRow('e1');
    expect(e1?.serverVersion).toBe(6);
    expect(e1?.data.name).toBe('realtime-1');
    expect((await table.getReplicatedRow('e2'))?.data.name).toBe('download-2');
  });

  it('keeps an own write acknowledged while the download was in flight (MYK9-1050)', async () => {
    await seedOwned(5);
    await table.set('e1', { id: 'e1', showId: 'show-1', name: 'scored' }, true);
    expect((await table.getReplicatedRow('e1'))?.isDirty).toBe(true);

    const mutation = {
      id: 'm1',
      tableName: table.getTableName(),
      rowId: 'e1',
      operation: 'UPDATE',
      data: { name: 'scored' },
      serverVersion: 5,
      authUserId: 'user-a',
    } as unknown as PendingMutation;

    const result = await fullSync(
      adapterFor([{ id: 'e1', showId: 'show-1', name: 'pre-ack', version: 5 }], async () => {
        const db = await databaseManager.getDatabase(table.getTableName());
        await markReplicatedRowSynced(db, mutation, 6);
      })
    );

    expect(result.success).toBe(true);
    const e1 = await table.getReplicatedRow('e1');
    expect(e1?.isDirty).toBe(false);
    expect(e1?.serverVersion).toBe(6);
    expect(e1?.data.name).toBe('scored');
  });

  it('reads only clean rows that carry a server version', async () => {
    await seedOwned(31);
    await table.batchSet([{ id: 'nv', showId: 'show-1', name: 'no-version' }], undefined, 'user-a');
    await table.set('e1', { id: 'e1', showId: 'show-1', name: 'unsent-score' }, true);

    const versions = await table.cleanServerVersions(['e1', 'e2', 'nv', 'absent']);

    expect([...versions]).toEqual([['e2', 31]]);
  });

  it('never overwrites a row with a pending local write', async () => {
    await seedOwned(31);
    await table.set('e1', { id: 'e1', showId: 'show-1', name: 'unsent-score' }, true);

    await fullSync(adapterFor(restoredRows));

    const db = await databaseManager.getDatabase(table.getTableName());
    const e1 = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, [
      table.getTableName(),
      'e1',
    ])) as ReplicatedRow<LocalRow>;
    expect(e1.isDirty).toBe(true);
    expect(e1.data.name).toBe('unsent-score');
    expect((await table.getReplicatedRow('e2'))?.data.name).toBe('server-2');
  });
});

describe('cleanServerVersions (MYK9-1633)', () => {
  it('answers with no versions when the device cannot be read, so every row keeps the guard', async () => {
    const batch = new ReplicatedTableBatchManager<LocalRow>(
      't',
      { log: () => {}, warn: () => {}, error: () => {} } as never,
      () => Promise.reject(new Error('IndexedDB unavailable')),
      () => {},
      async () => 0
    );

    await expect(batch.cleanServerVersions(['e1'])).resolves.toEqual(new Map());
  });
});
