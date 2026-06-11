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

  describe('per-scope incremental watermark', () => {
    it('stores and reads the incremental watermark independently per scope', async () => {
      await table.updateSyncMetadata({ lastIncrementalSyncAt: 1_000, totalRows: 3 }, 'show-A');
      await table.updateSyncMetadata({ lastIncrementalSyncAt: 9_000, totalRows: 7 }, 'show-B');

      const metaA = await table.getSyncMetadata('show-A');
      const metaB = await table.getSyncMetadata('show-B');

      expect(metaA?.lastIncrementalSyncAt).toBe(1_000);
      expect(metaA?.totalRows).toBe(3);
      expect(metaB?.lastIncrementalSyncAt).toBe(9_000);
      expect(metaB?.totalRows).toBe(7);
    });

    it('returns watermark 0 for a scope that has never synced', async () => {
      await table.updateSyncMetadata({ lastIncrementalSyncAt: 5_000 }, 'show-A');

      const metaUnseen = await table.getSyncMetadata('show-Z');
      expect(metaUnseen?.lastIncrementalSyncAt).toBe(0);
    });

    it('does not leak a table-global totalRows into a scope that has none', async () => {
      // Scope A records only a watermark (no per-scope totalRows); a table-global
      // totalRows also exists on the row. A scoped read must NOT surface that
      // legacy table-global count — totalRows is documented as scope-specific.
      await table.updateSyncMetadata({ lastIncrementalSyncAt: 1_000 }, 'show-A');
      await table.updateSyncMetadata({ totalRows: 42 });

      // Sanity: the row genuinely carries a table-global totalRows alongside a
      // scope-A sub-record that lacks one (asserted before later writes mutate it).
      expect((await table.getSyncMetadata())?.totalRows).toBe(42);

      const metaScoped = await table.getSyncMetadata('show-A');
      expect(metaScoped?.lastIncrementalSyncAt).toBe(1_000);
      expect(metaScoped?.totalRows).toBeUndefined();

      // A scope that DOES record totalRows still reports its own count.
      await table.updateSyncMetadata({ lastIncrementalSyncAt: 2_000, totalRows: 5 }, 'show-B');
      expect((await table.getSyncMetadata('show-B'))?.totalRows).toBe(5);
    });

    it('does not let one scope advance the watermark wipe a status-only update of another', async () => {
      await table.updateSyncMetadata({ lastIncrementalSyncAt: 4_000 }, 'show-A');
      await table.updateSyncMetadata({ lastIncrementalSyncAt: 8_000 }, 'show-B');

      // An unscoped status-only update (mirrors syncReplicatedTable's start-of-sync
      // write) must preserve every scope's watermark.
      await table.updateSyncMetadata({ syncStatus: 'syncing' });

      expect((await table.getSyncMetadata('show-A'))?.lastIncrementalSyncAt).toBe(4_000);
      expect((await table.getSyncMetadata('show-B'))?.lastIncrementalSyncAt).toBe(8_000);
    });

    it('does not drop one scope\'s rows after another scope advances its watermark', async () => {
      // The core regression. Two scopes share the `entries` table. The server has a
      // row for scope A updated at t=150. Both scopes previously synced up to t=100.
      // Scope B syncs (advancing ONLY B's watermark to "now" >> 150), then scope A
      // syncs. With a shared watermark, A's `since` would be "now" and the t=150 row
      // would be skipped. With per-scope watermarks, A's `since` is still 100.
      interface RemoteScoped {
        id: string;
        name: string;
        license_key: string;
        updatedAt: number;
      }
      const server: RemoteScoped[] = [
        { id: 'a-new', name: 'A New', license_key: 'show-A', updatedAt: 150 },
      ];
      const sinceByScope: Record<string, number> = {};

      const adapter: SyncReplicatedTableAdapter<Omit<RemoteScoped, 'updatedAt'>, LocalEntry> = {
        fetchRemoteRows: vi.fn(async ({ scope, since }) => {
          sinceByScope[scope.value!] = since;
          return server
            .filter(r => r.license_key === scope.value && r.updatedAt > since)
            .map(({ updatedAt: _updatedAt, ...rest }) => rest);
        }),
        getRemoteId: r => String(r.id),
        toLocalRow: r => ({ id: String(r.id), name: r.name, license_key: r.license_key }),
        filterLocalRows: (rows, scope) => rows.filter(row => row.license_key === scope.value),
      };

      // Seed one existing local row per scope so neither sync force-fulls
      // (forceFullSync triggers when a scope has zero local rows, which would
      // reset `since` to 0 and mask the bug).
      await table.set('a-old', { id: 'a-old', name: 'A Old', license_key: 'show-A' });
      await table.set('b-old', { id: 'b-old', name: 'B Old', license_key: 'show-B' });

      // Both scopes have an established watermark at t=100.
      await table.updateSyncMetadata({ lastIncrementalSyncAt: 100 }, 'show-A');
      await table.updateSyncMetadata({ lastIncrementalSyncAt: 100 }, 'show-B');

      // Scope B syncs first → advances only scope B's watermark to Date.now() (>>150).
      await syncReplicatedTable(table, adapter, { value: 'show-B' });

      // Scope A syncs next. Its `since` must still derive from scope A's watermark.
      await syncReplicatedTable(table, adapter, { value: 'show-A' });

      expect(sinceByScope['show-A']).toBe(100);
      expect(await table.get('a-new')).toMatchObject({ id: 'a-new', name: 'A New' });

      // Scope B's watermark advanced past 150; scope A's stayed at 100 until A synced.
      const metaB = await table.getSyncMetadata('show-B');
      expect(metaB?.lastIncrementalSyncAt).toBeGreaterThan(150);
    });

    it('records totalRows per scope after a sync', async () => {
      await table.set('1', { id: '1', name: 'Rex', license_key: 'show-1' });
      await table.set('2', { id: '2', name: 'Max', license_key: 'show-2' });
      const adapter = makeAdapter([{ id: 1, name: 'Server Rex', license_key: 'show-1' }]);
      adapter.filterLocalRows = (rows, scope) =>
        rows.filter(row => row.license_key === scope.value);

      await syncReplicatedTable(table, adapter, { value: 'show-1' });

      const meta = await table.getSyncMetadata('show-1');
      expect(meta?.totalRows).toBe(1);
      // The other scope is untouched.
      expect((await table.getSyncMetadata('show-2'))?.lastIncrementalSyncAt).toBe(0);
    });

    it('mirrors a monotonic "last sync across any scope" onto the unscoped read', async () => {
      // Unscoped getSyncMetadata() should stay meaningful (e.g. a "last synced"
      // indicator) even though watermarks are per-scope. The mirror is monotonic
      // (max), and the SCOPED read still returns each scope's own watermark.
      await table.updateSyncMetadata({ lastIncrementalSyncAt: 3_000 }, 'show-A');
      await table.updateSyncMetadata({ lastIncrementalSyncAt: 7_000 }, 'show-B');
      // An older scoped write must NOT pull the table-global mirror backwards.
      await table.updateSyncMetadata({ lastIncrementalSyncAt: 1_000 }, 'show-A');

      expect((await table.getSyncMetadata())?.lastIncrementalSyncAt).toBe(7_000);
      // Scoped reads are unaffected by the mirror — each keeps its own watermark.
      expect((await table.getSyncMetadata('show-A'))?.lastIncrementalSyncAt).toBe(1_000);
      expect((await table.getSyncMetadata('show-B'))?.lastIncrementalSyncAt).toBe(7_000);
    });

    it('clearCache resets every per-scope watermark', async () => {
      await table.updateSyncMetadata({ lastIncrementalSyncAt: 5_000, totalRows: 4 }, 'show-A');
      await table.updateSyncMetadata({ lastIncrementalSyncAt: 6_000, totalRows: 2 }, 'show-B');

      await table.clearCache();

      expect((await table.getSyncMetadata('show-A'))?.lastIncrementalSyncAt).toBe(0);
      expect((await table.getSyncMetadata('show-B'))?.lastIncrementalSyncAt).toBe(0);
    });
  });
});
