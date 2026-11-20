import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedTable } from './core/ReplicatedTable';
import type { MutationManager } from './MutationManager';
import { syncReplicatedTable, type SyncReplicatedTableAdapter } from './syncReplicatedTable';
import { configureShortReplicaObserver } from './shortReplicaCheck';
import { parseUpdatedAtMs } from './parseUpdatedAt';
import type { SyncResult } from './types';

/**
 * MYK9-2254: a full download that leaves the device short of the server's count
 * is a failure, never a whole scope, and sends one alert.
 */

interface LocalRow {
  id: string;
  showId: string;
  name: string;
  _localOnly?: boolean;
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

const who = { current: 'user-a' as string };
const row = (id: string): RemoteRow => ({ id, showId: 'show-1', name: id });
const scope = { value: 'show-1' };
const settle = () => new Promise(resolve => setTimeout(resolve, 5));

function adapter(
  remote: RemoteRow[],
  counts: number[],
  extra: Partial<SyncReplicatedTableAdapter<RemoteRow, LocalRow>> = {}
): SyncReplicatedTableAdapter<RemoteRow, LocalRow> {
  const queue = [...counts];
  return {
    fetchRemoteRows: vi.fn(async () => remote),
    // Each call takes the next count; the last one repeats.
    getRemoteRowCount: vi.fn(async () => (queue.length > 1 ? queue.shift()! : queue[0]!)),
    getRemoteId: r => r.id,
    getRemoteUpdatedAt: r => parseUpdatedAtMs(r.updated_at),
    toLocalRow: r => ({ id: r.id, showId: r.showId, name: r.name }),
    filterLocalRows: (rows, s) => rows.filter(r => r.showId === s.value),
    ...extra,
  };
}

describe('a download short of the server count (MYK9-2254)', () => {
  let table: OwnedTable;
  const onShort = vi.fn();
  const onWhole = vi.fn();

  beforeEach(async () => {
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
    who.current = 'user-a';
    onShort.mockReset();
    onWhole.mockReset();
    configureShortReplicaObserver({ onShort, onWhole });
    table = new OwnedTable(`rows_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    table.setMutationManager({
      resolveCurrentUserId: async () => who.current,
      getPendingMutationsForRow: async () => [],
      getFailedMutations: async () => [],
      rowRefetchers: { register: () => () => {} },
    } as unknown as MutationManager);
  });

  afterEach(async () => {
    configureShortReplicaObserver(null);
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
  });

  it('fails, leaves the scope not whole, and sends one alert', async () => {
    const a = adapter([row('r1'), row('r2')], [3]);

    const result = await syncReplicatedTable(table, a, scope);

    expect(result.success).toBe(false);
    expect(result.operation).toBe('full-sync');
    expect(result.shortReplica).toEqual({
      table: table.getTableName(),
      scope: 'show-1',
      serverCount: 3,
      deviceCount: 2,
    });
    expect(onShort).toHaveBeenCalledTimes(1);
    expect(onShort).toHaveBeenCalledWith(result.shortReplica);
    const meta = await table.getSyncMetadata('show-1');
    expect(meta?.syncStatus).toBe('error');
    expect(meta?.expectedRemoteRows).toBe(3);
    expect(meta?.lastFullSyncAt ?? 0).toBe(0);
    expect(meta?.syncedByAuthUserId).not.toBe('user-a');
  });

  it('confirms with a second count before failing', async () => {
    const a = adapter([row('r1'), row('r2')], [3]);

    await syncReplicatedTable(table, a, scope);

    expect(a.getRemoteRowCount).toHaveBeenCalledTimes(2);
  });

  it('raises no alarm for a row deleted on the server between the count and the fetch', async () => {
    // The first count still included the row; the confirming count does not.
    const a = adapter([row('r1'), row('r2')], [3, 2]);

    const result = await syncReplicatedTable(table, a, scope);

    expect(result.success).toBe(true);
    expect(result.shortReplica).toBeUndefined();
    expect(onShort).not.toHaveBeenCalled();
  });

  it('raises no alarm when the confirming count cannot be taken', async () => {
    const a = adapter([row('r1'), row('r2')], [3]);
    vi.mocked(a.getRemoteRowCount!).mockResolvedValueOnce(3).mockResolvedValueOnce(undefined);

    const result = await syncReplicatedTable(table, a, scope);

    expect(result.shortReplica).toBeUndefined();
    expect(onShort).not.toHaveBeenCalled();
  });

  it('raises no alarm for a pending delete', async () => {
    await table.set('r1', { id: 'r1', showId: 'show-1', name: 'r1' });
    // The server still counts r2 until the queued DELETE uploads.
    const a = adapter([row('r1')], [2], { getPendingDeleteIds: async () => new Set(['r2']) });

    const result = await syncReplicatedTable(table, a, scope, { forceFullSync: true });

    expect(result.success).toBe(true);
    expect(onShort).not.toHaveBeenCalled();
    expect(onWhole).toHaveBeenCalledWith(table.getTableName(), 'show-1');
  });

  it('raises no alarm for a pending local create', async () => {
    await table.set('local-1', { id: 'local-1', showId: 'show-1', name: 'new', _localOnly: true });
    const a = adapter([row('r1'), row('r2')], [2]);

    const result = await syncReplicatedTable(table, a, scope, { forceFullSync: true });

    expect(result.success).toBe(true);
    expect(onShort).not.toHaveBeenCalled();
  });

  it('raises no alarm for a row skipped because the adapter holds it back', async () => {
    const a = adapter([row('r1'), row('r2')], [2], {
      shouldSkipRemoteRow: remote => remote.id === 'r2',
    });

    const result = await syncReplicatedTable(table, a, scope);

    expect(result.success).toBe(true);
    expect(onShort).not.toHaveBeenCalled();
  });

  it('raises no alarm for a row skipped because another account has unsent work on it', async () => {
    await syncReplicatedTable(table, adapter([row('r1')], [1]), scope);
    await table.set('r1', { id: 'r1', showId: 'show-1', name: 'A unsent edit' }, true);
    await settle();
    who.current = 'user-b';

    const result = await syncReplicatedTable(table, adapter([row('r1'), row('b1')], [2]), scope);

    expect(result.success).toBe(true);
    expect(onShort).not.toHaveBeenCalled();
  });

  it('does not alert on an incremental pass', async () => {
    await syncReplicatedTable(table, adapter([row('r1')], [1]), scope);
    onWhole.mockReset();
    const a = adapter([], [1]);

    const result = await syncReplicatedTable(table, a, scope);

    expect(result.operation).toBe('incremental-sync');
    expect(onShort).not.toHaveBeenCalled();
    expect(onWhole).not.toHaveBeenCalled();
  });

  it('keeps downloading in full on the next pass, and reports whole once it is', async () => {
    const short = await syncReplicatedTable(table, adapter([row('r1')], [2]), scope);
    expect(short.success).toBe(false);

    const whole = await syncReplicatedTable(table, adapter([row('r1'), row('r2')], [2]), scope);

    expect(whole.success).toBe(true);
    expect(whole.operation).toBe('full-sync');
    expect(onWhole).toHaveBeenCalledWith(table.getTableName(), 'show-1');
  });
});
