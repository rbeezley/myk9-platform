import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateEntry = vi.fn<(id: string, updates: Record<string, unknown>) => Promise<string | null>>(
  () => Promise.resolve('mutation-1')
);
const updateCheckInStatus = vi.fn<(id: string, status: string) => Promise<string | null>>(() =>
  Promise.resolve('mutation-1')
);

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    updateEntry: (id: string, updates: Record<string, unknown>) => updateEntry(id, updates),
    updateCheckInStatus: (id: string, status: string) => updateCheckInStatus(id, status),
  },
}));

import { updateReplicatedCheckInStatus, updateReplicatedDayOfScratch } from '../checkInStatus';

describe('updateReplicatedCheckInStatus', () => {
  beforeEach(() => {
    updateEntry.mockClear();
    updateCheckInStatus.mockClear();
  });

  it('queues check-in status through the narrow replicated entry mutation', async () => {
    await expect(updateReplicatedCheckInStatus('entry-1', 'checked-in')).resolves.toBe(
      'mutation-1'
    );

    expect(updateCheckInStatus).toHaveBeenCalledWith('entry-1', 'checked-in');
    expect(updateEntry).not.toHaveBeenCalled();
  });

  it('queues day-of scratch through replicated entry status and check-in status fields', async () => {
    await expect(updateReplicatedDayOfScratch('entry-1', 'Dog absent')).resolves.toBe(
      'mutation-1'
    );

    expect(updateEntry).toHaveBeenCalledWith('entry-1', {
      entryStatus: 'scratched',
      entry_status: 'scratched',
      checkInStatus: 'pulled',
      check_in_status: 'pulled',
      withdrawalReason: 'Dog absent',
      withdrawal_reason: 'Dog absent',
      specialRequests: 'Dog absent',
      special_requests: 'Dog absent',
    });
    expect(updateCheckInStatus).not.toHaveBeenCalled();
  });
});
