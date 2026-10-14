import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedTable } from './core/ReplicatedTable';
import { MutationManager } from './MutationManager';
import { syncReplicatedTable, type SyncReplicatedTableAdapter } from './syncReplicatedTable';
import { parseUpdatedAtMs } from './parseUpdatedAt';
import type { SyncResult } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * MYK9-1133: on a table that keeps rows per account every row records the
 * account that wrote it and every reader sees only its own account's rows. A
 * replica one account left behind is invisible to the next, survives that
 * account's syncs, and is re-owned (not trusted) when its owner syncs again.
 * The scope stamp is only the marker that an account finished a whole download.
 */

interface LocalRow {
  id: string;
  showId: string;
  name: string;
}
interface RemoteRow extends LocalRow {
  updated_at?: number;
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

class PlainTable extends OwnedTable {
  override usesAccountOwnedRows(): boolean {
    return false;
  }
}

const who = { current: 'user-a' as string | null };
const row = (id: string, showId = 'show-1'): RemoteRow => ({ id, showId, name: id });
const settle = () => new Promise(resolve => setTimeout(resolve, 5));

function adapter(
  remote: () => Promise<RemoteRow[]> | RemoteRow[],
  options: {
    scoped?: boolean;
    count?: () => number;
    cleanup?: boolean;
    verifyEmpty?: boolean;
    noCount?: boolean;
  } = {}
): SyncReplicatedTableAdapter<RemoteRow, LocalRow> {
  const { scoped = true, cleanup = true } = options;
  return {
    fetchRemoteRows: vi.fn(async () => remote()),
    ...(options.noCount
      ? {}
      : { getRemoteRowCount: vi.fn(async () => options.count?.() ?? (await remote()).length) }),
    getRemoteId: r => r.id,
    getRemoteUpdatedAt: r => parseUpdatedAtMs(r.updated_at),
    toLocalRow: r => ({ id: r.id, showId: r.showId, name: r.name }),
    ...(scoped
      ? { filterLocalRows: (rows, scope) => rows.filter(r => r.showId === scope.value) }
      : {}),
    ...(cleanup ? { cleanupStaleRowsOnFullSync: true } : {}),
    ...(options.verifyEmpty !== undefined
      ? { verifyScopeEmpty: async () => options.verifyEmpty === true }
      : {}),
  };
}

const sync = (
  table: ReplicatedTable<LocalRow>,
  a: SyncReplicatedTableAdapter<RemoteRow, LocalRow>,
  scope: { value?: string } = { value: 'show-1' }
) => syncReplicatedTable(table, a, scope);

describe('account-owned replica rows (MYK9-1133)', () => {
  let table: OwnedTable;

  beforeEach(async () => {
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
    who.current = 'user-a';
    table = new OwnedTable(`rows_${Date.now()}_${Math.random().toString(36).slice(2)}`);
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

  const stampOf = async (scope?: string) =>
    (await table.getSyncMetadata(scope))?.syncedByAuthUserId;
  const visible = async () => (await table.getAllOrThrow()).map(r => r.id).sort();
  const everyone = async () =>
    (await table.getAllOrThrowIncludingOtherAccounts()).map(r => r.id).sort();
  const signInAs = (id: string | null) => {
    who.current = id;
  };

  describe('what each account can read', () => {
    beforeEach(async () => {
      await sync(
        table,
        adapter(() => [row('a1'), row('a2')])
      );
      await settle();
    });

    it('positive control: the syncing account reads its own rows through every reader', async () => {
      expect(await visible()).toEqual(['a1', 'a2']);
      expect((await table.get('a1'))?.id).toBe('a1');
      expect((await table.getReplicatedRow('a1'))?.ownerAuthUserId).toBe('user-a');
      expect((await table.getByShowOrThrow('show-1')).map(r => r.id).sort()).toEqual(['a1', 'a2']);
      expect([...(await table.getAllLocalIds())].sort()).toEqual(['a1', 'a2']);
    });

    it('another account reads none of them through any reader', async () => {
      signInAs('user-b');

      expect(await visible()).toEqual([]);
      expect(await table.get('a1')).toBeNull();
      expect(await table.getReplicatedRow('a1')).toBeNull();
      expect(await table.getByShowOrThrow('show-1')).toEqual([]);
      expect((await table.getAll()).length).toBe(0);
      expect((await table.getAllWithStatus()).rows).toEqual([]);
      expect([...(await table.getAllLocalIds())]).toEqual([]);
    });

    it('an account that cannot be settled reads nothing', async () => {
      signInAs(null);

      expect(await visible()).toEqual([]);
      expect(await table.get('a1')).toBeNull();
    });

    it('a sync by another account leaves the first account rows on disk', async () => {
      signInAs('user-b');
      await settle();
      await sync(
        table,
        adapter(() => [row('b1')])
      );

      expect(await visible()).toEqual(['b1']);
      expect(await everyone()).toEqual(['a1', 'a2', 'b1']);

      signInAs('user-a');
      expect(await visible()).toEqual(['a1', 'a2']);
    });

    it('a table that keeps no owners is unchanged', async () => {
      const plain = new PlainTable(`plain_${Date.now()}`);
      await plain.batchSet([{ id: 'p1', showId: 'show-1', name: 'p1' }]);
      signInAs('user-b');
      expect((await plain.getAllOrThrow()).map(r => r.id)).toEqual(['p1']);
      expect((await plain.getReplicatedRow('p1'))?.ownerAuthUserId).toBeUndefined();
    });
  });

  describe('rows written before ownership existed', () => {
    async function seedOwnerless() {
      signInAs(null);
      await table.batchSet([{ id: 'old1', showId: 'show-1', name: 'old1' }]);
      await table.updateSyncMetadata({ totalRows: 1 }, { scopeValue: 'show-1' });
      signInAs('user-a');
      await settle();
    }

    it('are visible to nobody', async () => {
      await seedOwnerless();
      expect(await visible()).toEqual([]);
      signInAs('user-b');
      expect(await visible()).toEqual([]);
      expect(await everyone()).toEqual(['old1']);
    });

    it('become the syncing account own after one complete download, and stay invisible to others', async () => {
      await seedOwnerless();

      await sync(
        table,
        adapter(() => [{ ...row('old1') }])
      );

      expect(await visible()).toEqual(['old1']);
      expect((await table.getReplicatedRow('old1'))?.ownerAuthUserId).toBe('user-a');
      signInAs('user-b');
      expect(await visible()).toEqual([]);
    });

    it('make an unstamped scope download in full so unchanged rows are re-owned', async () => {
      await seedOwnerless();
      const a = adapter(() => [row('old1')]);

      await sync(table, a);

      expect(a.fetchRemoteRows).toHaveBeenCalledWith(
        expect.objectContaining({ forceFullSync: true })
      );
    });
  });

  describe("another account's unsent edit", () => {
    it('is never shown to a second account, even when the server returns that row to it', async () => {
      await sync(
        table,
        adapter(() => [row('r1')])
      );
      await table.set('r1', { id: 'r1', showId: 'show-1', name: 'A unsent edit' }, true);
      await settle();
      signInAs('user-b');

      await sync(
        table,
        adapter(() => [{ ...row('r1'), name: 'server value' }, row('b1')])
      );

      expect(await visible()).toEqual(['b1']);
      expect(await table.get('r1')).toBeNull();
      expect(
        (await table.getAllOrThrowIncludingOtherAccounts()).find(r => r.id === 'r1')?.name
      ).toBe('A unsent edit');
      expect(await stampOf('show-1')).toBeUndefined();
    });

    it('converges once the first account uploads and the second syncs again', async () => {
      await sync(
        table,
        adapter(() => [row('r1')])
      );
      await table.set('r1', { id: 'r1', showId: 'show-1', name: 'A unsent edit' }, true);
      await settle();
      signInAs('user-b');
      await sync(
        table,
        adapter(() => [{ ...row('r1'), name: 'server value' }])
      );

      signInAs('user-a');
      expect((await table.get('r1'))?.name).toBe('A unsent edit');
      await table.markAsSynced('r1');
      await settle();
      signInAs('user-b');
      await sync(
        table,
        adapter(() => [{ ...row('r1'), name: 'A unsent edit' }])
      );

      expect((await table.get('r1'))?.name).toBe('A unsent edit');
      expect(await stampOf('show-1')).toBe('user-b');
    });

    it("a second account's own unsent create does not block its stamp", async () => {
      await sync(
        table,
        adapter(() => [row('a1')])
      );
      await settle();
      signInAs('user-b');
      await table.set('b-draft', { id: 'b-draft', showId: 'show-1', name: 'b-draft' }, true);

      await sync(
        table,
        adapter(() => [row('b1')])
      );

      expect(await visible()).toEqual(['b-draft', 'b1']);
      expect(await stampOf('show-1')).toBe('user-b');
    });
  });

  describe('overlapping downloads', () => {
    it('a download that finishes after the account changed applies nothing', async () => {
      let release: (rows: RemoteRow[]) => void = () => {};
      const slowA = new Promise<RemoteRow[]>(resolve => {
        release = resolve;
      });
      const aSync = sync(
        table,
        adapter(() => slowA)
      );
      await settle();
      signInAs('user-b');
      await sync(
        table,
        adapter(() => [row('b1')])
      );

      release([row('a1')]);
      const result = await aSync;

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/changed during the sync/);
      expect(await visible()).toEqual(['b1']);
      expect(await everyone()).toEqual(['b1']);
      expect(await stampOf('show-1')).toBe('user-b');
    });

    it('rows an earlier download wrote as another account never become visible', async () => {
      await sync(
        table,
        adapter(() => [row('a1')])
      );
      signInAs('user-b');

      expect(await visible()).toEqual([]);
      expect(await stampOf('show-1')).toBe('user-a');
    });

    it('a sync without a settled account writes nothing', async () => {
      signInAs(null);

      const result = await sync(
        table,
        adapter(() => [row('x1')])
      );

      expect(result.success).toBe(false);
      expect(await everyone()).toEqual([]);
    });
  });

  describe('the scope stamp marks a whole download by one account', () => {
    it('is written by a scoped sync, only for that scope, and cleared by clearCache', async () => {
      await sync(
        table,
        adapter(() => [row('a1')])
      );

      expect(await stampOf('show-1')).toBe('user-a');
      expect(await stampOf('show-2')).toBeUndefined();
      await table.clearCache();
      expect(await stampOf('show-1')).toBeUndefined();
    });

    it('is not written when the fetch is shorter than the server count', async () => {
      await sync(
        table,
        adapter(() => [row('a1')], { count: () => 5 })
      );
      expect(await stampOf('show-1')).toBeUndefined();
    });

    it('is not written for an empty answer nothing proves, and is for one that is proven', async () => {
      // A pre-ownership row is still on disk, so an empty answer is not self-evident.
      signInAs(null);
      await table.batchSet([{ id: 'old1', showId: 'show-1', name: 'old1' }]);
      signInAs('user-a');
      await settle();

      await sync(
        table,
        adapter(() => [], { count: () => 0, verifyEmpty: false })
      );
      expect(await stampOf('show-1')).toBeUndefined();

      await sync(
        table,
        adapter(() => [], { count: () => 0, verifyEmpty: true })
      );
      expect(await stampOf('show-1')).toBe('user-a');
    });

    it("an empty unproven answer over another account's rows does not stamp", async () => {
      await sync(
        table,
        adapter(() => [row('a1')])
      );
      await settle();
      signInAs('user-b');

      await sync(
        table,
        adapter(() => [], { count: () => 0, verifyEmpty: false })
      );

      // B wrote nothing, so A's rows are untouched and A's stamp still describes them;
      // B itself is not stamped, which is what keeps A's rows from B's reads.
      expect(await stampOf('show-1')).toBe('user-a');
      expect(await everyone()).toEqual(['a1']);
      expect(await visible()).toEqual([]);
    });

    it("a short sync leaves its own account's earlier stamp alone and clears another's", async () => {
      await sync(
        table,
        adapter(() => [row('a1')])
      );
      await sync(
        table,
        adapter(() => [row('a1')], { count: () => 5 })
      );
      expect(await stampOf('show-1')).toBe('user-a');

      await settle();
      signInAs('user-b');
      await sync(
        table,
        adapter(() => [row('b1')], { count: () => 5 })
      );
      expect(await stampOf('show-1')).toBeUndefined();
    });

    it('an account whose rows another account re-owned downloads in full to get them back', async () => {
      await sync(
        table,
        adapter(() => [
          { ...row('a1'), updated_at: 1000 },
          { ...row('a2'), updated_at: 1000 },
        ])
      );
      await settle();
      signInAs('user-b');
      // B's download is short (so B is not stamped) but it re-owns the rows it did write.
      await sync(
        table,
        adapter(() => [row('a1')], { count: () => 5 })
      );
      await settle();
      signInAs('user-a');
      expect(await visible()).toEqual(['a2']);
      expect(await stampOf('show-1')).toBeUndefined();

      // Nothing changed on the server, so an incremental fetch would return nothing.
      const serverRows = [
        { ...row('a1'), updated_at: 1000 },
        { ...row('a2'), updated_at: 1000 },
      ];
      const incremental = adapter(() => serverRows, { noCount: true });
      incremental.fetchRemoteRows = vi.fn(async ({ since }) =>
        since > 0 ? serverRows.filter(r => (r.updated_at ?? 0) > since) : serverRows
      );
      await sync(table, incremental);

      expect(await visible()).toEqual(['a1', 'a2']);
      expect(await stampOf('show-1')).toBe('user-a');
    });

    it('an account that changes during the fetch fails the sync and applies nothing', async () => {
      await sync(
        table,
        adapter(() => [row('a1')])
      );
      const changing = adapter(() => [row('a1'), row('a-new')]);
      changing.fetchRemoteRows = vi.fn(async () => {
        signInAs('user-b');
        return [row('a1'), row('a-new')];
      });

      const result = await sync(table, changing);

      expect(result.success).toBe(false);
      expect(await everyone()).toEqual(['a1']);
    });

    it('an unscoped sync stamps the table and supersedes every scoped stamp', async () => {
      await sync(
        table,
        adapter(() => [row('a1')])
      );
      await settle();
      signInAs('user-b');

      await sync(
        table,
        adapter(() => [row('b1')], { scoped: false }),
        {}
      );

      expect(await stampOf()).toBe('user-b');
      expect(await stampOf('show-1')).toBe('user-b');
    });
  });

  describe('offline with the same account', () => {
    it('reads its own rows when the live session lookup never resolves but the session is persisted', async () => {
      const manager = new MutationManager({} as SupabaseClient, {
        getCurrentUserId: () => new Promise<string | null>(() => {}),
        getCachedUserId: () => 'user-a',
      });
      table.setMutationManager(manager);
      await table.batchSet([{ id: 'a1', showId: 'show-1', name: 'a1' }], undefined, 'user-a');

      expect((await table.getAllOrThrow()).map(r => r.id)).toEqual(['a1']);
    });

    it("does not read another account's rows through the same persisted session", async () => {
      await table.batchSet([{ id: 'a1', showId: 'show-1', name: 'a1' }], undefined, 'user-a');
      table.setMutationManager(
        new MutationManager({} as SupabaseClient, {
          getCurrentUserId: () => new Promise<string | null>(() => {}),
          getCachedUserId: () => 'user-b',
        })
      );

      expect(await table.getAllOrThrow()).toEqual([]);
    });
  });
});
