import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedTable } from './core/ReplicatedTable';
import type { MutationManager } from './MutationManager';
import { syncReplicatedTable, type SyncReplicatedTableAdapter } from './syncReplicatedTable';
import { parseUpdatedAtMs } from './parseUpdatedAt';
import type { SyncOptions, SyncResult } from './types';

/**
 * MYK9-1133: a scope's rows belong to the account that synced them. Replicas
 * survive sign-out (MYK9-202), so the sync stamps the scope with the signed-in
 * auth user, and the first sync by a different account removes the clean rows
 * the previous account left in that scope before it stamps the scope.
 */

interface LocalRow {
  id: string;
  showId: string;
  name: string;
}
interface RemoteRow {
  id: string;
  showId: string;
  name: string;
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

const identity = { current: 'user-a' as string | null };

function adapterReturning(
  remote: () => RemoteRow[],
  options: { expectedCount?: () => number } = {}
): SyncReplicatedTableAdapter<RemoteRow, LocalRow> {
  return {
    fetchRemoteRows: vi.fn(async () => remote()),
    ...(options.expectedCount
      ? { getRemoteRowCount: vi.fn(async () => options.expectedCount?.()) }
      : {}),
    getRemoteId: row => row.id,
    getRemoteUpdatedAt: row => parseUpdatedAtMs(row.updated_at),
    toLocalRow: row => ({ id: row.id, showId: row.showId, name: row.name }),
    filterLocalRows: (rows, scope) => rows.filter(row => row.showId === scope.value),
  };
}

// The stale-row cutoff is strict: rows must predate the next fetch.
const settle = () => new Promise(resolve => setTimeout(resolve, 5));

const stampedSync = <R extends { id: string }>(
  target: ReplicatedTable<R>,
  adapter: SyncReplicatedTableAdapter<RemoteRow, R>,
  scope: { value?: string } = {}
) => syncReplicatedTable(target, adapter, scope, { stampSyncingAccount: true });

const row = (id: string, showId = 'show-1'): RemoteRow => ({ id, showId, name: id });

describe('syncReplicatedTable account stamp (MYK9-1133)', () => {
  let table: TestTable;

  beforeEach(async () => {
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
    identity.current = 'user-a';
    table = new TestTable(`rows_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    table.setMutationManager({
      resolveCurrentUserId: async () => identity.current,
      rowRefetchers: { register: () => () => {} },
    } as unknown as MutationManager);
  });

  afterEach(async () => {
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
  });

  const stampOf = async (showId: string) =>
    (await table.getSyncMetadata(showId))?.syncedByAuthUserId;
  const idsIn = async (showId: string) =>
    (await table.getAllOrThrow())
      .filter(r => r.showId === showId)
      .map(r => r.id)
      .sort();

  it('a scoped sync stamps that scope with the signed-in account, and only that scope', async () => {
    await stampedSync(
      table,
      adapterReturning(() => [row('a1')]),
      { value: 'show-1' }
    );

    expect(await stampOf('show-1')).toBe('user-a');
    expect(await stampOf('show-2')).toBeUndefined();
  });

  it('clearCache removes the stamp with the rest of the scope', async () => {
    await stampedSync(
      table,
      adapterReturning(() => [row('a1')]),
      { value: 'show-1' }
    );
    expect(await stampOf('show-1')).toBe('user-a');

    await table.clearCache();

    expect(await stampOf('show-1')).toBeUndefined();
    expect((await table.getSyncMetadata('show-1'))?.totalRows).toBeUndefined();
  });

  it('a scope written without a stamp (a pre-change cache) reads as unstamped', async () => {
    await table.updateSyncMetadata({ totalRows: 2 }, { scopeValue: 'show-1' });

    const metadata = await table.getSyncMetadata('show-1');
    expect(metadata?.totalRows).toBe(2);
    expect(metadata?.syncedByAuthUserId).toBeUndefined();
  });

  it('an unresolved identity stamps nothing and clears the previous stamp', async () => {
    await stampedSync(
      table,
      adapterReturning(() => [row('a1')]),
      { value: 'show-1' }
    );
    identity.current = null;

    await stampedSync(
      table,
      adapterReturning(() => [row('a1')]),
      { value: 'show-1' }
    );

    expect(await stampOf('show-1')).toBeUndefined();
    expect(await idsIn('show-1')).toEqual(['a1']);
  });

  it('an account that changes during the fetch stamps nothing', async () => {
    const adapter = adapterReturning(() => [row('a1')]);
    adapter.fetchRemoteRows = vi.fn(async () => {
      await settle();
      identity.current = 'user-b';
      return [row('a1')];
    });

    await stampedSync(table, adapter, { value: 'show-1' });

    expect(await stampOf('show-1')).toBeUndefined();
  });

  it('A, then B, then A: each sync leaves only its own rows and its own stamp', async () => {
    await stampedSync(
      table,
      adapterReturning(() => [row('a1'), row('a2')]),
      {
        value: 'show-1',
      }
    );
    expect(await idsIn('show-1')).toEqual(['a1', 'a2']);

    // B is authorized for show-1 but RLS shows B one different row.
    await settle();
    identity.current = 'user-b';
    await stampedSync(
      table,
      adapterReturning(() => [row('b1')]),
      { value: 'show-1' }
    );
    expect(await idsIn('show-1')).toEqual(['b1']);
    expect(await stampOf('show-1')).toBe('user-b');

    identity.current = 'user-a';
    await stampedSync(
      table,
      adapterReturning(() => [row('a1'), row('a2')]),
      {
        value: 'show-1',
      }
    );
    expect(await idsIn('show-1')).toEqual(['a1', 'a2']);
    expect(await stampOf('show-1')).toBe('user-a');
  });

  // MYK9-880: an empty fetch over a warm scope is not proof the scope is empty,
  // because the count and the fetch share one RLS and a claims gap reads 0 and 0.
  describe('an empty fetch over rows this account did not stamp', () => {
    const emptyAdapter = (verifyScopeEmpty?: () => Promise<boolean>) => {
      const adapter = adapterReturning(() => [], { expectedCount: () => 0 });
      if (verifyScopeEmpty) adapter.verifyScopeEmpty = vi.fn(verifyScopeEmpty);
      return adapter;
    };

    it("B's unproven empty fetch removes nothing, leaves the scope unstamped, and B reads it cold", async () => {
      await stampedSync(
        table,
        adapterReturning(() => [row('a1'), row('a2')]),
        {
          value: 'show-1',
        }
      );
      await settle();
      identity.current = 'user-b';

      await stampedSync(
        table,
        emptyAdapter(async () => false),
        { value: 'show-1' }
      );

      expect(await idsIn('show-1')).toEqual(['a1', 'a2']);
      expect(await stampOf('show-1')).toBeUndefined();
    });

    it('an independently proven empty scope removes the old rows and stamps the account', async () => {
      await stampedSync(
        table,
        adapterReturning(() => [row('a1'), row('a2')]),
        {
          value: 'show-1',
        }
      );
      await settle();
      identity.current = 'user-b';

      await stampedSync(
        table,
        emptyAdapter(async () => true),
        { value: 'show-1' }
      );

      expect(await idsIn('show-1')).toEqual([]);
      expect(await stampOf('show-1')).toBe('user-b');
    });

    it("A's own pre-stamp rows survive an RLS-gap empty fetch, and the scope stays unstamped", async () => {
      await table.set('legacy-1', row('legacy-1'));
      await table.set('legacy-2', row('legacy-2'));
      await table.updateSyncMetadata({ totalRows: 2 }, { scopeValue: 'show-1' });
      await settle();

      await stampedSync(
        table,
        emptyAdapter(async () => false),
        { value: 'show-1' }
      );

      expect(await idsIn('show-1')).toEqual(['legacy-1', 'legacy-2']);
      expect(await stampOf('show-1')).toBeUndefined();
    });

    it('the next sync that returns rows purges the leftovers and stamps', async () => {
      await table.set('legacy-1', row('legacy-1'));
      await table.updateSyncMetadata({ totalRows: 1 }, { scopeValue: 'show-1' });
      await settle();
      await stampedSync(
        table,
        emptyAdapter(async () => false),
        { value: 'show-1' }
      );
      await settle();

      await stampedSync(
        table,
        adapterReturning(() => [row('a1')]),
        { value: 'show-1' }
      );

      expect(await idsIn('show-1')).toEqual(['a1']);
      expect(await stampOf('show-1')).toBe('user-a');
    });
  });

  it('the first sync of an unstamped scope by the same account replaces its rows once', async () => {
    await table.set('legacy', row('legacy'));
    await table.updateSyncMetadata({ totalRows: 1 }, { scopeValue: 'show-1' });
    await settle();

    await stampedSync(
      table,
      adapterReturning(() => [row('a1')]),
      { value: 'show-1' }
    );

    expect(await idsIn('show-1')).toEqual(['a1']);
    expect(await stampOf('show-1')).toBe('user-a');
  });

  it('a second sync by the stamped account does not remove its rows', async () => {
    await stampedSync(
      table,
      adapterReturning(() => [row('a1'), row('a2')]),
      {
        value: 'show-1',
      }
    );

    await stampedSync(
      table,
      adapterReturning(() => []),
      { value: 'show-1' }
    );

    expect(await idsIn('show-1')).toEqual(['a1', 'a2']);
    expect(await stampOf('show-1')).toBe('user-a');
  });

  it('keeps the other account unsent write and does not stamp the scope for B', async () => {
    await stampedSync(
      table,
      adapterReturning(() => [row('a1')]),
      { value: 'show-1' }
    );
    await table.set('draft', row('draft'), true);
    await settle();
    identity.current = 'user-b';

    await stampedSync(
      table,
      adapterReturning(() => [row('b1')]),
      { value: 'show-1' }
    );

    expect(await idsIn('show-1')).toEqual(['b1', 'draft']);
    expect(await stampOf('show-1')).toBeUndefined();
  });

  it('a partial fetch by a new account removes nothing and leaves the scope unstamped', async () => {
    await stampedSync(
      table,
      adapterReturning(() => [row('a1')]),
      { value: 'show-1' }
    );
    await settle();
    identity.current = 'user-b';

    await stampedSync(
      table,
      adapterReturning(() => [row('b1')], { expectedCount: () => 5 }),
      { value: 'show-1' }
    );

    expect(await idsIn('show-1')).toEqual(['a1', 'b1']);
    expect(await stampOf('show-1')).toBeUndefined();
  });

  it('a sync that does not opt in writes no stamp and removes nothing', async () => {
    await syncReplicatedTable(
      table,
      adapterReturning(() => [row('a1')]),
      { value: 'show-1' }
    );
    await settle();
    identity.current = 'user-b';
    await syncReplicatedTable(
      table,
      adapterReturning(() => [row('b1')]),
      { value: 'show-1' }
    );

    expect(await stampOf('show-1')).toBeUndefined();
    expect(await idsIn('show-1')).toEqual(['a1', 'b1']);
  });

  it('an unscoped sync stamps the table, the next account replaces the rows, clearCache clears it', async () => {
    const unscoped = (rows: () => RemoteRow[]) => {
      const adapter = adapterReturning(rows);
      delete adapter.filterLocalRows;
      return adapter;
    };
    await stampedSync(
      table,
      unscoped(() => [row('a1'), row('a2')]),
      {}
    );
    expect((await table.getSyncMetadata())?.syncedByAuthUserId).toBe('user-a');

    await settle();
    identity.current = 'user-b';
    await stampedSync(
      table,
      unscoped(() => [row('b1')]),
      {}
    );
    expect((await table.getAllOrThrow()).map(r => r.id)).toEqual(['b1']);
    expect((await table.getSyncMetadata())?.syncedByAuthUserId).toBe('user-b');

    await table.clearCache();
    expect((await table.getSyncMetadata())?.syncedByAuthUserId).toBeUndefined();
  });
});
