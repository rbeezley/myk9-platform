import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncReplicatedTable, type SyncResult } from '@myk9/replication';
import { ReplicatedEntriesTable } from '../ReplicatedEntriesTable';

vi.mock('@myk9/replication', async importOriginal => ({
  ...(await importOriginal<typeof import('@myk9/replication')>()),
  syncReplicatedTable: vi.fn(),
}));

const result: SyncResult = {
  tableName: 'entries',
  success: true,
  operation: 'incremental-sync',
  rowsAffected: 0,
  duration: 0,
};

beforeEach(() => {
  vi.mocked(syncReplicatedTable).mockReset();
});

describe('entry sync concurrency', () => {
  it('shares an overlapping same-show sync, then allows a fresh refresh', async () => {
    let finish!: (value: SyncResult) => void;
    vi.mocked(syncReplicatedTable).mockReturnValue(
      new Promise(resolve => {
        finish = resolve;
      })
    );
    const table = new ReplicatedEntriesTable();
    const first = table.sync('show-1');
    const second = table.sync(' show-1 ');
    expect(syncReplicatedTable).toHaveBeenCalledTimes(1);
    finish(result);
    await expect(Promise.all([first, second])).resolves.toEqual([result, result]);
    vi.mocked(syncReplicatedTable).mockResolvedValue(result);
    await table.sync('show-1');
    expect(syncReplicatedTable).toHaveBeenCalledTimes(2);
  });

  it('runs different shows concurrently', async () => {
    let finish!: (value: SyncResult) => void;
    vi.mocked(syncReplicatedTable).mockReturnValue(
      new Promise(resolve => {
        finish = resolve;
      })
    );
    const table = new ReplicatedEntriesTable();
    const first = table.sync('show-1');
    const second = table.sync('show-2');
    expect(syncReplicatedTable).toHaveBeenCalledTimes(2);
    expect(vi.mocked(syncReplicatedTable).mock.calls.map(call => call[2])).toEqual([
      { value: 'show-1' },
      { value: 'show-2' },
    ]);
    finish(result);
    await Promise.all([first, second]);
  });

  it('allows retry after failure', async () => {
    vi.mocked(syncReplicatedTable)
      .mockRejectedValueOnce(new Error('network failed'))
      .mockResolvedValue(result);
    const table = new ReplicatedEntriesTable();
    await expect(table.sync('show-1')).rejects.toThrow('network failed');
    await expect(table.sync('show-1')).resolves.toEqual(result);
    await table.sync('show-2');
    expect(syncReplicatedTable).toHaveBeenCalledTimes(3);
  });
});
