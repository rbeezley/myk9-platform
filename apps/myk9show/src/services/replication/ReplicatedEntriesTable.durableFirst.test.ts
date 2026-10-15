/**
 * MYK9-1206: updateCheckInStatus and updateEntryStatus are durable-first like
 * updateEntry. When queueing the mutation rejects, no dirty row may be left
 * behind (repairStuckPendingFlags skips dirty rows and nothing re-queues an
 * orphan) and the caller sees the error.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseManager, REPLICATION_STORES } from '@myk9/replication';
import { ReplicatedEntriesTable, type ReplicatedEntry } from './ReplicatedEntriesTable';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));

type QueueMutation = (...args: unknown[]) => Promise<string | null>;

describe('ReplicatedEntriesTable durable-first status writers (MYK9-1206)', () => {
  let table: ReplicatedEntriesTable;
  const seed: ReplicatedEntry = {
    id: 'entry-1',
    classId: 'class-1',
    showId: 'show-1',
    armband: '101',
    status: 'registered',
    checkInStatus: 'no-status',
    check_in_status: 'no-status',
  };

  beforeEach(async () => {
    await databaseManager.reset();
    table = new ReplicatedEntriesTable();
    await table.set('entry-1', seed, false, undefined, undefined, {
      allowColdInsert: 'test fixture standing in for the sync download',
    });
  });

  async function isRowDirty(): Promise<boolean | undefined> {
    const db = await databaseManager.getDatabase('entries');
    const row = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, ['entries', 'entry-1'])) as
      { isDirty?: boolean } | undefined;
    return row?.isDirty;
  }

  function rejectQueue() {
    return vi
      .spyOn(table as unknown as { queueMutation: QueueMutation }, 'queueMutation')
      .mockRejectedValue(new Error('queue overflow'));
  }

  it('check-in: a rejected queueMutation leaves the row clean and rejects the caller', async () => {
    const queueMutation = rejectQueue();

    await expect(table.updateCheckInStatus('entry-1', 'checked-in')).rejects.toThrow(
      'queue overflow'
    );

    expect(queueMutation).toHaveBeenCalledTimes(1);
    const row = await table.get('entry-1');
    expect(row?.checkInStatus).toBe('no-status');
    expect(await isRowDirty()).toBe(false);
  });

  it('status change: a rejected queueMutation leaves the row clean and rejects the caller', async () => {
    const queueMutation = rejectQueue();

    await expect(table.updateEntryStatus('entry-1', 'checked-in')).rejects.toThrow(
      'queue overflow'
    );

    expect(queueMutation).toHaveBeenCalledTimes(1);
    const row = await table.get('entry-1');
    expect(row?.status).toBe('registered');
    expect(await isRowDirty()).toBe(false);
  });
});
