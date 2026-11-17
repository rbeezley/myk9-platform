import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  syncShowDates: vi.fn(),
  createTrial: vi.fn(),
  getTrial: vi.fn(),
  updateTrial: vi.fn(),
}));

vi.mock('../deriveShowDatesFromTrials', () => ({ syncReplicatedShowDates: mocks.syncShowDates }));
vi.mock('@/services/replication', () => ({
  replicatedTrialsTable: {
    createTrial: mocks.createTrial,
    get: mocks.getTrial,
    updateTrial: mocks.updateTrial,
  },
  replicatedClassesTable: {},
}));

import { useTrialStore } from '../trialStore';
import type { SyncableTrial } from '../trial-store-types';

describe('trialStore keeps the replicated show dates in step (MYK9-2131)', () => {
  beforeEach(() => {
    useTrialStore.setState(useTrialStore.getInitialState(), true);
    Object.values(mocks).forEach(mock => mock.mockReset());
    mocks.createTrial.mockImplementation(async trial => trial);
    mocks.getTrial.mockResolvedValue({
      id: 't1',
      showId: 'show-1',
      date: '2026-12-05',
      _version: 1,
    });
    useTrialStore.setState({
      trials: [{ id: 't1', showId: 'show-1', trialDate: '2026-12-05' } as SyncableTrial],
    });
  });

  it('after a trial is added', async () => {
    await useTrialStore.getState().addTrial(
      {
        showId: 'show-1',
        showName: 'Show',
        name: 'T',
        trialDate: '2026-12-06',
        trialNumber: '2',
        status: 'Upcoming',
      },
      'user-1'
    );
    expect(mocks.syncShowDates).toHaveBeenCalledWith('show-1');
  });

  it('after a trial day moves', async () => {
    await useTrialStore.getState().updateTrial('t1', { trialDate: '2026-12-12' }, 'user-1');
    expect(mocks.syncShowDates).toHaveBeenCalledWith('show-1');
  });

  it('not when the edit changes neither the day nor the show', async () => {
    await useTrialStore.getState().updateTrial('t1', { name: 'Renamed' }, 'user-1');
    expect(mocks.syncShowDates).not.toHaveBeenCalled();
  });

  it('both shows when a trial moves between them', async () => {
    await useTrialStore.getState().updateTrial('t1', { showId: 'show-2' }, 'user-1');
    expect(mocks.syncShowDates).toHaveBeenCalledWith('show-2');
    expect(mocks.syncShowDates).toHaveBeenCalledWith('show-1');
  });
});
