import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplicatedClass, ReplicatedTrial } from '@/services/replication';

const replicationMocks = vi.hoisted(() => ({
  classesGetAllWithStatus: vi.fn(),
  trialsGetAllWithStatus: vi.fn(),
  classesSubscribe: vi.fn<
    (
      callback: (rows: unknown[]) => void,
      options?: { onError?: (error: unknown) => void }
    ) => () => void
  >(() => vi.fn()),
  trialsSubscribe: vi.fn<
    (
      callback: (rows: unknown[]) => void,
      options?: { onError?: (error: unknown) => void }
    ) => () => void
  >(() => vi.fn()),
}));

vi.mock('@/services/replication', () => ({
  replicatedTrialsTable: {
    getAllWithStatus: replicationMocks.trialsGetAllWithStatus,
    subscribe: replicationMocks.trialsSubscribe,
  },
  replicatedClassesTable: {
    getAllWithStatus: replicationMocks.classesGetAllWithStatus,
    subscribe: replicationMocks.classesSubscribe,
  },
}));

vi.mock('@/config/dataSource', () => ({
  shouldUseMockData: () => false,
}));

import { useTrialStore } from './trialStore';

const TRIAL: ReplicatedTrial = {
  id: 'trial-1',
  showId: 'show-1',
  name: 'Trial 1',
  date: '2026-08-28',
};

const TRIAL_CLASS: ReplicatedClass = {
  id: 'class-1',
  trialId: 'trial-1',
  name: 'Novice Containers',
  element: 'Containers',
  level: 'Novice',
};

type ReadState = {
  trialsReadStatus: string;
  trialsReadError: string | null;
  trialsHasConfirmedSnapshot: boolean;
  trialClassesReadStatus: string;
  trialClassesReadError: string | null;
  trialClassesHasConfirmedSnapshot: boolean;
};

function readState(): ReadState {
  return useTrialStore.getState() as unknown as ReadState;
}

