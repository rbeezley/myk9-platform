import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedTable } from './core/ReplicatedTable';
import { MutationManager } from './MutationManager';
import { syncReplicatedTable, type SyncReplicatedTableAdapter } from './syncReplicatedTable';
import type { SyncResult } from './types';

/**
 * MYK9-1149: "did this sync write rows" is decided inside the metadata
 * transaction, from the rows store as it is then, never from a read taken
 * before another account's download landed.
 */

interface LocalRow {
  id: string;
  showId: string;
  name: string;
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

const row = (id: string): LocalRow => ({ id, showId: 'show-1', name: id });

function adapter(
  rows: LocalRow[],
  remoteCount: number = rows.length
): SyncReplicatedTableAdapter<LocalRow, LocalRow> {
  return {
    fetchRemoteRows: vi.fn(async () => rows),
    getRemoteRowCount: vi.fn(async () => remoteCount),
    getRemoteId: r => r.id,
    toLocalRow: r => r,
    filterLocalRows: (all, scope) => all.filter(r => r.showId === scope.value),
    cleanupStaleRowsOnFullSync: true,
  };
}

describe('stamp settle reads row ownership inside the metadata transaction (MYK9-1149)', () => {
  let table: OwnedTable;
  const who = { current: 'user-a' as string | null };
  const stampOf = async () => (await table.getSyncMetadata('show-1'))?.syncedByAuthUserId;

  beforeEach(async () => {
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
    who.current = 'user-a';
    table = new OwnedTable(`atomic_${Date.now()}_${Math.random().toString(36).slice(2)}`);
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

  it('a partial sync does not clear the stamp of an account that re-owned its rows and finished first', async () => {
    // A's download falls short (2 rows on the server, 1 fetched) and its own
    // stamp is the one stored when it starts.
    const real = table.updateSyncMetadata.bind(table);
    let interleaved = false;
    table.updateSyncMetadata = async (...args: Parameters<typeof real>) => {
      if (!interleaved && typeof args[1]?.scopeSyncedBy === 'object') {
        interleaved = true;
        // B re-owns r1 and completes a whole, newer download before A's write.
        who.current = 'user-b';
        const b = await syncReplicatedTable(table, adapter([row('r1')]), { value: 'show-1' });
        expect(b.success).toBe(true);
        expect(await stampOf()).toBe('user-b');
        who.current = 'user-a';
      }
      return real(...args);
    };

    await syncReplicatedTable(table, adapter([row('r1')], 2), { value: 'show-1' });

    expect(interleaved).toBe(true);
    expect((await table.getReplicatedRowIncludingOtherAccounts('r1'))?.ownerAuthUserId).toBe(
      'user-b'
    );
    expect(await stampOf()).toBe('user-b');
  });

  it("positive control: a partial sync that still owns its rows clears another account's stamp", async () => {
    const seed = table.updateSyncMetadata.bind(table);
    await seed({}, { scopeValue: 'show-1', scopeSyncedBy: 'user-b' });

    await syncReplicatedTable(table, adapter([row('r1')], 2), { value: 'show-1' });

    expect(await stampOf()).toBeUndefined();
  });
});
