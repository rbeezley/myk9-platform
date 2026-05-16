import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedTable } from './core/ReplicatedTable';
import { syncReplicatedTable, type SyncReplicatedTableAdapter } from './syncReplicatedTable';
import type { SyncOptions, SyncResult } from './types';

interface LocalEntry {
  id: string;
  name: string;
  status?: string;
  resultStatus?: string;
  finalPlacement?: number | null;
  license_key?: string;
}

interface RemoteEntry {
  id: string | number;
  name: string;
  status?: string;
  result_status?: string;
  final_placement?: number | null;
  license_key?: string;
}

class TestTable extends ReplicatedTable<LocalEntry> {
  async sync(_licenseKey: string, _options?: Partial<SyncOptions>): Promise<SyncResult> {
    return {
      tableName: this.getTableName(),
      success: true,
      operation: 'incremental-sync',
      rowsAffected: 0,
      duration: 0,
    };
  }

  protected resolveConflict(_local: LocalEntry, remote: LocalEntry): LocalEntry {
    return remote;
  }
}

function makeAdapter(remoteRows: RemoteEntry[]): SyncReplicatedTableAdapter<RemoteEntry, LocalEntry> {
  return {
    fetchRemoteRows: vi.fn(async () => remoteRows),
    getRemoteId: remote => String(remote.id),
    toLocalRow: remote => ({
      id: String(remote.id),
      name: remote.name,
      status: remote.status,
      resultStatus: remote.result_status,
      finalPlacement: remote.final_placement,
      license_key: remote.license_key,
    }),
  };
}

