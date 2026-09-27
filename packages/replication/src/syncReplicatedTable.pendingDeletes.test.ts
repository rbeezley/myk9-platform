import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedTable } from './core/ReplicatedTable';
import { syncReplicatedTable, type SyncReplicatedTableAdapter } from './syncReplicatedTable';
import { countCoveredRows } from './replicaCoverage';
import { parseUpdatedAtMs } from './parseUpdatedAt';
import type { SyncOptions, SyncResult } from './types';

interface LocalRow {
  id: string;
  name: string;
  license_key?: string;
  _localOnly?: boolean;
}

interface RemoteRow {
  id: string;
  name: string;
  license_key?: string;
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

function countedAdapter(
  remote: RemoteRow[],
  remoteCount: number
): SyncReplicatedTableAdapter<RemoteRow, LocalRow> {
  return {
    fetchRemoteRows: vi.fn(async () => remote),
    getRemoteRowCount: vi.fn(async () => remoteCount),
    getRemoteId: row => row.id,
    getRemoteUpdatedAt: row => parseUpdatedAtMs(row.updated_at),
    toLocalRow: row => ({ id: row.id, name: row.name, license_key: row.license_key }),
  };
}

describe('countCoveredRows (MYK9-762)', () => {
  it('counts server-backed rows plus pending deletes no longer held locally', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'local', _localOnly: true }];
    expect(countCoveredRows(rows)).toBe(2);
    expect(countCoveredRows(rows, new Set(['gone']))).toBe(3);
  });

  it('never counts a pending delete twice when its row is still on the device', () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    expect(countCoveredRows(rows, new Set(['b']))).toBe(2);
  });
});

