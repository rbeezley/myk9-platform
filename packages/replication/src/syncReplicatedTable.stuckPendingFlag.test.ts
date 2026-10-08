import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedTable } from './core/ReplicatedTable';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import { syncReplicatedTable, type SyncReplicatedTableAdapter } from './syncReplicatedTable';
import type { PendingMutation, SyncOptions, SyncResult } from './types';

// MYK9-1055: a device that ran the pre-MYK9-1050 build holds clean rows whose
// data flag is stuck at 'pending'. The table's resolveConflict keeps a row with
// that flag over the server's, and the cursor is past the server row's updated_at.

interface Row {
  id: string;
  showId: string;
  _syncStatus?: 'pending' | 'synced';
  updated_at: number;
  final_placement?: number | undefined;
}

class FlagReadingTable extends ReplicatedTable<Row> {
  async sync(_scope: string, _options?: Partial<SyncOptions>): Promise<SyncResult> {
    return {
      tableName: this.getTableName(),
      success: true,
      operation: 'incremental-sync',
      rowsAffected: 0,
      duration: 0,
    };
  }

  protected resolveConflict(local: Row, remote: Row): Row {
    return local._syncStatus === 'pending' ? local : remote;
  }
}

const CURSOR = 5000;
const SERVER_UPDATED_AT = 2000;

function adapterFor(server: Row[]): SyncReplicatedTableAdapter<Row, Row> {
  return {
    fetchRemoteRows: vi.fn(async ({ since }) => server.filter(r => r.updated_at > since)),
    getRemoteId: row => row.id,
    getRemoteUpdatedAt: row => row.updated_at,
    toLocalRow: row => ({ ...row, _syncStatus: 'synced' }),
    resolveConflict: (local, remote) => (local._syncStatus === 'pending' ? local : remote),
  };
}

const serverRow = (id: string): Row => ({
  id,
  showId: 'show-1',
  _syncStatus: 'synced',
  updated_at: SERVER_UPDATED_AT,
  final_placement: 1,
});

const stuckRow = (id: string): Row => ({
  id,
  showId: 'show-1',
  _syncStatus: 'pending',
  updated_at: 1000,
  final_placement: undefined,
});

function mutation(id: string, rowId: string, tableName: string): PendingMutation {
  return {
    id,
    tableName,
    operation: 'UPDATE',
    rowId,
    data: {},
    timestamp: 1,
    retries: 0,
    status: 'pending',
  } as PendingMutation;
}

describe('stuck pending data flag repair (MYK9-1055)', () => {
  let table: FlagReadingTable;

  beforeEach(async () => {
    await databaseManager.reset();
    table = new FlagReadingTable(`stuck_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  });

  afterEach(async () => {
    await databaseManager.reset();
  });

  async function seedCursor() {
    await table.updateSyncMetadata(
      { lastIncrementalSyncAt: CURSOR, lastFullSyncAt: Date.now() },
      { scopeValue: 'show-1' }
    );
  }

  it('delivers the server placement a stuck clean row hid', async () => {
    await table.set('e1', stuckRow('e1'));
    await seedCursor();

    await syncReplicatedTable(table, adapterFor([serverRow('e1')]), { value: 'show-1' });

    const row = await table.get('e1');
    expect(row?.final_placement).toBe(1);
    expect(row?._syncStatus).toBe('synced');
  });

  it('leaves a dirty row untouched', async () => {
    await table.set('e1', { ...stuckRow('e1'), final_placement: 9 }, true);
    await seedCursor();

    await syncReplicatedTable(table, adapterFor([serverRow('e1')]), { value: 'show-1' });

    const row = await table.get('e1');
    expect(row?.final_placement).toBe(9);
    expect(row?._syncStatus).toBe('pending');
  });

  it.each([
    REPLICATION_STORES.PENDING_MUTATIONS,
    REPLICATION_STORES.FAILED_MUTATIONS,
    REPLICATION_STORES.OFFLINE_QUEUE,
  ])('leaves a clean-looking row alone while %s names it', async store => {
    await table.set('e1', stuckRow('e1'));
    await seedCursor();
    const db = await databaseManager.getDatabase(table.getTableName());
    await db.put(store, mutation('m1', 'e1', table.getTableName()));

    await syncReplicatedTable(table, adapterFor([serverRow('e1')]), { value: 'show-1' });

    const row = await table.get('e1');
    expect(row?._syncStatus).toBe('pending');
    expect(row?.final_placement).toBeUndefined();
  });

  it('is idempotent: a second pass finds nothing and keeps the cursor', async () => {
    await table.set('e1', stuckRow('e1'));
    await seedCursor();
    const db = await databaseManager.getDatabase(table.getTableName());
    const first = await table.repairStuckPendingFlags();
    expect(first.repaired).toEqual(['e1']);

    // The repair reset the cursor; stand in for the sync that then advanced it.
    await table.updateSyncMetadata({ lastIncrementalSyncAt: CURSOR }, { scopeValue: 'show-1' });
    const second = await table.repairStuckPendingFlags();

    expect(second).toEqual({ repaired: [], kept: [] });
    const meta = await db.get(REPLICATION_STORES.SYNC_METADATA, table.getTableName());
    expect(meta.scopes['show-1'].lastIncrementalSyncAt).toBe(CURSOR);
  });

  it('repairs only on the first sync pass of a table instance', async () => {
    await seedCursor();
    const adapter = adapterFor([]);
    await syncReplicatedTable(table, adapter, { value: 'show-1' });
    await table.set('e1', stuckRow('e1'));

    await syncReplicatedTable(table, adapter, { value: 'show-1' });

    expect((await table.get('e1'))?._syncStatus).toBe('pending');
  });
});
