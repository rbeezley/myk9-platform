import { beforeEach, describe, expect, it, vi } from 'vitest';
import { replicatedTrialsTable } from '@/services/replication';
import type { SyncableTrial } from '../trial-store-types';
import { useTrialStore } from '../trialStore';

// MYK9-2450: the trial edit panel submits the whole trial. A device holding an old copy (cached
// before another device closed the show) must not send that old status or the old actual times
// with an unrelated edit; they go only when the save changed them.

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

const staleTrial = {
  id: 't1',
  name: 'Saturday',
  status: 'in_progress',
  timeStarted: '2026-06-12T13:00:42.000Z',
} as unknown as SyncableTrial;

const sentUpdates = () => vi.mocked(replicatedTrialsTable.updateTrial).mock.calls[0]?.[1];

describe('trialStore.updateTrial status and actual times', () => {
  beforeEach(() => {
    vi.mocked(replicatedTrialsTable.updateTrial).mockClear();
    useTrialStore.setState({ trials: [staleTrial] });
  });

  it('a rename that resubmits the unchanged status and times does not send them', async () => {
    // What the edit panel sends: every field, the untouched time back without its seconds, and
    // the status in the form's spelling.
    await useTrialStore.getState().updateTrial(
      't1',
      {
        name: 'Saturday AM',
        status: 'In Progress',
        timeStarted: '2026-06-12T13:00:00.000Z',
        timeEnded: '',
      },
      'u1'
    );

    const updates = sentUpdates();
    expect(updates).toHaveProperty('name', 'Saturday AM');
    expect(updates).not.toHaveProperty('status');
    expect(updates).not.toHaveProperty('actualStartTime');
    expect(updates).not.toHaveProperty('actualEndTime');
  });

  it('a changed status is sent', async () => {
    await useTrialStore.getState().updateTrial('t1', { status: 'Completed' }, 'u1');

    expect(sentUpdates()).toHaveProperty('status', 'Completed');
  });

  it('a changed actual start and a new actual finish are sent', async () => {
    await useTrialStore
      .getState()
      .updateTrial(
        't1',
        { timeStarted: '2026-06-12T13:05:00.000Z', timeEnded: '2026-06-12T21:00:00.000Z' },
        'u1'
      );

    const updates = sentUpdates();
    expect(updates).toHaveProperty('actualStartTime', '2026-06-12T13:05:00.000Z');
    expect(updates).toHaveProperty('actualEndTime', '2026-06-12T21:00:00.000Z');
  });
});
