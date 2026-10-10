import { describe, expect, it, vi } from 'vitest';
import { replicatedTrialsTable } from '@/services/replication';
import type { SyncableTrial } from '../trial-store-types';
import { useTrialStore } from '../trialStore';

// MYK9-1086: a cleared actual time arrives as ''. trials.actual_*_time are timestamptz, so the
// replicated update must carry an explicit undefined (written as NULL), never '' (rejected at sync).

vi.mock('@/services/replication', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/replication')>();
  return {
    ...actual,
    replicatedTrialsTable: {
      ...actual.replicatedTrialsTable,
      get: vi.fn(async () => ({ id: 't1', _version: 1 })),
      updateTrial: vi.fn(async () => 'm1'),
    },
  };
});

describe('trialStore.updateTrial actual times', () => {
  it('clears a blank actual start and finish instead of writing empty text', async () => {
    useTrialStore.setState({
      trials: [{ id: 't1', name: 'Saturday' } as unknown as SyncableTrial],
    });

    await useTrialStore.getState().updateTrial('t1', { timeStarted: '', timeEnded: '' }, 'u1');

    const updates = vi.mocked(replicatedTrialsTable.updateTrial).mock.calls[0]?.[1];
    expect(updates).toHaveProperty('actualStartTime', undefined);
    expect(updates).toHaveProperty('actualEndTime', undefined);
  });
});
