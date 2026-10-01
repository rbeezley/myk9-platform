import { describe, expect, it, vi } from 'vitest';
import { useTrialStore } from '../trialStore';

// MYK9-900: the edit panel and delete dialog close on success, so updating or deleting a trial
// the store does not hold must REJECT rather than resolve (null / undefined) as if it worked.

vi.mock('@/services/replication', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/replication')>();
  return {
    ...actual,
    replicatedTrialsTable: {
      ...actual.replicatedTrialsTable,
      get: vi.fn(),
      updateTrial: vi.fn(),
      deleteTrial: vi.fn(),
    },
  };
});

describe('trialStore on an unknown trial id', () => {
  it('updateTrial rejects', async () => {
    useTrialStore.setState({ trials: [] });
    await expect(
      useTrialStore.getState().updateTrial('missing', { name: 'x' }, 'u1')
    ).rejects.toThrow(/not found/i);
  });

  it('deleteTrial rejects', async () => {
    useTrialStore.setState({ trials: [] });
    await expect(useTrialStore.getState().deleteTrial('missing')).rejects.toThrow(/not found/i);
  });
});
