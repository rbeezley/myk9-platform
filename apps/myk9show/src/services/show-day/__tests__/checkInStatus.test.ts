import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateReplicatedCheckInStatus } from '../checkInStatus';

const { updateEntryMock } = vi.hoisted(() => ({
  updateEntryMock: vi.fn(),
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    updateEntry: updateEntryMock,
  },
}));

describe('updateReplicatedCheckInStatus', () => {
  beforeEach(() => {
    updateEntryMock.mockReset();
    updateEntryMock.mockResolvedValue('mutation-1');
  });

  it('queues check-in status using the replicated entry table fields', async () => {
    await expect(updateReplicatedCheckInStatus('entry-1', 'checked-in')).resolves.toBe(
      'mutation-1'
    );

    expect(updateEntryMock).toHaveBeenCalledWith('entry-1', {
      checkInStatus: 'checked-in',
      check_in_status: 'checked-in',
    });
    expect(updateEntryMock.mock.calls[0]?.[1]).not.toHaveProperty('result_status');
  });
});
