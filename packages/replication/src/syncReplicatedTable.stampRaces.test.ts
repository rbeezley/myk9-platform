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

  describe('a stale sync that re-owned rows before it aborted', () => {
    it("clears the other account's stamp: the rows it vouched for are no longer its own", async () => {
      signInAs('user-b');
      await sync(adapter(() => [row('r1', 1)]));
      expect(await stampOf()).toBe('user-b');

      // A takes over B's r1, then the signed-in account flips back to B before A
      // reaches the stamp write.
      signInAs('user-a');
      await settle();
      table.getCurrentAuthUserId = async () => {
        const held = await table.getReplicatedRowIncludingOtherAccounts('r1');
        if (held?.ownerAuthUserId === 'user-a') who.current = 'user-b';
        return who.current;
      };
      const result = await sync(adapter(() => [row('r1', 2)]));

      expect(result.success).toBe(false);
      expect(await stampOf()).toBeUndefined();
    });
  });

  describe('one stamp decision for every way a sync that wrote rows can end', () => {
    it('A: an aborted FIRST download leaves a marker, so the scope reads not-downloaded for the next account', async () => {
      const aborted = adapter(() => [row('r1')], {
        afterSuccessfulSync: async () => {
          signInAs('user-b');
        },
      });

      const result = await sync(aborted);
      expect(result.success).toBe(false);

      const metadata = await table.getSyncMetadata('show-1');
      // totalRows set + a stamp that is not B's is what getScopeOwnership calls foreign.
      expect(metadata?.totalRows).toBeDefined();
      expect(metadata?.syncedByAuthUserId).not.toBe('user-b');
    });

    it('B: a row the other account wrote between the scan and the bulk write is still taken from it, and its stamp goes', async () => {
      const bulkWrite = table.batchSet.bind(table);
      let nested = false;
      table.batchSet = async (...args: Parameters<typeof bulkWrite>) => {
        if (!nested) {
          nested = true;
          signInAs('user-b');
          await settle();
          await sync(adapter(() => [row('r1')]));
          expect(await stampOf()).toBe('user-b');
          signInAs('user-a');
          await settle();
        }
        await bulkWrite(...args);
        signInAs('user-b'); // the account flips before A reaches its stamp write
      };

      const result = await sync(adapter(() => [row('r1')]));

      expect(result.success).toBe(false);
      expect((await table.getReplicatedRowIncludingOtherAccounts('r1'))?.ownerAuthUserId).toBe(
        'user-a'
      );
      expect(await stampOf()).toBeUndefined();
    });

    it('C: a failed read of the stored stamp does not leave the displaced account stamp in place', async () => {
      signInAs('user-b');
      await sync(adapter(() => [row('r1', 1)]));
      expect(await stampOf()).toBe('user-b');

      signInAs('user-a');
      await settle();
      table.getSyncMetadataOrThrow = async () => {
        throw new Error('metadata read timed out');
      };
      await sync(adapter(() => [row('r1', 2)]));

      expect(await stampOf()).not.toBe('user-b');
    });

    it('C: a sync that throws after writing rows still invalidates the displaced stamp', async () => {
      signInAs('user-b');
      await sync(adapter(() => [row('r1', 1)]));
      expect(await stampOf()).toBe('user-b');

      signInAs('user-a');
      await settle();
      const result = await sync(
        adapter(() => [row('r1', 2)], {
          afterSuccessfulSync: async () => {
            throw new Error('hook failed');
          },
        })
      );

      expect(result.success).toBe(false);
      expect(await stampOf()).not.toBe('user-b');
      expect((await table.getSyncMetadata('show-1'))?.totalRows).toBeDefined();
    });

    it('positive control: a sync that wrote nothing leaves a newer stamp alone', async () => {
      signInAs('user-b');
      await sync(adapter(() => [row('r1', 1)]));
      signInAs('user-a');
      await settle();
      // A downloads r1 at an older version: the write is skipped, nothing is A's.
      const result = await sync(
        adapter(() => [row('r1', 0)], {
          afterSuccessfulSync: async () => {
            signInAs('user-b');
          },
        })
      );

      expect(result.success).toBe(false);
      expect(await stampOf()).toBe('user-b');
    });
  });

  describe('an UNSCOPED table whose stale sync settles the stamp without completing', () => {
    const unscopedAdapter = (
      extra: Partial<SyncReplicatedTableAdapter<RemoteRow, LocalRow>> = {}
    ): SyncReplicatedTableAdapter<RemoteRow, LocalRow> => {
      const unscoped = adapter(() => [row('r1')], extra);
      delete unscoped.filterLocalRows;
      return unscoped;
    };
    const tableMetadata = () => table.getSyncMetadata();

    it("keeps the other account's stamp AND its coverage marker, so the table still reads downloaded", async () => {
      const stale = unscopedAdapter({
        afterSuccessfulSync: async () => {
          signInAs('user-b');
          await settle();
          expect((await syncReplicatedTable(table, unscopedAdapter(), {})).success).toBe(true);
          expect((await tableMetadata())?.syncedByAuthUserId).toBe('user-b');
          expect((await tableMetadata())?.totalRows).toBeDefined();
        },
      });

      const result = await syncReplicatedTable(table, stale, {});

      expect(result.success).toBe(false);
      const metadata = await tableMetadata();
      expect(metadata?.syncedByAuthUserId).toBe('user-b');
      expect(metadata?.totalRows).toBeDefined();
      expect(metadata?.expectedRemoteRows).toBeDefined();
    });

    it('a third account reads that table as foreign (marker present, stamp not its own)', async () => {
      const stale = unscopedAdapter({
        afterSuccessfulSync: async () => {
          signInAs('user-b');
          await settle();
          await syncReplicatedTable(table, unscopedAdapter(), {});
        },
      });
      await syncReplicatedTable(table, stale, {});

      signInAs('user-c');
      const metadata = await tableMetadata();
      expect(metadata?.totalRows).toBeDefined();
      expect(metadata?.syncedByAuthUserId).not.toBe('user-c');
    });
  });

  describe('a failed read of the stored stamp', () => {
    it("does not clear the account's own earlier stamp", async () => {
      await sync(adapter(() => [row('r1')]));
      expect(await stampOf()).toBe('user-a');

      // The non-throwing read reports a failed read as "no metadata" (null).
      const { getSyncMetadata } = table;
      table.getSyncMetadata = async () => null;
      table.getSyncMetadataOrThrow = async () => {
        throw new Error('metadata read timed out');
      };
      await sync(adapter(() => [row('r1')], { getRemoteRowCount: vi.fn(async () => 2) }));
      table.getSyncMetadata = getSyncMetadata;

      expect(await stampOf()).toBe('user-a');
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
