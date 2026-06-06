import { describe, expect, it, vi } from 'vitest';
import { updateReplicatedCheckInStatus } from '../checkInStatus';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    updateEntry: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('updateReplicatedCheckInStatus', () => {
  it('writes both replicated model and database check-in fields', async () => {
    await updateReplicatedCheckInStatus('entry-1', 'checked-in', {
      ring_entry_time: '2026-05-18T12:00:00.000Z',
    });

    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith('entry-1', {
      checkInStatus: 'checked-in',
      check_in_status: 'checked-in',
      ring_entry_time: '2026-05-18T12:00:00.000Z',
    });
  });
});
