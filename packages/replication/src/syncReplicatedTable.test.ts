import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedTable } from './core/ReplicatedTable';
import { syncReplicatedTable, type SyncReplicatedTableAdapter } from './syncReplicatedTable';
import { parseUpdatedAtMs } from './parseUpdatedAt';
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
  updated_at?: string | number | null;
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

  describe('server-authoritative incremental watermark', () => {
    // Adapter that advances the watermark from the server `updated_at`, mirroring
    // the real Replicated*Table adapters (getRemoteUpdatedAt + parseUpdatedAtMs).
    function makeTsAdapter(
      remoteRows: RemoteEntry[]
    ): SyncReplicatedTableAdapter<RemoteEntry, LocalEntry> {
      return {
        ...makeAdapter(remoteRows),
        getRemoteUpdatedAt: remote => parseUpdatedAtMs(remote.updated_at),
      };
    }

    it('advances the watermark to the max server updated_at, NOT the client clock', async () => {
      // Red-first: under the old code lastIncrementalSyncAt = Date.now() (~1.7e12),
      // which sits far in the "future" of the server timestamps and silently skips
      // any row whose updated_at is below it. The fix anchors the watermark to a
      // server timestamp actually observed (here: 2000).
      const adapter = makeTsAdapter([
        { id: 1, name: 'Rex', updated_at: 1000 },
        { id: 2, name: 'Max', updated_at: 2000 },
      ]);

      await syncReplicatedTable(table, adapter);

      const meta = await table.getSyncMetadata();
      expect(meta?.lastIncrementalSyncAt).toBe(2000);
      // Full sync also stamps lastFullSyncAt (client clock is fine for the 24h heal).
      expect(meta?.lastFullSyncAt).toBeGreaterThan(0);
    });

    it('derives the next incremental `since` from the server watermark (minus buffer)', async () => {
      // First sync establishes watermark = 2000 from the server.
      await syncReplicatedTable(table, makeTsAdapter([{ id: 1, name: 'Rex', updated_at: 2000 }]));

      // Second sync is incremental (replica non-empty). A row created at 2001 — just
      // after the last watermark — must be inside the fetch window, proving no drop.
      const second = makeTsAdapter([{ id: 1, name: 'Rex', updated_at: 2001 }]);
      await syncReplicatedTable(table, second, {}, { incrementalBufferMs: 500 });

      const since = vi.mocked(second.fetchRemoteRows).mock.calls[0]![0].since;
      expect(since).toBe(1500); // 2000 (server watermark) - 500 (buffer)
      expect(since).toBeLessThan(2001); // the new row is fetchable
    });

    it('never regresses the watermark (monotonic) when a backdated row arrives', async () => {
      await table.set('seed', { id: 'seed', name: 'Seed' });
      await table.updateSyncMetadata({ lastIncrementalSyncAt: 5000 });

      // Server returns a row stamped earlier than the current watermark.
      await syncReplicatedTable(table, makeTsAdapter([{ id: 1, name: 'Old', updated_at: 3000 }]));

      const meta = await table.getSyncMetadata();
      expect(meta?.lastIncrementalSyncAt).toBe(5000); // max(5000, 3000), not 3000
    });

    it('caches a row with no usable timestamp but never lets it poison the watermark', async () => {
      await table.set('seed', { id: 'seed', name: 'Seed' });
      await table.updateSyncMetadata({ lastIncrementalSyncAt: 2000 });

      // updated_at = null → parseUpdatedAtMs → null → excluded from the max.
      await syncReplicatedTable(table, makeTsAdapter([{ id: 1, name: 'NoTs', updated_at: null }]));

      // Row is still cached as data...
      expect(await table.get('1')).toMatchObject({ id: '1', name: 'NoTs' });
      const meta = await table.getSyncMetadata();
      // ...and the watermark is unchanged and finite (not NaN).
      expect(meta?.lastIncrementalSyncAt).toBe(2000);
      expect(Number.isFinite(meta?.lastIncrementalSyncAt)).toBe(true);

      // Proof the watermark didn't become NaN: the next fetch's `since` is a valid number.
      const next = makeTsAdapter([]);
      await syncReplicatedTable(table, next);
      const since = vi.mocked(next.fetchRemoteRows).mock.calls[0]![0].since;
      expect(Number.isFinite(since)).toBe(true);
    });

    it('does NOT advance the watermark when the sync fails', async () => {
      await table.set('seed', { id: 'seed', name: 'Seed' });
      await table.updateSyncMetadata({ lastIncrementalSyncAt: 1234 });

      const adapter = makeTsAdapter([]);
      vi.mocked(adapter.fetchRemoteRows).mockRejectedValue(new Error('network down'));

      const result = await syncReplicatedTable(table, adapter);

      expect(result.success).toBe(false);
      const meta = await table.getSyncMetadata();
      expect(meta?.lastIncrementalSyncAt).toBe(1234); // unchanged
      expect(meta?.syncStatus).toBe('error');
    });

    it('leaves the watermark unchanged when the fetch returns no rows', async () => {
      await table.set('seed', { id: 'seed', name: 'Seed' });
      await table.updateSyncMetadata({ lastIncrementalSyncAt: 7000 });

      await syncReplicatedTable(table, makeTsAdapter([]));

      const meta = await table.getSyncMetadata();
      expect(meta?.lastIncrementalSyncAt).toBe(7000);
    });

    it('falls back to the client clock when the adapter provides no timestamp hook', async () => {
      // Back-compat: adapters without getRemoteUpdatedAt keep the legacy Date.now()
      // watermark. The row's old updated_at (1000) must NOT become the watermark.
      const adapter = makeAdapter([{ id: 1, name: 'Rex', updated_at: 1000 }]);

      await syncReplicatedTable(table, adapter);

      const meta = await table.getSyncMetadata();
      expect(meta?.lastIncrementalSyncAt).toBeGreaterThan(1_000_000_000_000); // ~Date.now()
    });

    it('re-fetches a locally-created row after upload and stores its server version', async () => {
      // Same-device path: a row created locally then uploaded gets a server updated_at
      // newer than the last watermark, so the corrected `since` window includes it and
      // its server `version` lands on the IDB row (OCC precondition for the next edit).
      await table.set('seed', { id: 'seed', name: 'Seed' });
      await table.updateSyncMetadata({ lastIncrementalSyncAt: 1000 });

      type RemoteWithVersion = RemoteEntry & { version: number };
      const adapter: SyncReplicatedTableAdapter<RemoteWithVersion, LocalEntry> = {
        fetchRemoteRows: vi.fn(async () => [
          { id: 1, name: 'Just Uploaded', updated_at: 2000, version: 3 },
        ]),
        getRemoteId: r => String(r.id),
        getRemoteUpdatedAt: r => parseUpdatedAtMs(r.updated_at),
        toLocalRow: r => ({ id: String(r.id), name: r.name }),
      };

      await syncReplicatedTable(table, adapter, {}, { incrementalBufferMs: 500 });

      const since = vi.mocked(adapter.fetchRemoteRows).mock.calls[0]![0].since;
      expect(since).toBe(500); // 1000 - 500 buffer; < 2000 so the uploaded row is in-window
      const row = await table.getReplicatedRow('1');
      expect(row?.serverVersion).toBe(3);
      expect(await table.get('1')).toMatchObject({ name: 'Just Uploaded' });
    });

    it('advances the watermark monotonically inside the cache tx (no regression from a stale concurrent write)', async () => {
      // Simulates: fast sync advanced the persisted watermark to 7000; a slower
      // sync that snapshotted an older value now writes 6000. The max-in-transaction
      // must keep 7000, not regress to 6000.
      await table.updateSyncMetadata({ lastIncrementalSyncAt: 7000 });
      await table.updateSyncMetadata(
        { lastIncrementalSyncAt: 6000 },
        { advanceWatermarkMonotonically: true }
      );
      const meta = await table.getSyncMetadata();
      expect(meta?.lastIncrementalSyncAt).toBe(7000);
    });

    it('still allows a literal watermark reset to 0 (cache clear path, no monotonic flag)', async () => {
      await table.updateSyncMetadata({ lastIncrementalSyncAt: 7000 });
      await table.updateSyncMetadata({ lastIncrementalSyncAt: 0 });
      const meta = await table.getSyncMetadata();
      expect(meta?.lastIncrementalSyncAt).toBe(0);
    });

    it('reports recoveredFromEmptyReplica when an emptied replica re-fetches', async () => {
      // Metadata says the replica previously held rows (totalRows > 0) but the local
      // store is now empty — an unexpected eviction. The result flags it for logging.
      await table.updateSyncMetadata({ lastIncrementalSyncAt: 1000, totalRows: 5 });

      const result = await syncReplicatedTable(
        table,
        makeTsAdapter([{ id: 1, name: 'Rex', updated_at: 2000 }])
      );

      expect(result.recoveredFromEmptyReplica).toBe(true);
      expect(result.operation).toBe('full-sync');
    });

    it('forces a full re-sync when the last full sync is older than the heal interval', async () => {
      // A non-empty replica would normally sync incrementally — but a stale full sync
      // (here 25h ago, past the 24h default) forces a full re-sync so any drift heals.
      await table.set('seed', { id: 'seed', name: 'Seed' });
      await table.updateSyncMetadata({
        lastIncrementalSyncAt: 5000,
        lastFullSyncAt: Date.now() - 25 * 60 * 60 * 1000,
      });

      const result = await syncReplicatedTable(
        table,
        makeTsAdapter([{ id: 1, name: 'Rex', updated_at: 6000 }])
      );

      expect(result.operation).toBe('full-sync');
    });

    it.each([
      ['Infinity', Infinity],
      ['NaN', NaN],
    ])('does not throw when the persisted watermark is corrupt (%s)', async (_label, bad) => {
      // A corrupt IDB watermark must degrade to a finite `since`, not reach
      // new Date(Infinity|NaN).toISOString() and throw, wedging the table's sync.
      await table.set('seed', { id: 'seed', name: 'Seed' });
      await table.updateSyncMetadata({ lastIncrementalSyncAt: bad });
      const adapter = makeTsAdapter([{ id: 1, name: 'Rex', updated_at: 2000 }]);

      const result = await syncReplicatedTable(table, adapter);

      expect(result.success).toBe(true);
      const since = vi.mocked(adapter.fetchRemoteRows).mock.calls[0]![0].since;
      expect(Number.isFinite(since)).toBe(true);
      expect(since).toBe(0);
    });

    it('does NOT force a full sync every tick when a full sync has never run (lastFullSyncAt = 0)', async () => {
      // Guard on `lastFullSyncAt > 0`: a never-full-synced non-empty replica must stay
      // incremental, not force-full on every sync.
      await table.set('seed', { id: 'seed', name: 'Seed' });
      await table.updateSyncMetadata({ lastIncrementalSyncAt: 5000 }); // lastFullSyncAt stays 0

      const result = await syncReplicatedTable(
        table,
        makeTsAdapter([{ id: 1, name: 'Rex', updated_at: 6000 }])
      );

      expect(result.operation).toBe('incremental-sync');
    });
  });
});
