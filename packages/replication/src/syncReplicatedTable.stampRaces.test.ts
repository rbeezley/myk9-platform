import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedTable } from './core/ReplicatedTable';
import { MutationManager } from './MutationManager';
import { syncReplicatedTable, type SyncReplicatedTableAdapter } from './syncReplicatedTable';
import { parseUpdatedAtMs } from './parseUpdatedAt';
import type { SyncResult } from './types';

/**
 * MYK9-1148: two races in how a sync stamps a scope as one account's whole
 * download (MYK9-1133). The stamp must describe what the sync really did, and
 * must never be decided from a snapshot that another account has since moved.
 */

interface LocalRow {
  id: string;
  showId: string;
  name: string;
}
interface RemoteRow extends LocalRow {
  updated_at?: number;
  version?: number;
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

const who = { current: 'user-a' as string | null };
const settle = () => new Promise(resolve => setTimeout(resolve, 5));
const row = (id: string, version?: number): RemoteRow => ({
  id,
  showId: 'show-1',
  name: id,
  ...(version !== undefined ? { version } : {}),
});

function adapter(
  rows: () => RemoteRow[],
  extra: Partial<SyncReplicatedTableAdapter<RemoteRow, LocalRow>> = {}
): SyncReplicatedTableAdapter<RemoteRow, LocalRow> {
  return {
    fetchRemoteRows: vi.fn(async () => rows()),
    getRemoteRowCount: vi.fn(async () => rows().length),
    getRemoteId: r => r.id,
    getRemoteUpdatedAt: r => parseUpdatedAtMs(r.updated_at),
    toLocalRow: r => ({ id: r.id, showId: r.showId, name: r.name }),
    filterLocalRows: (all, scope) => all.filter(r => r.showId === scope.value),
    cleanupStaleRowsOnFullSync: true,
    ...extra,
  };
}

describe('scope stamp races (MYK9-1148)', () => {
  let table: OwnedTable;
  const sync = (a: SyncReplicatedTableAdapter<RemoteRow, LocalRow>) =>
    syncReplicatedTable(table, a, { value: 'show-1' });
  const stampOf = async () => (await table.getSyncMetadata('show-1'))?.syncedByAuthUserId;
  const signInAs = (id: string | null) => {
    who.current = id;
  };

  beforeEach(async () => {
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
    who.current = 'user-a';
    table = new OwnedTable(`races_${Date.now()}_${Math.random().toString(36).slice(2)}`);
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

  describe('a sync that resumes after another account finished its own', () => {
    it("positive control: an uninterrupted sync stamps its own account's whole download", async () => {
      await sync(adapter(() => [row('r1')]));
      expect(await stampOf()).toBe('user-a');
    });

    it("does not erase the other account's valid stamp", async () => {
      const paused = adapter(() => [row('r1')], {
        afterSuccessfulSync: async () => {
          signInAs('user-b');
          await settle();
          const b = await sync(adapter(() => [row('r1')]));
          expect(b.success).toBe(true);
          expect(await stampOf()).toBe('user-b');
        },
      });

      await sync(paused);

      expect(await stampOf()).toBe('user-b');
    });

    it('a short-falling sync decides against the stamp now stored, not the one it began with', async () => {
      // A holds the stamp when it starts; B replaces it while A is paused. A then
      // falls short (a row of B's unsent work was held back), and the stamp it
      // sees now is B's, which A's rows may have re-owned: cleared, not kept.
      await sync(adapter(() => [row('r1')]));
      expect(await stampOf()).toBe('user-a');

      const paused = adapter(() => [row('r1')], {
        getRemoteRowCount: vi.fn(async () => 2),
        afterSuccessfulSync: async () => {
          await table.updateSyncMetadata({}, { scopeValue: 'show-1', scopeSyncedBy: 'user-b' });
        },
      });
      await sync(paused);

      expect(await stampOf()).toBeUndefined();
    });
  });

  describe('a downloaded row another account still owns', () => {
    it('is not a whole download: the account that could not take the row is not stamped', async () => {
      // A holds r1 at server version 10 (clean). B's download carries version 9,
      // so the write is skipped as older and A still owns the row B cannot read.
      await sync(adapter(() => [row('r1', 10)]));
      expect((await table.getReplicatedRowIncludingOtherAccounts('r1'))?.ownerAuthUserId).toBe(
        'user-a'
      );

      signInAs('user-b');
      await settle();
      await sync(adapter(() => [row('r1', 9)]));

      expect((await table.getReplicatedRowIncludingOtherAccounts('r1'))?.ownerAuthUserId).toBe(
        'user-a'
      );
      expect(await stampOf()).not.toBe('user-b');
    });

    it('positive control: a newer download is taken over and stamped', async () => {
      await sync(adapter(() => [row('r1', 10)]));
      signInAs('user-b');
      await settle();
      await sync(adapter(() => [row('r1', 11)]));

      expect((await table.getReplicatedRowIncludingOtherAccounts('r1'))?.ownerAuthUserId).toBe(
        'user-b'
      );
      expect(await stampOf()).toBe('user-b');
    });
  });
});