describe('trialStore replicated read status', () => {
  beforeEach(() => {
    useTrialStore.setState(useTrialStore.getInitialState(), true);
    replicationMocks.trialsGetAllWithStatus.mockReset();
    replicationMocks.classesGetAllWithStatus.mockReset();
    replicationMocks.trialsSubscribe.mockClear();
    replicationMocks.classesSubscribe.mockClear();
  });

  it('records a successful confirmed-empty snapshot independently for each dataset', async () => {
    replicationMocks.trialsGetAllWithStatus.mockResolvedValue({
      ok: true,
      rows: [],
      error: null,
    });
    replicationMocks.classesGetAllWithStatus.mockResolvedValue({
      ok: true,
      rows: [],
      error: null,
    });

    await Promise.all([
      useTrialStore.getState().loadTrials(),
      useTrialStore.getState().loadTrialClasses(),
    ]);

    expect(readState()).toMatchObject({
      trialsReadStatus: 'ready',
      trialsReadError: null,
      trialsHasConfirmedSnapshot: true,
      trialClassesReadStatus: 'ready',
      trialClassesReadError: null,
      trialClassesHasConfirmedSnapshot: true,
    });
  });

  it('preserves the last confirmed Trial and Class snapshots when refreshes fail', async () => {
    replicationMocks.trialsGetAllWithStatus.mockResolvedValueOnce({
      ok: true,
      rows: [TRIAL],
      error: null,
    });
    replicationMocks.classesGetAllWithStatus.mockResolvedValueOnce({
      ok: true,
      rows: [TRIAL_CLASS],
      error: null,
    });
    await Promise.all([
      useTrialStore.getState().loadTrials(),
      useTrialStore.getState().loadTrialClasses(),
    ]);

    replicationMocks.trialsGetAllWithStatus.mockResolvedValueOnce({
      ok: false,
      rows: [],
      error: new Error('Trial read failed'),
    });
    replicationMocks.classesGetAllWithStatus.mockResolvedValueOnce({
      ok: false,
      rows: [],
      error: new Error('Class read failed'),
    });
    await Promise.all([
      useTrialStore.getState().loadTrials(),
      useTrialStore.getState().loadTrialClasses(),
    ]);

    expect(useTrialStore.getState().trials).toHaveLength(1);
    expect(useTrialStore.getState().trialClasses['trial-1']).toHaveLength(1);
    expect(readState()).toMatchObject({
      trialsReadStatus: 'error',
      trialsReadError: 'Trial read failed',
      trialsHasConfirmedSnapshot: true,
      trialClassesReadStatus: 'error',
      trialClassesReadError: 'Class read failed',
      trialClassesHasConfirmedSnapshot: true,
    });
  });

  it('retains confirmed-snapshot evidence when an empty dataset later fails to refresh', async () => {
    replicationMocks.trialsGetAllWithStatus
      .mockResolvedValueOnce({ ok: true, rows: [], error: null })
      .mockResolvedValueOnce({ ok: false, rows: [], error: new Error('Trial read failed') });
    replicationMocks.classesGetAllWithStatus
      .mockResolvedValueOnce({ ok: true, rows: [], error: null })
      .mockResolvedValueOnce({ ok: false, rows: [], error: new Error('Class read failed') });

    await Promise.all([
      useTrialStore.getState().loadTrials(),
      useTrialStore.getState().loadTrialClasses(),
    ]);
    await Promise.all([
      useTrialStore.getState().loadTrials(),
      useTrialStore.getState().loadTrialClasses(),
    ]);

    expect(readState()).toMatchObject({
      trialsReadStatus: 'error',
      trialsHasConfirmedSnapshot: true,
      trialClassesReadStatus: 'error',
      trialClassesHasConfirmedSnapshot: true,
    });
    expect(useTrialStore.getState().trials).toEqual([]);
    expect(useTrialStore.getState().trialClasses).toEqual({});
  });

  it('clears read failures after a successful retry', async () => {
    replicationMocks.trialsGetAllWithStatus
      .mockResolvedValueOnce({ ok: false, rows: [], error: new Error('Trial read failed') })
      .mockResolvedValueOnce({ ok: true, rows: [TRIAL], error: null });
    replicationMocks.classesGetAllWithStatus
      .mockResolvedValueOnce({ ok: false, rows: [], error: new Error('Class read failed') })
      .mockResolvedValueOnce({ ok: true, rows: [TRIAL_CLASS], error: null });

    await Promise.all([
      useTrialStore.getState().loadTrials(),
      useTrialStore.getState().loadTrialClasses(),
    ]);
    await Promise.all([
      useTrialStore.getState().loadTrials(),
      useTrialStore.getState().loadTrialClasses(),
    ]);

    expect(readState()).toMatchObject({
      trialsReadStatus: 'ready',
      trialsReadError: null,
      trialsHasConfirmedSnapshot: true,
      trialClassesReadStatus: 'ready',
      trialClassesReadError: null,
      trialClassesHasConfirmedSnapshot: true,
    });
  });

  it('marks confirmed snapshots stale when subscription refresh reads fail', async () => {
    replicationMocks.trialsGetAllWithStatus.mockResolvedValue({
      ok: true,
      rows: [TRIAL],
      error: null,
    });
    replicationMocks.classesGetAllWithStatus.mockResolvedValue({
      ok: true,
      rows: [TRIAL_CLASS],
      error: null,
    });

    useTrialStore.getState().initializeSubscription();
    await vi.waitFor(() => {
      expect(readState()).toMatchObject({
        trialsReadStatus: 'ready',
        trialClassesReadStatus: 'ready',
      });
    });

    const trialOptions = replicationMocks.trialsSubscribe.mock.calls[0]?.[1];
    const classOptions = replicationMocks.classesSubscribe.mock.calls[0]?.[1];
    trialOptions?.onError?.(new Error('Trial subscription read failed'));
    classOptions?.onError?.(new Error('Class subscription read failed'));

    expect(readState()).toMatchObject({
      trialsReadStatus: 'error',
      trialsReadError: 'Trial subscription read failed',
      trialsHasConfirmedSnapshot: true,
      trialClassesReadStatus: 'error',
      trialClassesReadError: 'Class subscription read failed',
      trialClassesHasConfirmedSnapshot: true,
    });
    expect(useTrialStore.getState().trials).toHaveLength(1);
    expect(useTrialStore.getState().trialClasses['trial-1']).toHaveLength(1);
  });
});
