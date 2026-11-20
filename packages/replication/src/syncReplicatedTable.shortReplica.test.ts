import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedTable } from './core/ReplicatedTable';
import { MutationManager } from './MutationManager';
import { syncReplicatedTable, type SyncReplicatedTableAdapter } from './syncReplicatedTable';
import { parseUpdatedAtMs } from './parseUpdatedAt';
import { resetRemoteCountCadenceForTests } from './remoteCountCadence';
import { countAccountedRows } from './shortReplicaCheck';
import {
  isShortOnlyFailure,
  setShortReplicaReporter,
  type ShortReplicaObservation,
} from './shortReplicaReporter';
import type { SyncResult } from './types';

/**
 * MYK9-2254: a full download that leaves the device short of the server's count
 * is a failure, confirmed by a second count, and never marks the scope whole.
 */

interface LocalRow {
  id: string;
  showId: string;
  name: string;
  _localOnly?: boolean;
}
interface RemoteRow {
  id: string;
  showId: string;
  name: string;
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
const row = (id: string): RemoteRow => ({ id, showId: 'show-1', name: id });
const scope = { value: 'show-1' };

function adapterFor(
  remote: RemoteRow[],
  counts: number[],
  extra: Partial<SyncReplicatedTableAdapter<RemoteRow, LocalRow>> = {}
) {
  let call = 0;
  const adapter: SyncReplicatedTableAdapter<RemoteRow, LocalRow> = {
    fetchRemoteRows: vi.fn(async () => remote),
    getRemoteRowCount: vi.fn(async () => counts[Math.min(call++, counts.length - 1)]),
    getRemoteId: r => r.id,
    getRemoteUpdatedAt: r => parseUpdatedAtMs(r.updated_at),
    toLocalRow: r => ({ id: r.id, showId: r.showId, name: r.name }),
    filterLocalRows: (rows, s) => rows.filter(r => r.showId === s.value),
    cleanupStaleRowsOnFullSync: true,
    ...extra,
  };
  return adapter;
}

describe('a download short of the server count (MYK9-2254)', () => {
  let table: OwnedTable;

  const mount = (instance: OwnedTable) => {
    instance.setMutationManager({
      resolveCurrentUserId: async () => who.current,
      getPendingMutationsForRow: async () => [],
      getFailedMutations: async () => [],
      rowRefetchers: { register: () => () => {} },
    } as unknown as MutationManager);
    return instance;
  };
  const name = () => `short_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  beforeEach(async () => {
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
    resetRemoteCountCadenceForTests();
    setShortReplicaReporter(null);
    who.current = 'user-a';
    table = mount(new PlainTable(name()));
  });

  afterEach(async () => {
    setShortReplicaReporter(null);
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
  });

  it('fails, reports the counts, and does not call the scope saved when the device stays short', async () => {
    const adapter = adapterFor([row('1')], [2]);

    const result = await syncReplicatedTable(table, adapter, scope);

    expect(result.success).toBe(false);
    expect(result.shortReplica).toEqual({
      tableName: table.getTableName(),
      scope: 'show-1',
      serverCount: 2,
      deviceCount: 1,
    });
    expect(result.error).toBe('myK9Show holds 2 rows but this device saved 1.');
    expect(adapter.getRemoteRowCount).toHaveBeenCalledTimes(2);
    const meta = await table.getSyncMetadata('show-1');
    expect(meta?.syncStatus).toBe('error');
    expect(meta?.expectedRemoteRows).toBe(2);
    expect(meta?.lastFullSyncAt ?? 0).toBe(0);
  });

  it('leaves an account-owned scope unstamped when the device stays short', async () => {
    const owned = mount(new OwnedTable(name()));

    const result = await syncReplicatedTable(owned, adapterFor([row('1')], [2]), scope);

    expect(result.success).toBe(false);
    expect((await owned.getSyncMetadata('show-1'))?.syncedByAuthUserId).toBeUndefined();
  });

  it('un-stamps a scope this account had whole when a later full download is short', async () => {
    const owned = mount(new OwnedTable(name()));
    await syncReplicatedTable(owned, adapterFor([row('1'), row('2')], [2]), scope);
    expect((await owned.getSyncMetadata('show-1'))?.syncedByAuthUserId).toBe('user-a');

    const result = await syncReplicatedTable(owned, adapterFor([row('1')], [3]), scope, {
      forceFullSync: true,
    });

    expect(result.shortReplica).toBeDefined();
    expect((await owned.getSyncMetadata('show-1'))?.syncedByAuthUserId).toBeUndefined();
  });

  it("does not clear another account's newer stamp on a short download", async () => {
    const owned = mount(new OwnedTable(name()));
    await syncReplicatedTable(owned, adapterFor([row('1'), row('2')], [2]), scope);
    who.current = 'user-b';
    await syncReplicatedTable(owned, adapterFor([row('1'), row('2')], [2]), scope);
    expect((await owned.getSyncMetadata('show-1'))?.syncedByAuthUserId).toBe('user-b');
    who.current = 'user-a';

    // A's short download wrote none of the rows B holds, so B's stamp is not A's to clear.
    const result = await syncReplicatedTable(owned, adapterFor([], [3]), scope, {
      forceFullSync: true,
    });

    expect(result.shortReplica).toBeDefined();
    expect((await owned.getSyncMetadata('show-1'))?.syncedByAuthUserId).toBe('user-b');
  });

  it('does not let a skipped tombstone stand in for a missing active row', async () => {
    // The server counts 3 rows; the tombstone is skipped and the count excludes it.
    const adapter = adapterFor([row('1'), row('2')], [3], {
      shouldSkipRemoteRow: remote => remote.id === '2',
      countsTowardRemoteCoverage: remote => remote.id !== '2',
    });

    const result = await syncReplicatedTable(table, adapter, scope);

    expect(result.shortReplica).toMatchObject({ serverCount: 3, deviceCount: 1 });
  });

  it('hands every counted full download to the one registered reporter', async () => {
    const seen: ShortReplicaObservation[] = [];
    setShortReplicaReporter(o => seen.push(o));

    await syncReplicatedTable(table, adapterFor([row('1')], [2]), scope);
    await syncReplicatedTable(table, adapterFor([row('1'), row('2')], [2]), scope, {
      forceFullSync: true,
    });

    expect(seen.map(o => o.short?.deviceCount ?? null)).toEqual([1, null]);
    expect(seen.every(o => o.scope === 'show-1' && o.tableName === table.getTableName())).toBe(
      true
    );
  });

  it('re-arms on a counted incremental pass that confirms coverage, so a later short reports again', async () => {
    const seen: ShortReplicaObservation[] = [];
    setShortReplicaReporter(o => seen.push(o));

    await syncReplicatedTable(table, adapterFor([row('1')], [2]), scope);
    await syncReplicatedTable(table, adapterFor([], [1]), scope);
    await syncReplicatedTable(table, adapterFor([row('1')], [3]), scope, { forceFullSync: true });

    expect(seen.map(o => o.short?.serverCount ?? null)).toEqual([2, null, 3]);
  });

  it('survives a reporter that throws', async () => {
    setShortReplicaReporter(() => {
      throw new Error('boom');
    });

    const result = await syncReplicatedTable(table, adapterFor([row('1')], [2]), scope);

    expect(result.shortReplica).toBeDefined();
  });

  it('raises no alarm for rows the device rightly does not hold', async () => {
    await table.set('new', { id: 'new', showId: 'show-1', name: 'new', _localOnly: true });
    // Server holds 1, 2 (delete queued here), 3 (skipped on purpose) and 4.
    const adapter = adapterFor([row('1'), row('3'), row('4')], [4], {
      getPendingDeleteIds: async () => new Set(['2']),
      shouldSkipRemoteRow: remote => remote.id === '3',
    });

    const result = await syncReplicatedTable(table, adapter, scope);

    expect(result.success).toBe(true);
    expect(result.shortReplica).toBeUndefined();
    expect(adapter.getRemoteRowCount).toHaveBeenCalledTimes(1);
  });

  it("raises no alarm for a row held back by another account's unsent work", async () => {
    const owned = mount(new OwnedTable(name()));
    await syncReplicatedTable(owned, adapterFor([row('r1')], [1]), scope);
    await owned.set('r1', { id: 'r1', showId: 'show-1', name: 'A unsent edit' }, true);
    await new Promise(resolve => setTimeout(resolve, 5));
    who.current = 'user-b';

    const result = await syncReplicatedTable(owned, adapterFor([row('r1'), row('b1')], [2]), scope);

    expect(result.success).toBe(true);
    expect(result.shortReplica).toBeUndefined();
  });

  it('raises no alarm for a row deleted on the server between the count and the fetch', async () => {
    // The first count saw 3 rows; the second, taken after the fetch, sees 2.
    const adapter = adapterFor([row('1'), row('2')], [3, 2]);

    const result = await syncReplicatedTable(table, adapter, scope);

    expect(result.success).toBe(true);
    expect(result.shortReplica).toBeUndefined();
    expect(adapter.getRemoteRowCount).toHaveBeenCalledTimes(2);
    expect((await table.getSyncMetadata('show-1'))?.expectedRemoteRows).toBe(2);
  });

  it('does not alarm when the second count cannot be taken', async () => {
    const adapter = adapterFor([row('1')], [2]);
    vi.mocked(adapter.getRemoteRowCount!)
      .mockResolvedValueOnce(2)
      .mockRejectedValueOnce(new Error('offline'));

    const result = await syncReplicatedTable(table, adapter, scope);

    expect(result.shortReplica).toBeUndefined();
  });

  it('takes no second count when the device holds every row', async () => {
    const adapter = adapterFor([row('1'), row('2')], [2]);

    const result = await syncReplicatedTable(table, adapter, scope);

    expect(result.success).toBe(true);
    expect(adapter.getRemoteRowCount).toHaveBeenCalledTimes(1);
  });
});

describe('countAccountedRows (MYK9-2254)', () => {
  it('counts a held-back id once, and not when the row is already on the device', () => {
    const local = [{ id: 'a' }, { id: 'b', _localOnly: true }];
    expect(countAccountedRows(local, undefined, new Set(['c']), new Set(['c']))).toBe(2);
    expect(countAccountedRows(local, undefined, new Set(['a']), new Set(['a']))).toBe(1);
    expect(countAccountedRows(local, new Set(['c']), new Set(['c']), new Set(['c']))).toBe(2);
  });

  it('ignores a held-back id the server count does not include', () => {
    expect(countAccountedRows([{ id: 'a' }], undefined, new Set(['t']), new Set(['a']))).toBe(1);
  });
});

describe('isShortOnlyFailure (MYK9-2254)', () => {
  it('is true only for a failed result that carries a short report', () => {
    const short = { tableName: 't', scope: undefined, serverCount: 2, deviceCount: 1 };
    expect(isShortOnlyFailure({ success: false, shortReplica: short })).toBe(true);
    expect(isShortOnlyFailure({ success: false })).toBe(false);
    expect(isShortOnlyFailure({ success: true })).toBe(false);
    expect(isShortOnlyFailure(undefined)).toBe(false);
  });
});
