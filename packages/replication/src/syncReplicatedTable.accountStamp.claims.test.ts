import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedTable } from './core/ReplicatedTable';
import type { MutationManager } from './MutationManager';
import { syncReplicatedTable, type SyncReplicatedTableAdapter } from './syncReplicatedTable';
import { parseUpdatedAtMs } from './parseUpdatedAt';
import type { SyncOptions, SyncResult } from './types';

/**
 * MYK9-1133, review round: how an account CLAIMS a scope that held another
 * account's rows. The stamp decision has to credit a cleanup the adapter
 * already ran, refuse to vouch for another account's unsent work, and
 * reconcile scoped stamps when an unscoped sync replaces the rows under them.
 */

interface LocalRow {
  id: string;
  showId: string;
  name: string;
}
interface RemoteRow extends LocalRow {
  updated_at?: number;
}

class TestTable extends ReplicatedTable<LocalRow> {
  async sync(_scope: string, _options?: Partial<SyncOptions>): Promise<SyncResult> {
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
/** row id -> the account whose queue holds an unsent mutation for it */
const unsent = new Map<string, string>();

const row = (id: string, showId = 'show-1'): RemoteRow => ({ id, showId, name: id });
const settle = () => new Promise(resolve => setTimeout(resolve, 5));

function adapter(
  remote: () => RemoteRow[],
  options: { scoped?: boolean; count?: boolean; cleanup?: 'full' | 'always' | 'none' } = {}
): SyncReplicatedTableAdapter<RemoteRow, LocalRow> {
  const { scoped = true, count = true, cleanup = 'full' } = options;
  return {
    fetchRemoteRows: vi.fn(async () => remote()),
    ...(count ? { getRemoteRowCount: vi.fn(async () => remote().length) } : {}),
    getRemoteId: r => r.id,
    getRemoteUpdatedAt: r => parseUpdatedAtMs(r.updated_at),
    toLocalRow: r => ({ id: r.id, showId: r.showId, name: r.name }),
    ...(scoped
      ? { filterLocalRows: (rows, scope) => rows.filter(r => r.showId === scope.value) }
      : {}),
    ...(cleanup === 'full' ? { cleanupStaleRowsOnFullSync: true } : {}),
    ...(cleanup === 'always' ? { shouldCleanupStaleRows: true } : {}),
  };
}

const sync = (
  table: TestTable,
  a: SyncReplicatedTableAdapter<RemoteRow, LocalRow>,
  scope: { value?: string } = { value: 'show-1' }
) => syncReplicatedTable(table, a, scope, { stampSyncingAccount: true });

describe('claiming a scope another account synced (MYK9-1133)', () => {
  let table: TestTable;

  beforeEach(async () => {
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
    who.current = 'user-a';
    unsent.clear();
    table = new TestTable(`rows_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    table.setMutationManager({
      resolveCurrentUserId: async () => who.current,
      getPendingMutationsForRow: async (_table: string, id: string) =>
        unsent.get(id) === who.current ? [{ id: `m-${id}` }] : [],
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
  const idsIn = async (showId: string) =>
    (await table.getAllOrThrow())
      .filter(r => r.showId === showId)
      .map(r => r.id)
      .sort();

  describe("the adapter's own stale cleanup already removed the other account's rows", () => {
    it("stamps the new account on A's scope after B's complete fetch", async () => {
      await sync(
        table,
        adapter(() => [row('a1'), row('a2')])
      );
      await settle();
      who.current = 'user-b';

      await sync(
        table,
        adapter(() => [row('b1'), row('b2')])
      );

      expect(await idsIn('show-1')).toEqual(['b1', 'b2']);
      expect(await stampOf('show-1')).toBe('user-b');
    });

    it('stamps the account on an unstamped pre-change scope', async () => {
      await table.set('legacy', row('legacy'));
      await table.updateSyncMetadata({ totalRows: 1 }, { scopeValue: 'show-1' });
      await settle();

      await sync(
        table,
        adapter(() => [row('a1')])
      );

      expect(await idsIn('show-1')).toEqual(['a1']);
      expect(await stampOf('show-1')).toBe('user-a');
    });
  });

  describe("another account's unsent work in the scope", () => {
    async function aLeavesAnUnsentEdit() {
      await sync(
        table,
        adapter(() => [row('a1')])
      );
      await table.set('draft', row('draft'), true);
      unsent.set('draft', 'user-a');
      await settle();
    }

    it('is kept, and the scope is not stamped for B', async () => {
      await aLeavesAnUnsentEdit();
      who.current = 'user-b';

      await sync(
        table,
        adapter(() => [row('b1')])
      );

      expect(await idsIn('show-1')).toEqual(['b1', 'draft']);
      expect(await stampOf('show-1')).toBeUndefined();
    });

    it("B's own unsent create in the same scope does not block the stamp", async () => {
      await sync(
        table,
        adapter(() => [row('a1')])
      );
      await settle();
      who.current = 'user-b';
      await table.set('b-draft', row('b-draft'), true);
      unsent.set('b-draft', 'user-b');

      await sync(
        table,
        adapter(() => [row('b1')])
      );

      expect(await idsIn('show-1')).toEqual(['b-draft', 'b1']);
      expect(await stampOf('show-1')).toBe('user-b');
    });

    it('once A signs back in and uploads, the next sync stamps', async () => {
      await aLeavesAnUnsentEdit();
      who.current = 'user-b';
      await sync(
        table,
        adapter(() => [row('b1')])
      );
      expect(await stampOf('show-1')).toBeUndefined();

      who.current = 'user-a';
      unsent.delete('draft');
      await table.markAsSynced('draft');
      await settle();
      await sync(
        table,
        adapter(() => [row('a1'), row('draft')])
      );

      expect(await stampOf('show-1')).toBe('user-a');
    });

    it('an unreadable queue is never a pass', async () => {
      await aLeavesAnUnsentEdit();
      who.current = 'user-b';
      (
        table as unknown as { mutationManager: { getFailedMutations: () => Promise<never> } }
      ).mutationManager.getFailedMutations = async () => {
        throw new Error('queue unreadable');
      };

      await sync(
        table,
        adapter(() => [row('b1')])
      );

      expect(await stampOf('show-1')).toBeUndefined();
    });
  });

  describe('an unscoped sync replaces the rows under every scoped stamp (armbands)', () => {
    const unscoped = (rows: () => RemoteRow[]) =>
      adapter(rows, { scoped: false, count: false, cleanup: 'always' });

    it("A scoped, then B unscoped: B's table stamp supersedes A's scoped stamp", async () => {
      await sync(
        table,
        adapter(() => [row('a1')])
      );
      await settle();
      who.current = 'user-b';

      await sync(
        table,
        unscoped(() => [row('b1')]),
        {}
      );

      expect(await stampOf()).toBe('user-b');
      expect(await stampOf('show-1')).toBe('user-b');
      expect((await table.getAllOrThrow()).map(r => r.id)).toEqual(['b1']);
    });

    it('then A signing back in is refused by the stamp, not handed B rows', async () => {
      await sync(
        table,
        adapter(() => [row('a1')])
      );
      await settle();
      who.current = 'user-b';
      await sync(
        table,
        unscoped(() => [row('b1')]),
        {}
      );

      expect(await stampOf('show-1')).not.toBe('user-a');
    });

    it("B scoped, then A's first unscoped sync purges B's rows and restamps every scope", async () => {
      who.current = 'user-b';
      await sync(
        table,
        adapter(() => [row('b1')])
      );
      await settle();
      who.current = 'user-a';

      await sync(
        table,
        unscoped(() => [row('a1')]),
        {}
      );

      expect((await table.getAllOrThrow()).map(r => r.id)).toEqual(['a1']);
      expect(await stampOf()).toBe('user-a');
      expect(await stampOf('show-1')).toBe('user-a');
    });

    it("A's first unscoped sync removes B's scoped rows on its own, with no adapter cleanup", async () => {
      who.current = 'user-b';
      await sync(
        table,
        adapter(() => [row('b1')])
      );
      await settle();
      who.current = 'user-a';

      await sync(
        table,
        adapter(() => [row('a1')], { scoped: false, cleanup: 'none' }),
        {}
      );

      expect((await table.getAllOrThrow()).map(r => r.id)).toEqual(['a1']);
      expect(await stampOf('show-1')).toBe('user-a');
    });

    it("A's later unscoped sync also reclaims a scope B stamped after A's table stamp", async () => {
      const unscopedNoCleanup = (rows: () => RemoteRow[]) =>
        adapter(rows, { scoped: false, cleanup: 'none' });
      await sync(
        table,
        unscopedNoCleanup(() => [row('a0', 'show-9')]),
        {}
      );
      await settle();
      who.current = 'user-b';
      await sync(
        table,
        adapter(() => [row('b1')])
      );
      await settle();
      who.current = 'user-a';

      await sync(
        table,
        unscopedNoCleanup(() => [row('a0', 'show-9')]),
        {}
      );

      expect((await table.getAllOrThrow()).map(r => r.id)).toEqual(['a0']);
      expect(await stampOf('show-1')).toBe('user-a');
    });

    it('an unscoped sync whose identity changed clears the scoped stamps too', async () => {
      await sync(
        table,
        adapter(() => [row('a1')])
      );
      const changing = unscoped(() => [row('a1')]);
      changing.fetchRemoteRows = vi.fn(async () => {
        who.current = 'user-b';
        return [row('a1')];
      });

      await sync(table, changing, {});

      expect(await stampOf()).toBeUndefined();
      expect(await stampOf('show-1')).toBeUndefined();
    });
  });
});
