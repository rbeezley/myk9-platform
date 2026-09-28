import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrialInput } from '../trial-store-types';

/**
 * `addTrial` is the write hop between the wizard's `TrialInput` and the
 * `ReplicatedTrial` handed to `replicatedTrialsTable.createTrial`. Migration
 * 192 requires every trial to carry a timezone; MYK9-831 found this hop
 * silently dropped a `TrialInput.timezone` the caller had already set,
 * leaving the offline and add-trials wizard paths unable to save the
 * secretary's chosen zone even after the online RPC path was fixed.
 */
const replicationMocks = vi.hoisted(() => ({
  createTrial: vi.fn(),
}));

vi.mock('@/services/replication', () => ({
  replicatedTrialsTable: {
    createTrial: replicationMocks.createTrial,
  },
  replicatedClassesTable: {},
}));

import { useTrialStore } from '../trialStore';

const BASE_INPUT: TrialInput = {
  showId: 'show-1',
  showName: 'Spring Trial',
  name: 'Saturday Trial',
  trialDate: '2026-06-12',
  trialNumber: 'Saturday Trial',
  status: 'Upcoming',
};

describe('trialStore.addTrial — timezone write path (MYK9-831)', () => {
  beforeEach(() => {
    useTrialStore.setState(useTrialStore.getInitialState(), true);
    replicationMocks.createTrial.mockReset();
    replicationMocks.createTrial.mockImplementation(async trial => trial);
  });

  it('threads TrialInput.timezone into the ReplicatedTrial passed to createTrial', async () => {
    await useTrialStore
      .getState()
      .addTrial({ ...BASE_INPUT, timezone: 'America/Chicago' }, 'user-1');

    expect(replicationMocks.createTrial).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: 'America/Chicago' })
    );
  });

  it('passes undefined through when the wizard never set a timezone', async () => {
    await useTrialStore.getState().addTrial({ ...BASE_INPUT }, 'user-1');

    expect(replicationMocks.createTrial).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: undefined })
    );
  });
});
