import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedTable } from './core/ReplicatedTable';
import { syncReplicatedTable, type SyncReplicatedTableAdapter } from './syncReplicatedTable';
import type { SyncOptions, SyncResult } from './types';

interface Row {
  id: string;
  name: string;
}

class TestTable extends ReplicatedTable<Row> {
  async sync(_scope: string, _options?: Partial<SyncOptions>): Promise<SyncResult> {
    throw new Error('not used');
  }

  protected resolveConflict(_local: Row, remote: Row): Row {
    return remote;
  }
}

function adapterFor(rows: () => Array<{ id: number; name: string }>) {
  const adapter: SyncReplicatedTableAdapter<{ id: number; name: string }, Row> = {
    fetchRemoteRows: vi.fn(async () => rows()),
    getRemoteId: remote => String(remote.id),
    toLocalRow: remote => ({ id: String(remote.id), name: remote.name }),
  };
  return adapter;
}

// MYK9-1054: the incremental overlap window re-delivers rows this device already
// holds. Identical re-delivery is not a change: it must not report rowsAffected
// and must not notify subscribers (each notify refetches every query on the table).
describe('syncReplicatedTable: unchanged re-delivery', () => {
  let table: TestTable;

  beforeEach(async () => {
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
    table = new TestTable(`redelivery_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  });

  afterEach(async () => {
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
  });

  it('reports no rows affected and does not notify when the same rows come back', async () => {
    const rows = [{ id: 1, name: 'Rex' }];
    const adapter = adapterFor(() => rows);
    await syncReplicatedTable(table, adapter);

    const callback = vi.fn();
    table.subscribe(callback, { emitCurrent: false });
    await new Promise(resolve => setTimeout(resolve, 400));
    callback.mockClear();

    const second = await syncReplicatedTable(table, adapter, {}, { forceFullSync: true });

    expect(second.success).toBe(true);
    expect(second.rowsAffected).toBe(0);
    await new Promise(resolve => setTimeout(resolve, 400));
    expect(callback).not.toHaveBeenCalled();
  });

  it('counts only the row whose content differs and still notifies', async () => {
    let rows = [
      { id: 1, name: 'Rex' },
      { id: 2, name: 'Fido' },
    ];
    const adapter = adapterFor(() => rows);
    await syncReplicatedTable(table, adapter);

    const callback = vi.fn();
    table.subscribe(callback, { emitCurrent: false });
    await new Promise(resolve => setTimeout(resolve, 400));
    callback.mockClear();

    rows = [
      { id: 1, name: 'Rex' },
      { id: 2, name: 'Fido II' },
    ];
    const second = await syncReplicatedTable(table, adapter, {}, { forceFullSync: true });

    expect(second.rowsAffected).toBe(1);
    expect(await table.get('2')).toMatchObject({ name: 'Fido II' });
    await new Promise(resolve => setTimeout(resolve, 400));
    expect(callback).toHaveBeenCalled();
  });
});
