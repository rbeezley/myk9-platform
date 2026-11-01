import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedTable } from './core/ReplicatedTable';
import { syncReplicatedTable, type SyncReplicatedTableAdapter } from './syncReplicatedTable';
import { ABORTED_SYNC_MESSAGE } from './abortable';
import { parseUpdatedAtMs } from './parseUpdatedAt';
import type { SyncOptions, SyncResult } from './types';

interface LocalRow {
  id: string;
  name: string;
}
interface RemoteRow {
  id: string;
  name: string;
  updated_at?: number;
}

class TestTable extends ReplicatedTable<LocalRow> {
  async sync(_scope: string, _options?: Partial<SyncOptions>): Promise<SyncResult> {
    throw new Error('not used');
  }
  protected resolveConflict(_local: LocalRow, remote: LocalRow): LocalRow {
    return remote;
  }
}

function adapterFor(
  fetchRemoteRows: SyncReplicatedTableAdapter<RemoteRow, LocalRow>['fetchRemoteRows']
): SyncReplicatedTableAdapter<RemoteRow, LocalRow> {
  return {
    fetchRemoteRows,
    getRemoteRowCount: vi.fn(async () => 0),
    getRemoteId: row => row.id,
    getRemoteUpdatedAt: row => parseUpdatedAtMs(row.updated_at),
    toLocalRow: row => ({ id: row.id, name: row.name }),
    cleanupStaleRowsOnFullSync: true,
  };
}

// MYK9-1624: a cancelled table sync ends at once and changes nothing afterwards.
describe('syncReplicatedTable cancellation (MYK9-1624)', () => {
  let table: TestTable;

  beforeEach(async () => {
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
    table = new TestTable(`rows_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    await table.set('1', { id: '1', name: 'Warm A' });
    await table.updateSyncMetadata({ lastIncrementalSyncAt: 1000, lastFullSyncAt: Date.now() });
    await new Promise(resolve => setTimeout(resolve, 5));
  });

  afterEach(async () => {
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
  });

  it('a hung fetch ends when the signal aborts: cancelled result, table idle, replica untouched', async () => {
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    const adapter = adapterFor(
      ({ signal }) =>
        new Promise<RemoteRow[]>(() => {
          seen = signal;
        })
    );

    const pending = syncReplicatedTable(table, adapter, {}, { signal: controller.signal });
    await vi.waitFor(() => expect(seen).toBe(controller.signal));
    controller.abort();
    const result = await pending;

    expect(result.success).toBe(false);
    expect(result.error).toBe(ABORTED_SYNC_MESSAGE);
    expect((await table.getSyncMetadata())?.syncStatus).toBe('idle');
    expect(await table.get('1')).toMatchObject({ name: 'Warm A' });
  });

  it('rows a fetch returns after the abort are never written, and stale cleanup never runs', async () => {
    const controller = new AbortController();
    let release!: (rows: RemoteRow[]) => void;
    const adapter = adapterFor(
      () =>
        new Promise<RemoteRow[]>(resolve => {
          release = resolve;
        })
    );
    adapter.afterSuccessfulSync = vi.fn();

    const pending = syncReplicatedTable(
      table,
      adapter,
      {},
      { signal: controller.signal, forceFullSync: true }
    );
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    controller.abort();
    release([{ id: '2', name: 'Late', updated_at: 5000 }]);
    const result = await pending;

    expect(result.success).toBe(false);
    expect(await table.get('2')).toBeNull();
    // A full sync with an empty "server" would otherwise delete row 1 as stale.
    expect(await table.get('1')).toMatchObject({ name: 'Warm A' });
    expect(adapter.afterSuccessfulSync).not.toHaveBeenCalled();
  });

  it('an emptiness proof that answers after the abort deletes nothing', async () => {
    const controller = new AbortController();
    let release!: (proven: boolean) => void;
    // A full fetch of zero rows over a warm replica: only this proof licenses cleanup.
    const adapter = adapterFor(vi.fn(async () => []));
    adapter.verifyScopeEmpty = () =>
      new Promise<boolean>(resolve => {
        release = resolve;
      });

    const pending = syncReplicatedTable(
      table,
      adapter,
      {},
      { signal: controller.signal, forceFullSync: true }
    );
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    controller.abort();
    release(true);
    const result = await pending;

    expect(result.success).toBe(false);
    expect(await table.get('1')).toMatchObject({ name: 'Warm A' });
  });

  it('the same proof, un-cancelled, does clean up (positive control)', async () => {
    const adapter = adapterFor(vi.fn(async () => []));
    adapter.verifyScopeEmpty = async () => true;
    const result = await syncReplicatedTable(table, adapter, {}, { forceFullSync: true });
    expect(result.success).toBe(true);
    expect(await table.get('1')).toBeNull();
  });

  it('an already-aborted signal starts nothing', async () => {
    const controller = new AbortController();
    controller.abort();
    const adapter = adapterFor(vi.fn(async () => []));

    const result = await syncReplicatedTable(table, adapter, {}, { signal: controller.signal });

    expect(result.success).toBe(false);
    expect(adapter.fetchRemoteRows).not.toHaveBeenCalled();
  });

  it('without a signal the sync completes as before', async () => {
    const adapter = adapterFor(vi.fn(async () => [{ id: '3', name: 'New', updated_at: 5000 }]));
    const result = await syncReplicatedTable(table, adapter);
    expect(result.success).toBe(true);
    expect(await table.get('3')).toMatchObject({ name: 'New' });
  });
});
