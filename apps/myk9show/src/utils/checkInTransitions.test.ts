import { describe, expect, it, vi } from 'vitest';
import { transitionToCompleted, transitionToInRing } from './checkInTransitions';
import { updateReplicatedCheckInStatus } from '@/services/show-day/checkInStatus';

vi.mock('@/services/show-day/checkInStatus', () => ({
  updateReplicatedCheckInStatus: vi.fn().mockResolvedValue(undefined),
}));

describe('checkInTransitions', () => {
  it('moves scoring-opened entries to in-ring through the replicated helper', () => {
    transitionToInRing('entry-1', 'checked-in');

    expect(updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', 'in-ring', {
      ring_entry_time: expect.any(String),
    });
  });

  it('moves scored entries to completed through the replicated helper', () => {
    transitionToCompleted('entry-1');

    expect(updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', 'completed', {
      ring_exit_time: expect.any(String),
    });
  });
});
