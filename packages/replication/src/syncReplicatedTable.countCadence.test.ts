import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedTable } from './core/ReplicatedTable';
import { syncReplicatedTable, type SyncReplicatedTableAdapter } from './syncReplicatedTable';
import { parseUpdatedAtMs } from './parseUpdatedAt';
import {
  DEFAULT_REMOTE_COUNT_INTERVAL_MS,
  configureRemoteCountCadence,
  markRealtimeReconnected,
  resetRemoteCountCadenceForTests,
} from './remoteCountCadence';
import type { MutationManager } from './MutationManager';
import type { SyncOptions, SyncResult } from './types';

interface LocalRow {
  id: string;
  name: string;
  _localOnly?: boolean;
}
interface RemoteRow {
  id: string;
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

function adapterFor(state: { rows: RemoteRow[]; count: number }, pageSize?: number) {
  const adapter: SyncReplicatedTableAdapter<RemoteRow, LocalRow> = {
    fetchRemoteRows: vi.fn(async () => state.rows),
    getRemoteRowCount: vi.fn(async () => state.count),
    getRemoteId: r => r.id,
    getRemoteUpdatedAt: r => parseUpdatedAtMs(r.updated_at),
    toLocalRow: r => ({ id: r.id, name: r.name }),
    cleanupStaleRowsOnFullSync: true,
    ...(pageSize !== undefined ? { remotePageSize: pageSize } : {}),
  };
  return adapter;
}

describe('syncReplicatedTable remote count cadence (MYK9-1301)', () => {
  let table: TestTable;
  let nowOffset = 0;
  const realNow = Date.now.bind(Date);

  beforeEach(async () => {
    resetRemoteCountCadenceForTests();
    nowOffset = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + nowOffset);
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
    table = new TestTable(`cadence_${realNow()}_${Math.random().toString(36).slice(2)}`);
    await table.set('1', { id: '1', name: 'Kept' });
    await table.set('2', { id: '2', name: 'Deleted on server' });
    await table.updateSyncMetadata({ lastIncrementalSyncAt: 1000, lastFullSyncAt: realNow() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const whole = { rows: [] as RemoteRow[], count: 2 };

  it('skips the count inside the interval, then a server hard delete is caught within it', async () => {
    const state = { ...whole };
    const adapter = adapterFor(state);
    await syncReplicatedTable(table, adapter); // first pass counts
    expect(adapter.getRemoteRowCount).toHaveBeenCalledTimes(1);

    state.count = 1;
    state.rows = [{ id: '1', name: 'Kept', updated_at: 2000 }];
    nowOffset += 60_000;
    const quiet = await syncReplicatedTable(table, adapter);
    expect(adapter.getRemoteRowCount).toHaveBeenCalledTimes(1);
    expect(quiet.operation).toBe('incremental-sync');
    expect(await table.get('2')).not.toBeNull();

    nowOffset += DEFAULT_REMOTE_COUNT_INTERVAL_MS;
    const healed = await syncReplicatedTable(table, adapter);
    expect(adapter.getRemoteRowCount).toHaveBeenCalledTimes(2);
    expect(healed.operation).toBe('full-sync');
    expect(await table.get('1')).toMatchObject({ name: 'Kept' });
    expect(await table.get('2')).toBeNull();
  });

  it('a pending local create never makes the count read short (MYK9-752)', async () => {
    await table.set('local-1', { id: 'local-1', name: 'Pending', _localOnly: true });
    const state = { rows: [] as RemoteRow[], count: 2 };
    const adapter = adapterFor(state);
    const first = await syncReplicatedTable(table, adapter);
    nowOffset += 60_000;
    const second = await syncReplicatedTable(table, adapter);
    expect(first.operation).toBe('incremental-sync');
    expect(second.operation).toBe('incremental-sync');
    expect(adapter.getRemoteRowCount).toHaveBeenCalledTimes(1);
  });

  it('everyPass restores a count on every pass', async () => {
    configureRemoteCountCadence({ everyPass: true });
    const adapter = adapterFor({ ...whole });
    await syncReplicatedTable(table, adapter);
    await syncReplicatedTable(table, adapter);
    await syncReplicatedTable(table, adapter);
    expect(adapter.getRemoteRowCount).toHaveBeenCalledTimes(3);
  });

  it('counts on the first pass after a realtime reconnect', async () => {
    const adapter = adapterFor({ ...whole });
    await syncReplicatedTable(table, adapter);
    await syncReplicatedTable(table, adapter);
    expect(adapter.getRemoteRowCount).toHaveBeenCalledTimes(1);
    markRealtimeReconnected();
    await syncReplicatedTable(table, adapter);
    expect(adapter.getRemoteRowCount).toHaveBeenCalledTimes(2);
    await syncReplicatedTable(table, adapter);
    expect(adapter.getRemoteRowCount).toHaveBeenCalledTimes(2);
  });

  it('counts on the pass after a delta that filled a page', async () => {
    const state = { rows: [{ id: '1', name: 'Kept', updated_at: 2000 }], count: 2 };
    const adapter = adapterFor(state, 1);
    await syncReplicatedTable(table, adapter);
    await syncReplicatedTable(table, adapter);
    expect(adapter.getRemoteRowCount).toHaveBeenCalledTimes(2);
    state.rows = [];
    await syncReplicatedTable(table, adapter); // counted (previous was full), delta empty
    await syncReplicatedTable(table, adapter); // previous delta empty: skipped
    expect(adapter.getRemoteRowCount).toHaveBeenCalledTimes(3);
  });

  it('an acknowledged delete refreshes expectedRemoteRows on the next pass, not after the interval', async () => {
    const state = { ...whole };
    const adapter = adapterFor(state);
    await syncReplicatedTable(table, adapter); // counts 2
    await expect(table.getSyncMetadata()).resolves.toMatchObject({ expectedRemoteRows: 2 });

    // The device deleted row 2 and its DELETE was acknowledged: no pending delete remains.
    await table.delete('2');
    state.count = 1;
    nowOffset += 60_000;
    await syncReplicatedTable(table, adapter);

    expect(adapter.getRemoteRowCount).toHaveBeenCalledTimes(2);
    await expect(table.getSyncMetadata()).resolves.toMatchObject({ expectedRemoteRows: 1 });
  });

  it('a server-side addition (more local rows than the last count) does not force a count', async () => {
    const adapter = adapterFor({ ...whole });
    await syncReplicatedTable(table, adapter);
    await table.set('3', { id: '3', name: 'Added' });
    nowOffset += 60_000;
    await syncReplicatedTable(table, adapter);
    expect(adapter.getRemoteRowCount).toHaveBeenCalledTimes(1);
  });

  it('the 24h self-heal full sync counts (one HEAD) so its stale cleanup runs', async () => {
    const state = { ...whole };
    const adapter = adapterFor(state);
    await syncReplicatedTable(table, adapter);
    state.count = 1;
    state.rows = [{ id: '1', name: 'Kept', updated_at: 2000 }];
    nowOffset += 25 * 60 * 60 * 1000;
    configureRemoteCountCadence({ intervalMs: 48 * 60 * 60 * 1000 });
    const result = await syncReplicatedTable(table, adapter);
    expect(adapter.getRemoteRowCount).toHaveBeenCalledTimes(2);
    expect(result.operation).toBe('full-sync');
    expect(await table.get('2')).toBeNull();
  });

  it('a failed count (undefined) does not burn the window: the next pass counts again', async () => {
    const adapter = adapterFor({ ...whole });
    vi.mocked(adapter.getRemoteRowCount!).mockResolvedValueOnce(undefined);
    await syncReplicatedTable(table, adapter);
    await syncReplicatedTable(table, adapter);
    expect(adapter.getRemoteRowCount).toHaveBeenCalledTimes(2);
    await syncReplicatedTable(table, adapter);
    expect(adapter.getRemoteRowCount).toHaveBeenCalledTimes(2);
  });
});

class OwnedTable extends TestTable {
  override usesAccountOwnedRows(): boolean {
    return true;
  }
}

describe('uncounted pass and the account stamp (MYK9-1301)', () => {
  beforeEach(async () => {
    resetRemoteCountCadenceForTests();
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
  });

  it('a counted pass stamps the scope whole; an uncounted incremental pass does not', async () => {
    const table = new OwnedTable(`owned_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    table.setMutationManager({
      resolveCurrentUserId: async () => 'user-a',
      getPendingMutationsForRow: async () => [],
      getFailedMutations: async () => [],
      rowRefetchers: { register: () => () => {} },
    } as unknown as MutationManager);
    await table.set('1', { id: '1', name: 'Kept' });
    await table.updateSyncMetadata({ lastIncrementalSyncAt: 1000, lastFullSyncAt: Date.now() });
    const adapter = adapterFor({ rows: [{ id: '1', name: 'Kept', updated_at: 2000 }], count: 1 });
    const update = vi.spyOn(table, 'updateSyncMetadata');
    const directives = () =>
      update.mock.calls
        .map(call => (call[1] as { scopeSyncedBy?: { whole: boolean } } | undefined)?.scopeSyncedBy)
        .filter(directive => directive !== undefined);

    await syncReplicatedTable(table, adapter);
    await syncReplicatedTable(table, adapter);

    expect(adapter.getRemoteRowCount).toHaveBeenCalledTimes(1);
    expect(directives().map(d => d?.whole)).toEqual([true, false]);
  });
});
