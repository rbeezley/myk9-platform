import { beforeEach, describe, expect, it, vi } from 'vitest';
import { transitionToCompleted, transitionToInRing } from './checkInTransitions';
import { updateReplicatedCheckInStatus } from '@/services/show-day/checkInStatus';

vi.mock('@/services/show-day/checkInStatus', () => ({
  updateReplicatedCheckInStatus: vi.fn().mockResolvedValue(undefined),
}));

describe('checkInTransitions', () => {
  beforeEach(() => {
    vi.mocked(updateReplicatedCheckInStatus).mockClear();
  });

  it('moves scoring-opened entries to in-ring through the replicated helper', () => {
    transitionToInRing('entry-1', 'checked-in');

    expect(updateReplicatedCheckInStatus).toHaveBeenCalledOnce();
    expect(updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', 'in-ring', {
      ring_entry_time: expect.any(String),
    });
  });

  it('does not re-stamp ring_entry_time for an entry already in-ring (Resume)', () => {
    transitionToInRing('entry-1', 'in-ring');

    expect(updateReplicatedCheckInStatus).not.toHaveBeenCalled();
  });

  it('does not reopen a completed entry', () => {
    transitionToInRing('entry-1', 'completed');

    expect(updateReplicatedCheckInStatus).not.toHaveBeenCalled();
  });

  it('moves scored entries to completed through the replicated helper', () => {
    transitionToCompleted('entry-1');

    expect(updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', 'completed', {
      ring_exit_time: expect.any(String),
    });
  });
});
