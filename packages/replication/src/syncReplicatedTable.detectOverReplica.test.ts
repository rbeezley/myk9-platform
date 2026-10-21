import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedTable } from './core/ReplicatedTable';
import { syncReplicatedTable, type SyncReplicatedTableAdapter } from './syncReplicatedTable';
import { parseUpdatedAtMs } from './parseUpdatedAt';
import { resetRemoteCountCadenceForTests } from './remoteCountCadence';
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

function adapterWith(flags: Partial<SyncReplicatedTableAdapter<RemoteRow, LocalRow>>) {
  const adapter: SyncReplicatedTableAdapter<RemoteRow, LocalRow> = {
    fetchRemoteRows: vi.fn(async () => [{ id: '1', name: 'Kept', updated_at: 2000 }]),
    getRemoteRowCount: vi.fn(async () => 1),
    getRemoteId: r => r.id,
    getRemoteUpdatedAt: r => parseUpdatedAtMs(r.updated_at),
    toLocalRow: r => ({ id: r.id, name: r.name }),
    ...flags,
  };
  return adapter;
}

describe('detectOverReplica (MYK9-1302)', () => {
  let table: TestTable;

  beforeEach(async () => {
    resetRemoteCountCadenceForTests();
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
    table = new TestTable(`overreplica_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    await table.set('1', { id: '1', name: 'Kept' });
    await table.set('2', { id: '2', name: 'Deleted on server' });
    await table.updateSyncMetadata({ lastIncrementalSyncAt: 1000, lastFullSyncAt: Date.now() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a count below the server-backed rows forces a full sync and the engine removes nothing', async () => {
    const result = await syncReplicatedTable(table, adapterWith({ detectOverReplica: true }));

    expect(result.operation).toBe('full-sync');
    // The table's own id scan prunes, with its guards; the engine leaves the row.
    expect(await table.get('2')).not.toBeNull();
  });

  it('an equal count at the pre-check, then a delta that adds a row, re-runs as a full sync without pruning', async () => {
    // Pre-check: 2 local server-backed rows, count 2: no over-replica. The delta
    // then brings row 3; the device holds 3 against a count of 2 (one row deleted
    // and one added since the last pass), so the post-fetch gate re-runs full.
    const adapter = adapterWith({
      detectOverReplica: true,
      getRemoteRowCount: vi.fn(async () => 2),
      fetchRemoteRows: vi.fn(async () => [{ id: '3', name: 'Added', updated_at: 3000 }]),
    });
    const result = await syncReplicatedTable(table, adapter);

    expect(result.operation).toBe('full-sync');
    expect(await table.get('2')).not.toBeNull();
    expect(await table.get('3')).not.toBeNull();
  });

  it('with neither flag the same count does not force a full sync', async () => {
    const result = await syncReplicatedTable(table, adapterWith({}));

    expect(result.operation).toBe('incremental-sync');
    expect(await table.get('2')).not.toBeNull();
  });
});