describe('syncReplicatedTable', () => {
  let table: TestTable;

  beforeEach(async () => {
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
    table = new TestTable(`entries_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  });

  afterEach(async () => {
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
  });

  it('caches clean remote rows and updates sync metadata', async () => {
    const adapter = makeAdapter([{ id: 1, name: 'Rex', status: 'checked-in' }]);

    const result = await syncReplicatedTable(table, adapter);

    expect(result.success).toBe(true);
    expect(result.operation).toBe('full-sync');
    expect(result.rowsAffected).toBe(1);
    expect(await table.get('1')).toMatchObject({ id: '1', name: 'Rex' });
    await expect(table.getSyncMetadata()).resolves.toMatchObject({
      syncStatus: 'idle',
      totalRows: 1,
    });
  });

  it('preserves dirty local rows by default', async () => {
    await table.set('1', { id: '1', name: 'Local Rex', status: 'in-ring' }, true);
    const adapter = makeAdapter([{ id: 1, name: 'Server Rex', status: 'checked-in' }]);

    const result = await syncReplicatedTable(table, adapter);

    expect(result.success).toBe(true);
    expect(result.rowsAffected).toBe(0);
    expect(await table.get('1')).toMatchObject({
      name: 'Local Rex',
      status: 'in-ring',
    });
    await expect(table.getReplicatedRow('1')).resolves.toMatchObject({
      isDirty: true,
      syncStatus: 'pending',
    });
  });

  it('lets adapters merge server-authoritative fields into dirty rows', async () => {
    await table.set(
      '1',
      { id: '1', name: 'Local Rex', status: 'completed', resultStatus: 'pending' },
      true
    );
    const adapter = makeAdapter([
      { id: 1, name: 'Server Rex', status: 'completed', result_status: 'qualified', final_placement: 2 },
    ]);
    adapter.mergeDirtyRow = (local, remote) => ({
      ...local,
      resultStatus: remote.resultStatus,
      finalPlacement: remote.finalPlacement,
    });

    const result = await syncReplicatedTable(table, adapter);

    expect(result.rowsAffected).toBe(1);
    expect(result.conflictsResolved).toBe(1);
    expect(await table.get('1')).toMatchObject({
      name: 'Local Rex',
      status: 'completed',
      resultStatus: 'qualified',
      finalPlacement: 2,
    });
    await expect(table.getReplicatedRow('1')).resolves.toMatchObject({ isDirty: true });
  });

  it('removes stale clean rows when cleanup is enabled but keeps dirty rows', async () => {
    await table.set('1', { id: '1', name: 'Still Remote' });
    await table.set('2', { id: '2', name: 'Stale Clean' });
    await table.set('3', { id: '3', name: 'Stale Dirty' }, true);
    const adapter = makeAdapter([{ id: 1, name: 'Still Remote' }]);
    adapter.shouldCleanupStaleRows = true;

    const result = await syncReplicatedTable(table, adapter);

    expect(result.rowsAffected).toBe(2);
    expect(await table.get('1')).toMatchObject({ name: 'Still Remote' });
    expect(await table.get('2')).toBeNull();
    expect(await table.get('3')).toMatchObject({ name: 'Stale Dirty' });
  });

  it('uploads pending mutations before fetching remote rows by default', async () => {
    const uploadPendingMutations = vi.fn(async () => undefined);
    const adapter = makeAdapter([]);

    await syncReplicatedTable(table, adapter, {}, { uploadPendingMutations });

    expect(uploadPendingMutations).toHaveBeenCalledTimes(1);
    expect(adapter.fetchRemoteRows).toHaveBeenCalledTimes(1);
    expect(uploadPendingMutations.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(adapter.fetchRemoteRows).mock.invocationCallOrder[0]!
    );
  });

  it('applies an incremental buffer to the remote fetch timestamp', async () => {
    await table.set('1', { id: '1', name: 'Rex' });
    await table.updateSyncMetadata({ lastIncrementalSyncAt: 10_000 });
    const adapter = makeAdapter([]);

    await syncReplicatedTable(table, adapter, {}, { incrementalBufferMs: 5_000 });

    expect(vi.mocked(adapter.fetchRemoteRows).mock.calls[0]![0].since).toBe(5_000);
  });

  it('lets adapters define local rows for a domain-specific scope', async () => {
    await table.set('1', { id: '1', name: 'Rex', license_key: 'show-1' });
    await table.set('2', { id: '2', name: 'Max', license_key: 'show-2' });
    await table.updateSyncMetadata({ lastIncrementalSyncAt: 10_000 });
    const adapter = makeAdapter([]);
    adapter.filterLocalRows = (rows, scope) =>
      rows.filter(row => row.license_key === scope.value);

    const result = await syncReplicatedTable(table, adapter, { value: 'show-1' });

    expect(result.operation).toBe('incremental-sync');
    expect(vi.mocked(adapter.fetchRemoteRows).mock.calls[0]![0].localRows).toEqual([
      expect.objectContaining({ id: '1' }),
    ]);
  });

  it('runs adapter success cleanup with scoped local rows and server ids', async () => {
    await table.set('1', { id: '1', name: 'Rex', license_key: 'show-1' });
    await table.set('2', { id: '2', name: 'Max', license_key: 'show-2' });
    const adapter = makeAdapter([{ id: 1, name: 'Server Rex', license_key: 'show-1' }]);
    adapter.filterLocalRows = (rows, scope) =>
      rows.filter(row => row.license_key === scope.value);
    adapter.afterSuccessfulSync = vi.fn();

    const result = await syncReplicatedTable(table, adapter, { value: 'show-1' });

    expect(result.success).toBe(true);
    expect(adapter.afterSuccessfulSync).toHaveBeenCalledWith({
      scope: { value: 'show-1' },
      serverIds: new Set(['1']),
      localRows: [expect.objectContaining({ id: '1' })],
    });
  });

  it('records sync errors in metadata', async () => {
    const adapter = makeAdapter([]);
    vi.mocked(adapter.fetchRemoteRows).mockRejectedValue(new Error('network down'));

    const result = await syncReplicatedTable(table, adapter);

    expect(result.success).toBe(false);
    expect(result.error).toBe('network down');
    await expect(table.getSyncMetadata()).resolves.toMatchObject({
      syncStatus: 'error',
      errorMessage: 'network down',
    });
  });
});
