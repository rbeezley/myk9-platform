import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedTable } from './core/ReplicatedTable';
import { syncReplicatedTable, type SyncReplicatedTableAdapter } from './syncReplicatedTable';
import { parseUpdatedAtMs } from './parseUpdatedAt';
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

function adapterFor(
  remote: RemoteRow[],
  remoteCount: number
): SyncReplicatedTableAdapter<RemoteRow, LocalRow> {
  return {
    fetchRemoteRows: vi.fn(async () => remote),
    getRemoteRowCount: vi.fn(async () => remoteCount),
    getRemoteId: row => row.id,
    getRemoteUpdatedAt: row => parseUpdatedAtMs(row.updated_at),
    toLocalRow: row => ({ id: row.id, name: row.name }),
    cleanupStaleRowsOnFullSync: true,
  };
}

// MYK9-880: the row count and the row fetch read through the same RLS, so a
// transient policy gap returns 0 rows AND a count of 0 -- a "complete" empty
// fetch. Zero rows must never evict a warm replica without independent proof.
describe('syncReplicatedTable zero-row stale-cleanup guard (MYK9-880)', () => {
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

  async function seedWarmReplica() {
    await table.set('1', { id: '1', name: 'Warm A' });
    await table.set('2', { id: '2', name: 'Warm B' });
    await table.updateSyncMetadata({ lastIncrementalSyncAt: 1000, lastFullSyncAt: Date.now() });
    // The cleanup cutoff is strict (rows synced BEFORE the fetch began).
    await new Promise(resolve => setTimeout(resolve, 5));
  }

  it('keeps a populated scope when the full fetch and its count both read zero', async () => {
    await seedWarmReplica();
    const adapter = adapterFor([], 0);
    adapter.afterSuccessfulSync = vi.fn();

    const result = await syncReplicatedTable(table, adapter);

    expect(result.operation).toBe('full-sync');
    expect(result.success).toBe(true);
    expect(await table.get('1')).toMatchObject({ name: 'Warm A' });
    expect(await table.get('2')).toMatchObject({ name: 'Warm B' });
    expect(adapter.afterSuccessfulSync).toHaveBeenCalledWith(
      expect.objectContaining({ staleCleanupCompleted: false })
    );
  });

  it('keeps the scope when the independent check cannot prove it empty', async () => {
    await seedWarmReplica();
    const adapter = adapterFor([], 0);
    adapter.verifyScopeEmpty = vi.fn(async () => false);

    await syncReplicatedTable(table, adapter);

    expect(adapter.verifyScopeEmpty).toHaveBeenCalledTimes(1);
    expect(await table.get('1')).toMatchObject({ name: 'Warm A' });
    expect(await table.get('2')).toMatchObject({ name: 'Warm B' });
  });

  it('keeps the scope when the independent check throws', async () => {
    await seedWarmReplica();
    const adapter = adapterFor([], 0);
    adapter.verifyScopeEmpty = vi.fn(async () => {
      throw new Error('offline');
    });

    const result = await syncReplicatedTable(table, adapter);

    expect(result.success).toBe(true);
    expect(await table.get('1')).toMatchObject({ name: 'Warm A' });
  });

  it('cleans up a zero-row fetch when an independent source proves the scope empty', async () => {
    await seedWarmReplica();
    const adapter = adapterFor([], 0);
    adapter.verifyScopeEmpty = vi.fn(async () => true);

    await syncReplicatedTable(table, adapter);

    expect(await table.get('1')).toBeNull();
    expect(await table.get('2')).toBeNull();
  });

  it('does not ask for proof when the local scope holds no server-backed rows', async () => {
    await table.set('local', { id: 'local', name: 'Pending create', _localOnly: true });
    const adapter = adapterFor([], 0);
    adapter.verifyScopeEmpty = vi.fn(async () => true);

    const result = await syncReplicatedTable(table, adapter);

    expect(result.success).toBe(true);
    expect(adapter.verifyScopeEmpty).not.toHaveBeenCalled();
    expect(await table.get('local')).toMatchObject({ name: 'Pending create' });
  });

  it('still removes a truly stale row after a non-empty full fetch', async () => {
    await seedWarmReplica();
    const adapter = adapterFor([{ id: '1', name: 'Warm A', updated_at: 2000 }], 1);

    await syncReplicatedTable(table, adapter);

    expect(await table.get('1')).toMatchObject({ name: 'Warm A' });
    expect(await table.get('2')).toBeNull();
  });
});
