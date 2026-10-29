import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedTable } from './core/ReplicatedTable';
import { MutationManager } from './MutationManager';
import { replaceScope } from './replaceScope';
import { syncReplicatedTable, type SyncReplicatedTableAdapter } from './syncReplicatedTable';
import { parseUpdatedAtMs } from './parseUpdatedAt';
import { configureRemoteCountCadence } from './remoteCountCadence';
import type { SyncResult } from './types';

/**
 * MYK9-1476: replaceScope is a forced full fetch that replaces a scope's clean
 * rows only after the download succeeded, and believes a COMPLETE zero-row
 * answer because the caller states access changed (MYK9-880 still holds for an
 * ordinary sync).
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
    throw new Error('not used');
  }
  protected resolveConflict(_local: LocalRow, remote: LocalRow): LocalRow {
    return remote;
  }
}

const who = { current: 'user-a' as string | null };
const row = (id: string, name = id): LocalRow => ({ id, showId: 'show-1', name });
const scope = { value: 'show-1' };

function adapterFor(
  fetch: () => Promise<LocalRow[]>,
  count: () => number | undefined
): SyncReplicatedTableAdapter<LocalRow, LocalRow> {
  return {
    fetchRemoteRows: vi.fn(fetch),
    getRemoteRowCount: vi.fn(async () => count()),
    getRemoteId: r => r.id,
    getRemoteUpdatedAt: r => parseUpdatedAtMs((r as { updated_at?: number }).updated_at),
    toLocalRow: r => r,
    filterLocalRows: (rows, s) => rows.filter(r => r.showId === s.value),
    cleanupStaleRowsOnFullSync: true,
    // A user who just lost access can never pass the manager-only proof.
    verifyScopeEmpty: vi.fn(async () => false),
  };
}

describe('replaceScope (MYK9-1476)', () => {
  let table: OwnedTable;

  beforeEach(async () => {
    configureRemoteCountCadence({ everyPass: true });
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
    who.current = 'user-a';
    table = new OwnedTable(`replace_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    table.setMutationManager({
      resolveCurrentUserId: async () => who.current,
      getPendingMutationsForRow: async () => [],
      getFailedMutations: async () => [],
      rowRefetchers: { register: () => () => {} },
    } as unknown as MutationManager);
    // A warm, clean replica for account A.
    await syncReplicatedTable(
      table,
      adapterFor(
        async () => [row('r1'), row('r2')],
        () => 2
      ),
      scope
    );
    // The cleanup cutoff is strict (rows synced BEFORE the fetch began).
    await new Promise(resolve => setTimeout(resolve, 5));
  });

  afterEach(async () => {
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
  });

  const idsOf = async (owner: string) => {
    who.current = owner;
    return (await table.getAllOrThrow()).map(r => r.id).sort();
  };

  it('an ordinary zero-row full fetch keeps the warm replica (MYK9-880 unchanged)', async () => {
    const adapter = adapterFor(
      async () => [],
      () => 0
    );

    await syncReplicatedTable(table, adapter, scope, { forceFullSync: true });

    expect(adapter.verifyScopeEmpty).toHaveBeenCalled();
    expect(await idsOf('user-a')).toEqual(['r1', 'r2']);
  });

  it('a complete zero-row fetch removes clean rows, keeps a dirty row and other accounts rows', async () => {
    await table.set('dirty', row('dirty'), true);
    who.current = 'user-b';
    await syncReplicatedTable(
      table,
      adapterFor(
        async () => [row('b1')],
        () => 1
      ),
      { value: 'show-2' }
    );
    who.current = 'user-a';
    const adapter = adapterFor(
      async () => [],
      () => 0
    );

    const result = await replaceScope(table, adapter, scope);

    expect(result.success).toBe(true);
    expect(result.operation).toBe('full-sync');
    expect(adapter.verifyScopeEmpty).not.toHaveBeenCalled();
    expect(await idsOf('user-a')).toEqual(['dirty']);
    expect(await idsOf('user-b')).toEqual(['b1']);
  });

  it('lands newly returned rows and removes the ones no longer returned', async () => {
    const result = await replaceScope(
      table,
      adapterFor(
        async () => [row('r1', 'changed'), row('r3')],
        () => 2
      ),
      scope
    );

    expect(result.success).toBe(true);
    expect(await idsOf('user-a')).toEqual(['r1', 'r3']);
    expect((await table.get('r1'))?.name).toBe('changed');
  });

  it('an incomplete fetch (the count says more than was covered) removes nothing', async () => {
    const result = await replaceScope(
      table,
      adapterFor(
        async () => [],
        () => 3
      ),
      scope
    );

    expect(result.success).toBe(true);
    expect(await idsOf('user-a')).toEqual(['r1', 'r2']);
  });

  it('a failed fetch removes nothing and reports failure', async () => {
    const result = await replaceScope(
      table,
      adapterFor(
        async () => {
          throw new Error('offline');
        },
        () => 0
      ),
      scope
    );

    expect(result.success).toBe(false);
    expect(await idsOf('user-a')).toEqual(['r1', 'r2']);
  });
});