describe('syncReplicatedTable pending deletes (MYK9-762)', () => {
  let table: TestTable;

  beforeEach(async () => {
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
    table = new TestTable(`rows_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  });

  afterEach(async () => {
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
  });

  async function seedRecentFullSync() {
    await table.updateSyncMetadata({ lastIncrementalSyncAt: 1000, lastFullSyncAt: Date.now() });
  }

  it('does not read a row this device deleted and queued as missing', async () => {
    await table.set('1', { id: '1', name: 'Kept' });
    await seedRecentFullSync();
    // The server still counts row 2 until the queued DELETE uploads.
    const adapter = countedAdapter([], 2);
    adapter.getPendingDeleteIds = vi.fn(async () => new Set(['2']));

    const result = await syncReplicatedTable(table, adapter);

    expect(result.success).toBe(true);
    expect(result.operation).toBe('incremental-sync');
  });

  it('still forces a full sync when a row is missing beyond the pending delete', async () => {
    await table.set('1', { id: '1', name: 'Kept' });
    await seedRecentFullSync();
    // Server: 1, 2 (pending delete here) and 3 (missing on this device).
    const adapter = countedAdapter([], 3);
    adapter.getPendingDeleteIds = vi.fn(async () => new Set(['2']));

    const result = await syncReplicatedTable(table, adapter);

    expect(result.operation).toBe('full-sync');
  });

  it('does not count a pending delete whose row is still on the device', async () => {
    await table.set('1', { id: '1', name: 'Kept' });
    await table.set('2', { id: '2', name: 'Delete queued, row not yet removed' });
    await seedRecentFullSync();
    const adapter = countedAdapter([], 3);
    adapter.getPendingDeleteIds = vi.fn(async () => new Set(['2']));

    const result = await syncReplicatedTable(table, adapter);

    expect(result.operation).toBe('full-sync');
  });

  it('reads the pending deletes after the server count', async () => {
    await table.set('1', { id: '1', name: 'Kept' });
    await seedRecentFullSync();
    const adapter = countedAdapter([], 2);
    adapter.getPendingDeleteIds = vi.fn(async () => new Set(['2']));

    await syncReplicatedTable(table, adapter);

    expect(vi.mocked(adapter.getRemoteRowCount!).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(adapter.getPendingDeleteIds).mock.invocationCallOrder[0]!
    );
  });

  it('treats a failed pending-delete read as none, and still syncs', async () => {
    await table.set('1', { id: '1', name: 'Kept' });
    await seedRecentFullSync();
    const adapter = countedAdapter([], 2);
    adapter.getPendingDeleteIds = vi.fn(async () => Promise.reject(new Error('queue unreadable')));

    const result = await syncReplicatedTable(table, adapter);

    expect(result.success).toBe(true);
    expect(result.operation).toBe('full-sync');
  });

  it('keeps the persisted server count raw, so readiness can add pending deletes itself', async () => {
    await table.set('1', { id: '1', name: 'Kept' });
    await seedRecentFullSync();
    const adapter = countedAdapter([], 2);
    adapter.getPendingDeleteIds = vi.fn(async () => new Set(['2']));

    await syncReplicatedTable(table, adapter);

    await expect(table.getSyncMetadata()).resolves.toMatchObject({ expectedRemoteRows: 2 });
  });
});

// MYK9-762 item 3: a scoped adapter (trials, per show) can opt into the
// MYK9-775 stale-row cleanup only if a full fetch of ONE scope never removes
// the rows of another scope the device also stores.
describe('cleanupStaleRowsOnFullSync with a scoped adapter', () => {
  let table: TestTable;

  beforeEach(async () => {
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
    table = new TestTable(`scoped_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  });

  afterEach(async () => {
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
  });

  it('removes a server-deleted row of this scope and keeps every other scope', async () => {
    await table.set('a1', { id: 'a1', name: 'A kept', license_key: 'show-A' });
    await table.set('a2', { id: 'a2', name: 'A deleted on server', license_key: 'show-A' });
    await table.set('b1', { id: 'b1', name: 'Another show', license_key: 'show-B' });
    const adapter = countedAdapter(
      [{ id: 'a1', name: 'A kept', license_key: 'show-A', updated_at: 2000 }],
      1
    );
    adapter.filterLocalRows = (rows, scope) => rows.filter(row => row.license_key === scope.value);
    adapter.cleanupStaleRowsOnFullSync = true;
    // The cleanup cutoff is strict (synced BEFORE the fetch began).
    await new Promise(resolve => setTimeout(resolve, 5));

    const result = await syncReplicatedTable(table, adapter, { value: 'show-A' });

    // Two A rows here, one on the server: the over-count forces the full sync.
    expect(result.operation).toBe('full-sync');
    expect(await table.get('a1')).toMatchObject({ name: 'A kept' });
    expect(await table.get('a2')).toBeNull();
    expect(await table.get('b1')).toMatchObject({ name: 'Another show' });
  });

  it('skips the cleanup when the whole-table read fails, rather than remove other scopes', async () => {
    await table.set('a1', { id: 'a1', name: 'A kept', license_key: 'show-A' });
    await table.set('a2', { id: 'a2', name: 'A deleted on server', license_key: 'show-A' });
    await table.set('b1', { id: 'b1', name: 'Another show', license_key: 'show-B' });
    const adapter = countedAdapter(
      [{ id: 'a1', name: 'A kept', license_key: 'show-A', updated_at: 2000 }],
      1
    );
    adapter.filterLocalRows = (rows, scope) => rows.filter(row => row.license_key === scope.value);
    adapter.cleanupStaleRowsOnFullSync = true;
    await new Promise(resolve => setTimeout(resolve, 5));
    // The scope's own rows are read through getAll(); the cleanup's read of the
    // WHOLE table goes through getAllWithStatus(), and that read fails.
    const wholeTableRead = vi
      .spyOn(table, 'getAllWithStatus')
      .mockResolvedValue({ ok: false, rows: [], error: new Error('IndexedDB read failed') });

    await syncReplicatedTable(table, adapter, { value: 'show-A' }, { forceFullSync: true });

    expect(wholeTableRead).toHaveBeenCalled();
    wholeTableRead.mockRestore();
    expect(await table.get('b1')).toMatchObject({ name: 'Another show' });
    expect(await table.get('a2')).toMatchObject({ name: 'A deleted on server' });
  });
});
