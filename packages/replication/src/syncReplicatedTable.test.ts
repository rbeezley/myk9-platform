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

  describe('Phase 4 conflict surfacing (conflictSurfacingEnabled)', () => {
    it('marks row as conflict and dispatches replication:conflict when local and remote changed the same field', async () => {
      // Assertion-first: write the expect before the implementation path exists
      // in the test fixture. The red state proves the wrong value was previously silent.
      const events: CustomEvent[] = [];
      const handler = (e: Event) => events.push(e as CustomEvent);
      window.addEventListener('replication:conflict', handler);

      // Start from a clean row, then dirty it by changing 'status'
      await table.set('1', { id: '1', name: 'Rex', status: 'checked-in' });
      await table.set('1', { id: '1', name: 'Rex', status: 'in-ring' }, true);

      // Remote also changed 'status' → same-field collision
      const adapter = makeAdapter([{ id: 1, name: 'Rex', status: 'scratched' }]);

      const result = await syncReplicatedTable(table, adapter, {}, { conflictSurfacingEnabled: true });

      window.removeEventListener('replication:conflict', handler);

      expect(events).toHaveLength(1);
      expect(events[0]!.detail).toMatchObject({
        tableName: table.getTableName(),
        rowId: '1',
        fields: ['status'],
        localData: expect.objectContaining({ status: 'in-ring' }),
        remoteData: expect.objectContaining({ status: 'scratched' }),
      });
      await expect(table.getReplicatedRow('1')).resolves.toMatchObject({
        syncStatus: 'conflict',
        isDirty: true,
      });
      expect(result.rowsAffected).toBe(1);
      expect(result.conflictsResolved).toBe(1);
    });

    it('does not conflict when local and remote changed different fields (field-merge path preserved)', async () => {
      const events: CustomEvent[] = [];
      const handler = (e: Event) => events.push(e as CustomEvent);
      window.addEventListener('replication:conflict', handler);

      await table.set('1', { id: '1', name: 'Rex', status: 'checked-in', resultStatus: 'pending' });
      // Local changed 'status'; remote will change 'resultStatus' → non-overlapping
      await table.set('1', { id: '1', name: 'Rex', status: 'in-ring', resultStatus: 'pending' }, true);

      const adapter = makeAdapter([
        { id: 1, name: 'Rex', status: 'checked-in', result_status: 'qualified' },
      ]);
      adapter.mergeDirtyRow = (local, remote) => ({
        ...local,
        resultStatus: remote.resultStatus,
      });

      await syncReplicatedTable(table, adapter, {}, { conflictSurfacingEnabled: true });

      window.removeEventListener('replication:conflict', handler);

      expect(events).toHaveLength(0);
      expect(await table.get('1')).toMatchObject({ status: 'in-ring', resultStatus: 'qualified' });
    });

    it('preserves existing LWW/mergeDirtyRow behavior when flag is off', async () => {
      const events: CustomEvent[] = [];
      const handler = (e: Event) => events.push(e as CustomEvent);
      window.addEventListener('replication:conflict', handler);

      await table.set('1', { id: '1', name: 'Rex', status: 'checked-in' });
      await table.set('1', { id: '1', name: 'Rex', status: 'in-ring' }, true);

      const adapter = makeAdapter([{ id: 1, name: 'Rex', status: 'scratched' }]);
      adapter.mergeDirtyRow = (local, remote) => ({ ...local, status: remote.status });

      // Same-field collision, but flag is off → silent merge
      await syncReplicatedTable(table, adapter, {}, { conflictSurfacingEnabled: false });

      window.removeEventListener('replication:conflict', handler);

      expect(events).toHaveLength(0);
      expect(await table.get('1')).toMatchObject({ status: 'scratched' });
    });

    it('falls through to mergeDirtyRow when dirty row has no baseData snapshot', async () => {
      // A row dirtied without a prior clean state has no baseData → cannot diff → safe fallback
      const events: CustomEvent[] = [];
      const handler = (e: Event) => events.push(e as CustomEvent);
      window.addEventListener('replication:conflict', handler);

      // set with isDirty=true immediately (no clean state captured first)
      await table.set('1', { id: '1', name: 'Rex', status: 'in-ring' }, true);

      const adapter = makeAdapter([{ id: 1, name: 'Rex', status: 'scratched' }]);
      adapter.mergeDirtyRow = (local, remote) => ({ ...local, status: remote.status });

      await syncReplicatedTable(table, adapter, {}, { conflictSurfacingEnabled: true });

      window.removeEventListener('replication:conflict', handler);

      // No event because there was no baseData to detect against
      expect(events).toHaveLength(0);
      expect(await table.get('1')).toMatchObject({ status: 'scratched' });
    });
  });

  describe('OCC (optimistic concurrency control)', () => {
    it('stores remoteServerVersion on clean rows from the server', async () => {
      // Remote row includes version column (stripped by toLocalRow but captured separately)
      const remoteWithVersion = [{ id: 1, name: 'Rex', status: 'checked-in', version: 7 }];
      const adapter: SyncReplicatedTableAdapter<
        (typeof remoteWithVersion)[0],
        LocalEntry
      > = {
        fetchRemoteRows: vi.fn(async () => remoteWithVersion),
        getRemoteId: r => String(r.id),
        toLocalRow: r => ({ id: String(r.id), name: r.name, status: r.status }),
      };

      await syncReplicatedTable(table, adapter);

      const row = await table.getReplicatedRow('1');
      expect(row?.serverVersion).toBe(7);
      expect(row?.syncStatus).toBe('synced');
    });

    it('includes remoteServerVersion from the remote row in the conflict snapshot', async () => {
      const events: CustomEvent[] = [];
      const handler = (e: Event) => events.push(e as CustomEvent);
      window.addEventListener('replication:conflict', handler);

      // Set up: clean row then dirty local edit → baseData is captured
      await table.set('1', { id: '1', name: 'Rex', status: 'checked-in' });
      await table.set('1', { id: '1', name: 'Rex', status: 'in-ring' }, true);

      // Remote row carries server version 9 (other user wrote)
      type RemoteWithVersion = RemoteEntry & { version: number };
      const adapter: SyncReplicatedTableAdapter<RemoteWithVersion, LocalEntry> = {
        fetchRemoteRows: vi.fn(async () => [
          { id: 1, name: 'Rex', status: 'scratched', version: 9 },
        ]),
        getRemoteId: r => String(r.id),
        toLocalRow: r => ({ id: String(r.id), name: r.name, status: r.status }),
      };

      await syncReplicatedTable(table, adapter, {}, { conflictSurfacingEnabled: true });
      window.removeEventListener('replication:conflict', handler);

      expect(events).toHaveLength(1);
      expect(events[0]!.detail).toMatchObject({
        remoteServerVersion: 9,
        fields: ['status'],
      });
    });

    it('when upload leaves row dirty (simulated OCC), download still detects conflict', async () => {
      // Set up: row has baseData, is dirty, upload stub does NOT clear dirty flag
      // (simulates OCC rejection path where markReplicatedRowSynced was not called)
      const events: CustomEvent[] = [];
      const handler = (e: Event) => events.push(e as CustomEvent);
      window.addEventListener('replication:conflict', handler);

      await table.set('1', { id: '1', name: 'Rex', status: 'checked-in' });
      await table.set('1', { id: '1', name: 'Rex', status: 'in-ring' }, true);

      // Upload stub that does nothing — simulates OCC rejection (row stays dirty)
      const uploadPendingMutations = vi.fn(async () => undefined);

      const adapter = makeAdapter([{ id: 1, name: 'Rex', status: 'scratched' }]);

      const result = await syncReplicatedTable(
        table,
        adapter,
        {},
        { uploadPendingMutations, conflictSurfacingEnabled: true }
      );

      window.removeEventListener('replication:conflict', handler);

      expect(uploadPendingMutations).toHaveBeenCalledTimes(1);
      // Row stayed dirty after upload → conflict detected during download
      expect(events).toHaveLength(1);
      expect(events[0]!.detail).toMatchObject({
        fields: ['status'],
        localData: expect.objectContaining({ status: 'in-ring' }),
        remoteData: expect.objectContaining({ status: 'scratched' }),
      });
      expect(result.conflictsResolved).toBe(1);
    });
  });
});
