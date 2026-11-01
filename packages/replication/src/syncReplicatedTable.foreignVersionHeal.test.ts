import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ReplicatedTable } from './core/ReplicatedTable';
import { shouldKeepNewerRow } from './core/downloadRowGuards';
import { MutationManager } from './MutationManager';
import { syncReplicatedTable, type SyncReplicatedTableAdapter } from './syncReplicatedTable';
import type { SyncResult } from './types';

/**
 * MYK9-1632: cached rows that carry a HIGHER serverVersion than the server (a
 * reseed, a restore) and are ownerless or another account's must be healed by
 * ONE sync, or the scope can never be stamped owned. Rows the syncing account
 * owns heal too when nothing moved them during the fetch (MYK9-1633); the
 * MYK9-1050 race is covered in syncReplicatedTable.versionRegression.test.ts.
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

const remoteRows: RemoteRow[] = [
  { id: 'e1', showId: 'show-1', name: 'server-1', version: 2 },
  { id: 'e2', showId: 'show-1', name: 'server-2', version: 3 },
];

const adapter: SyncReplicatedTableAdapter<RemoteRow, LocalRow> = {
  fetchRemoteRows: async () => remoteRows,
  getRemoteRowCount: async () => remoteRows.length,
  getRemoteId: r => r.id,
  getRemoteUpdatedAt: () => undefined,
  toLocalRow: r => ({ id: r.id, showId: r.showId, name: r.name }),
  filterLocalRows: (rows, scope) => rows.filter(r => r.showId === scope.value),
  cleanupStaleRowsOnFullSync: true,
};

const who = { current: 'user-a' as string | null };

describe('foreign rows with a higher serverVersion heal in one sync (MYK9-1632)', () => {
  let table: OwnedTable;

  beforeEach(async () => {
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
    who.current = 'user-a';
    table = new OwnedTable(`heal_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    table.setMutationManager({
      resolveCurrentUserId: async () => who.current,
      getPendingMutationsForRow: async () => [],
      getFailedMutations: async () => [],
      rowRefetchers: { register: () => () => {} },
    } as unknown as MutationManager);
  });

  afterEach(async () => {
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
  });

  const seed = async (owner: string | undefined, version: number) => {
    // An ownerless row is what a pre-ownership build wrote: no signed-in account stamps it.
    who.current = owner === undefined ? null : 'user-a';
    await table.batchSet(
      [
        { id: 'e1', showId: 'show-1', name: 'stale-1' },
        { id: 'e2', showId: 'show-1', name: 'stale-2' },
        { id: 'gone', showId: 'show-1', name: 'server-absent' },
      ],
      new Map([
        ['e1', version],
        ['e2', version],
        ['gone', version],
      ]),
      owner
    );
    who.current = 'user-a';
  };

  const fullSync = () =>
    syncReplicatedTable(table, adapter, { value: 'show-1' }, { forceFullSync: true });

  it('heals ownerless rows at a higher version', async () => {
    await seed(undefined, 31);

    await fullSync();

    const rows = await table.getAllOrThrow();
    expect(rows.map(r => `${r.id}:${r.name}`).sort()).toEqual(['e1:server-1', 'e2:server-2']);
    expect((await table.getReplicatedRow('e1'))?.serverVersion).toBe(2);
    expect((await table.getReplicatedRow('e2'))?.ownerAuthUserId).toBe('user-a');
    expect((await table.getSyncMetadata('show-1'))?.syncedByAuthUserId).toBe('user-a');
  });

  it('heals rows the syncing account owns that nothing moved during the fetch (MYK9-1633)', async () => {
    await seed('user-a', 31);

    await fullSync();

    expect((await table.getReplicatedRow('e1'))?.serverVersion).toBe(2);
    expect((await table.getReplicatedRow('e1'))?.data.name).toBe('server-1');
  });

  it("still skips an older download for another account's row (MYK9-1148)", async () => {
    await seed('user-b', 31);

    await fullSync();

    const raw = await table.getReplicatedRowIncludingOtherAccounts('e1');
    expect(raw?.serverVersion).toBe(31);
    expect(raw?.ownerAuthUserId).toBe('user-b');
    expect(raw?.data.name).toBe('stale-1');
  });

  it('heals ownerless rows on the chunked write path too', async () => {
    who.current = null;
    await table.batchSetChunked(
      [
        { id: 'e1', showId: 'show-1', name: 'stale-1' },
        { id: 'e2', showId: 'show-1', name: 'stale-2' },
      ],
      1,
      new Map([
        ['e1', 31],
        ['e2', 31],
      ])
    );
    who.current = 'user-a';

    await table.batchSetChunked(
      [
        { id: 'e1', showId: 'show-1', name: 'server-1' },
        { id: 'e2', showId: 'show-1', name: 'server-2' },
      ],
      1,
      new Map([
        ['e1', 2],
        ['e2', 3],
      ]),
      'user-a'
    );

    const e2 = await table.getReplicatedRow('e2');
    expect(e2?.data.name).toBe('server-2');
    expect(e2?.serverVersion).toBe(3);
    expect(e2?.ownerAuthUserId).toBe('user-a');
  });
});

describe('shouldKeepNewerRow (MYK9-1632)', () => {
  const row = (extra: Record<string, unknown>) =>
    ({
      tableName: 't',
      id: 'r',
      data: { id: 'r' },
      version: 1,
      lastSyncedAt: 0,
      lastAccessedAt: 0,
      isDirty: false,
      syncStatus: 'synced',
      serverVersion: 31,
      ...extra,
    }) as never;

  it('heals only an ownerless row with no upload of its own', () => {
    expect(shouldKeepNewerRow(row({}), 2, 'user-a')).toBe(false);
    expect(shouldKeepNewerRow(row({ lastOwnUpload: { from: 30, to: 31 } }), 2, 'user-a')).toBe(
      true
    );
    expect(shouldKeepNewerRow(row({ ownerAuthUserId: 'user-a' }), 2, 'user-a')).toBe(true);
    expect(shouldKeepNewerRow(row({ ownerAuthUserId: 'user-b' }), 2, 'user-a')).toBe(true);
    expect(shouldKeepNewerRow(row({}), 2, undefined)).toBe(true);
    expect(shouldKeepNewerRow(row({}), 40, 'user-a')).toBe(false);
  });

  it('heals an owned row whose version did not move since the fetch began (MYK9-1633)', () => {
    const own = row({ ownerAuthUserId: 'user-a', lastOwnUpload: { from: 30, to: 31 } });
    expect(shouldKeepNewerRow(own, 2, 'user-a', 31)).toBe(false);
    expect(shouldKeepNewerRow(own, 2, 'user-a', 30)).toBe(true);
    expect(shouldKeepNewerRow(own, 2, 'user-a', undefined)).toBe(true);
    expect(shouldKeepNewerRow(row({ ownerAuthUserId: 'user-b' }), 2, 'user-a', 31)).toBe(true);
    expect(shouldKeepNewerRow(row({}), 2, undefined, 31)).toBe(false);
  });
});
