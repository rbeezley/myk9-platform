import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedTable } from './core/ReplicatedTable';
import { ReplicatedTableCacheManager } from './core/ReplicatedTableCache';
import { syncReplicatedTable, type SyncReplicatedTableAdapter } from './syncReplicatedTable';
import { parseUpdatedAtMs, REPLICATION_INCREMENTAL_BUFFER_MS } from './parseUpdatedAt';
import type { SyncResult } from './types';

/**
 * MYK9-1332: an incremental pass asks the server for rows changed since the
 * watermark minus a 60 s buffer, so the rows at the watermark come back on
 * every pass of a quiet table. Storing them again is bookkeeping, not a change:
 * subscribers (the dog rosters' cache listener among them) must not hear about
 * it, or every pass refetches reads that cost a server round trip each.
 */

interface LocalRow {
  id: string;
  name: string;
}
interface RemoteRow extends LocalRow {
  updated_at: string;
}

class QuietTable extends ReplicatedTable<LocalRow> {
  async sync(): Promise<SyncResult> {
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

const STAMP = '2026-10-23T15:34:00.000Z';
const rows: RemoteRow[] = [
  { id: 'reg-1', name: 'Rex', updated_at: STAMP },
  { id: 'reg-2', name: 'Buddy', updated_at: STAMP },
];

function adapter(remote: () => RemoteRow[]): SyncReplicatedTableAdapter<RemoteRow, LocalRow> {
  return {
    fetchRemoteRows: vi.fn(async () => remote()),
    getRemoteRowCount: vi.fn(async () => remote().length),
    getRemoteId: r => r.id,
    getRemoteUpdatedAt: r => parseUpdatedAtMs(r.updated_at),
    toLocalRow: r => ({ id: r.id, name: r.name }),
  };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 10));

describe('a pass that re-downloads unchanged rows (MYK9-1332)', () => {
  let table: QuietTable;
  let notifyListeners: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
    table = new QuietTable(`quiet_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    notifyListeners = vi.spyOn(ReplicatedTableCacheManager.prototype, 'notifyListeners');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
  });

  it('asks for the rows inside the buffer again, stores them, and stays silent', async () => {
    const remote = adapter(() => rows);
    const first = await syncReplicatedTable(
      table,
      remote,
      {},
      {
        incrementalBufferMs: REPLICATION_INCREMENTAL_BUFFER_MS,
      }
    );
    expect(first.success).toBe(true);
    await settle();
    expect(notifyListeners).toHaveBeenCalled();
    const stored = await table.getAll();
    expect(stored.map(r => r.id).sort()).toEqual(['reg-1', 'reg-2']);
    notifyListeners.mockClear();

    const second = await syncReplicatedTable(
      table,
      remote,
      {},
      {
        incrementalBufferMs: REPLICATION_INCREMENTAL_BUFFER_MS,
      }
    );
    await settle();

    expect(second.success).toBe(true);
    // Positive control for the premise: the second pass did fetch inside the buffer.
    expect(remote.fetchRemoteRows).toHaveBeenCalledTimes(2);
    expect(remote.fetchRemoteRows).toHaveBeenLastCalledWith(
      expect.objectContaining({
        since: Date.parse(STAMP) - REPLICATION_INCREMENTAL_BUFFER_MS,
      })
    );
    expect(notifyListeners).not.toHaveBeenCalled();
    expect(await table.getAll()).toEqual(stored);
  });

  it('still tells subscribers when one of those rows did change', async () => {
    let current = rows;
    const remote = adapter(() => current);
    await syncReplicatedTable(
      table,
      remote,
      {},
      {
        incrementalBufferMs: REPLICATION_INCREMENTAL_BUFFER_MS,
      }
    );
    await settle();
    notifyListeners.mockClear();

    current = [rows[0]!, { ...rows[1]!, name: 'Buddy II', updated_at: '2026-10-23T15:34:30.000Z' }];
    await syncReplicatedTable(
      table,
      remote,
      {},
      {
        incrementalBufferMs: REPLICATION_INCREMENTAL_BUFFER_MS,
      }
    );
    await settle();

    expect(notifyListeners).toHaveBeenCalled();
    expect((await table.getAll()).find(r => r.id === 'reg-2')?.name).toBe('Buddy II');
  });
});
