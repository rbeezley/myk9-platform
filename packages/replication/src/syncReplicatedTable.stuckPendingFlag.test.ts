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
  judgeName?: string | undefined;
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

function adapterFor(
  server: Row[],
  fetchRowsById?: (ids: string[]) => Promise<Row[]>
): SyncReplicatedTableAdapter<Row, Row> {
  return {
    fetchRemoteRows: vi.fn(async ({ since }) => server.filter(r => r.updated_at > since)),
    fetchRowsById: vi.fn(
      fetchRowsById ?? (async (ids: string[]) => server.filter(r => ids.includes(r.id)))
    ),
    filterLocalRows: rows => rows,
    getRemoteId: row => row.id,
    getRemoteUpdatedAt: row => row.updated_at,
    toLocalRow: row => ({ ...row, _syncStatus: 'synced' }),
    // Mirrors the classes table: enrichment the remote lacks survives from local.
    resolveConflict: (local, remote) => ({
      ...(local._syncStatus === 'pending' ? local : remote),
      judgeName: remote.judgeName ?? local.judgeName,
    }),
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

  async function sync(adapter: SyncReplicatedTableAdapter<Row, Row>) {
    return syncReplicatedTable(table, adapter, { value: 'show-1' });
  }

  async function hold(store: string, rowId: string) {
    const db = await databaseManager.getDatabase(table.getTableName());
    await db.put(store, mutation(`m-${rowId}`, rowId, table.getTableName()));
  }

  it('delivers the server placement a stuck clean row hid, past the sync cursor', async () => {
    await table.set('e1', stuckRow('e1'));
    await seedCursor();

    await sync(adapterFor([serverRow('e1')]));

    const row = await table.get('e1');
    expect(row?.final_placement).toBe(1);
    expect(row?._syncStatus).toBe('synced');
  });

  it('keeps what the table resolveConflict preserves, e.g. cached enrichment', async () => {
    await table.set('e1', { ...stuckRow('e1'), judgeName: 'Cached Judge' });
    await seedCursor();

    await sync(adapterFor([serverRow('e1')]));

    const row = await table.get('e1');
    expect(row?.judgeName).toBe('Cached Judge');
    expect(row?.final_placement).toBe(1);
  });

  it('never resets the sync cursor', async () => {
    await table.set('e1', stuckRow('e1'));
    await seedCursor();
    const db = await databaseManager.getDatabase(table.getTableName());
    const adapter = adapterFor([serverRow('e1')]);

    await table.repairStuckPendingFlags(adapter as never);

    const meta = await db.get(REPLICATION_STORES.SYNC_METADATA, table.getTableName());
    expect(meta.scopes['show-1'].lastIncrementalSyncAt).toBe(CURSOR);
  });

  it('never fetches or touches a dirty row', async () => {
    await table.set('e1', { ...stuckRow('e1'), final_placement: 9 }, true);
    await seedCursor();
    const adapter = adapterFor([serverRow('e1')]);

    await sync(adapter);

    expect(adapter.fetchRowsById).not.toHaveBeenCalled();
    const row = await table.get('e1');
    expect(row?.final_placement).toBe(9);
    expect(row?._syncStatus).toBe('pending');
  });

  it.each([
    REPLICATION_STORES.PENDING_MUTATIONS,
    REPLICATION_STORES.FAILED_MUTATIONS,
    REPLICATION_STORES.OFFLINE_QUEUE,
  ])('never fetches or touches a row %s names', async store => {
    await table.set('held', stuckRow('held'));
    await table.set('plain', { ...stuckRow('plain'), _syncStatus: 'synced', final_placement: 9 });
    await seedCursor();
    await hold(store, 'held');
    await hold(store, 'plain');
    const adapter = adapterFor([serverRow('held'), serverRow('plain')]);

    await sync(adapter);

    expect(adapter.fetchRowsById).not.toHaveBeenCalled();
    expect((await table.get('held'))?._syncStatus).toBe('pending');
    expect((await table.get('plain'))?.final_placement).toBe(9);
  });

  it('repairs the stuck row and leaves queue-held rows alone in a mixed table', async () => {
    await table.set('e1', stuckRow('e1'));
    await table.set('held', stuckRow('held'));
    await seedCursor();
    await hold(REPLICATION_STORES.FAILED_MUTATIONS, 'held');
    const adapter = adapterFor([serverRow('e1'), serverRow('held')]);

    await sync(adapter);

    expect(adapter.fetchRowsById).toHaveBeenCalledWith(['e1']);
    expect((await table.get('e1'))?.final_placement).toBe(1);
    expect((await table.get('held'))?.final_placement).toBeUndefined();
  });

  it('skips a row that gains a mutation between the fetch and the write', async () => {
    await table.set('e1', stuckRow('e1'));
    await table.set('e2', stuckRow('e2'));
    await seedCursor();
    const adapter = adapterFor([serverRow('e1'), serverRow('e2')], async ids => {
      await hold(REPLICATION_STORES.PENDING_MUTATIONS, 'e1');
      return [serverRow('e1'), serverRow('e2')].filter(r => ids.includes(r.id));
    });

    await sync(adapter);

    expect((await table.get('e1'))?._syncStatus).toBe('pending');
    expect((await table.get('e1'))?.final_placement).toBeUndefined();
    expect((await table.get('e2'))?.final_placement).toBe(1);
  });

  it('skips a row that turns dirty between the fetch and the write', async () => {
    await table.set('e1', stuckRow('e1'));
    await seedCursor();
    const adapter = adapterFor([], async () => {
      await table.set('e1', { ...stuckRow('e1'), final_placement: 9 }, true);
      return [serverRow('e1')];
    });

    await sync(adapter);

    expect((await table.get('e1'))?.final_placement).toBe(9);
  });

  it('only normalizes the flag when the server returns no copy', async () => {
    await table.set('gone', stuckRow('gone'));
    await seedCursor();

    await sync(adapterFor([]));

    const row = await table.get('gone');
    expect(row?._syncStatus).toBe('synced');
  });

  it('changes nothing when the fetch fails, and retries on the next pass', async () => {
    await table.set('e1', stuckRow('e1'));
    await seedCursor();
    const failing = adapterFor([], async () => Promise.reject(new Error('offline')));

    const result = await sync(failing);

    expect(result.success).toBe(true);
    expect((await table.get('e1'))?._syncStatus).toBe('pending');

    await sync(adapterFor([serverRow('e1')]));

    expect((await table.get('e1'))?.final_placement).toBe(1);
  });

  it('is idempotent: a second run finds nothing and does not fetch', async () => {
    await table.set('e1', stuckRow('e1'));
    await seedCursor();
    const adapter = adapterFor([serverRow('e1')]);
    expect((await table.repairStuckPendingFlags(adapter as never)).refreshed).toEqual(['e1']);

    const second = await table.repairStuckPendingFlags(adapter as never);

    expect(second).toEqual({ refreshed: [], normalized: [], skipped: [] });
    expect(adapter.fetchRowsById).toHaveBeenCalledTimes(1);
  });

  it('repairs only on the first sync pass of a table instance', async () => {
    await seedCursor();
    const adapter = adapterFor([]);
    await sync(adapter);
    await table.set('e1', stuckRow('e1'));

    await sync(adapter);

    expect((await table.get('e1'))?._syncStatus).toBe('pending');
  });
});
