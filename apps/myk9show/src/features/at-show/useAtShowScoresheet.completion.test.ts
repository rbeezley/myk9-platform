import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAtShowScoresheet } from './useAtShowScoresheet';

interface SubmitOptions {
  classId: string;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

const mocks = vi.hoisted(() => ({
  submitScoreOptimistically: vi.fn(),
  getClassById: vi.fn(),
  syncClasses: vi.fn(),
  getEntriesByClass: vi.fn(),
  syncEntries: vi.fn(),
  getDog: vi.fn(),
  syncTrials: vi.fn(),
  getTrialsByShow: vi.fn(),
  getTrialById: vi.fn(),
  transitionToInRing: vi.fn(),
  transitionToCompleted: vi.fn(),
  isCurrentFinalPendingEntry: vi.fn(),
  recordCompletionIntentIfConfirmed: vi.fn(),
}));

vi.mock('@/hooks/useOptimisticScoring', () => ({
  useOptimisticScoring: () => ({
    submitScoreOptimistically: mocks.submitScoreOptimistically,
    isSyncing: false,
    hasError: false,
  }),
}));

vi.mock('@/hooks/useReplicationSync', () => ({
  useReplicationSync: () => ({ status: {} }),
}));

vi.mock('@/utils/replicationSyncEmptyState', () => ({
  areReplicationTablesPendingFirstSync: () => false,
}));

vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: {
    getClassById: mocks.getClassById,
    sync: mocks.syncClasses,
  },
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getEntriesByClass: mocks.getEntriesByClass,
    sync: mocks.syncEntries,
  },
}));

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { get: mocks.getDog },
}));

vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: {
    sync: mocks.syncTrials,
    getTrialsByShow: mocks.getTrialsByShow,
    getTrialById: mocks.getTrialById,
  },
}));

vi.mock('@/utils/checkInTransitions', () => ({
  transitionToInRing: mocks.transitionToInRing,
  transitionToCompleted: mocks.transitionToCompleted,
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

vi.mock('@myk9/scoring-ui', () => ({
  buildResolvedClassRules: () => ({}),
}));

vi.mock('@/pages/scoring/types', () => ({
  toScoringEntry: () => ({
    entryId: 'entry-1',
    classId: 'canonical-class',
    armband: 105,
    callName: 'Rex',
    handler: 'Handler',
    breed: 'Beagle',
    status: 'in-ring',
    inRing: true,
    isScored: false,
    exhibitorOrder: 1,
  }),
  toClassInfo: () => ({
    id: 'canonical-class',
    name: 'Container Novice',
    entryCount: 1,
  }),
  resolveSportTypeForClass: () => Promise.resolve('scent-work'),
  toOptimisticScorePayload: () => ({ resultText: 'Qualified' }),
}));

vi.mock('./atShowClassCompletion', () => ({
  isCurrentFinalPendingEntry: mocks.isCurrentFinalPendingEntry,
  recordCompletionIntentIfConfirmed: mocks.recordCompletionIntentIfConfirmed,
}));

describe('useAtShowScoresheet completion wiring', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getTrialsByShow.mockResolvedValue([{ id: 'trial-1' }]);
    mocks.getTrialById.mockResolvedValue({
      id: 'trial-1',
      date: '2026-07-24',
      trialNumber: '1',
    });
    mocks.getClassById.mockResolvedValue({
      id: 'canonical-class',
      trialId: 'trial-1',
    });
    mocks.getEntriesByClass.mockResolvedValue([
      {
        id: 'entry-1',
        dogId: 'dog-1',
        checkInStatus: 'checked-in',
      },
    ]);
    mocks.getDog.mockResolvedValue({ id: 'dog-1', name: 'Rex' });
    mocks.isCurrentFinalPendingEntry.mockResolvedValue(true);
    mocks.recordCompletionIntentIfConfirmed.mockResolvedValue(undefined);
  });

  function renderScoresheet(onScored: () => void) {
    return renderHook(() =>
      useAtShowScoresheet({
        showId: 'show-1',
        classId: 'route-class',
        entryId: 'entry-1',
        onScored,
      })
    );
  }

  it('records confirmed completion before transitioning and navigating after success', async () => {
    const onScored = vi.fn();
    mocks.submitScoreOptimistically.mockImplementation(async (options: SubmitOptions) => {
      options.onSuccess?.();
    });
    const { result } = renderScoresheet(onScored);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.submit({ resultText: 'Qualified' } as never);
    });

    expect(mocks.isCurrentFinalPendingEntry).toHaveBeenCalledWith('canonical-class', 'entry-1');
    expect(mocks.submitScoreOptimistically).toHaveBeenCalledWith(
      expect.objectContaining({ classId: 'canonical-class', entryId: 'entry-1' })
    );
    expect(mocks.recordCompletionIntentIfConfirmed).toHaveBeenCalledWith('canonical-class', true);
    expect(mocks.transitionToCompleted).toHaveBeenCalledWith('entry-1');
    expect(onScored).toHaveBeenCalledTimes(1);
    expect(mocks.recordCompletionIntentIfConfirmed.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.transitionToCompleted.mock.invocationCallOrder[0]
    );
    expect(mocks.transitionToCompleted.mock.invocationCallOrder[0]).toBeLessThan(
      onScored.mock.invocationCallOrder[0]
    );
  });

  it('opens a cached scoresheet without waiting for stalled network sync', async () => {
    mocks.syncTrials.mockReturnValueOnce(new Promise(() => undefined));
    mocks.syncClasses.mockReturnValueOnce(new Promise(() => undefined));
    mocks.syncEntries.mockReturnValueOnce(new Promise(() => undefined));
    const { result } = renderScoresheet(vi.fn());

    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 100 });
    expect(result.current.entry?.entryId).toBe('entry-1');
    expect(result.current.error).toBeNull();
    expect(mocks.syncTrials).not.toHaveBeenCalled();
    expect(mocks.syncClasses).toHaveBeenCalledWith('trial-1');
    expect(mocks.syncEntries).toHaveBeenCalledWith('show-1');
  });

  it('keeps a cached sheet usable when its background refresh rejects', async () => {
    mocks.syncClasses.mockRejectedValue(new Error('offline'));
    const { result } = renderScoresheet(vi.fn());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entry?.entryId).toBe('entry-1');
    expect(result.current.error).toBeNull();
  });

  it('does not carry an explicit correction refresh into the next cached entry', async () => {
    const { result, rerender } = renderHook(
      ({ entryId }) =>
        useAtShowScoresheet({
          showId: 'show-1',
          classId: 'route-class',
          entryId,
          onScored: vi.fn(),
        }),
      { initialProps: { entryId: 'entry-1' } }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.syncTrials).toHaveBeenCalledTimes(1);

    mocks.getEntriesByClass.mockResolvedValue([
      { id: 'entry-2', dogId: 'dog-1', checkInStatus: 'checked-in' },
    ]);
    mocks.syncTrials.mockReturnValue(new Promise(() => undefined));
    mocks.syncClasses.mockReturnValue(new Promise(() => undefined));
    mocks.syncEntries.mockReturnValue(new Promise(() => undefined));
    rerender({ entryId: 'entry-2' });

    await waitFor(() => expect(result.current.loadedEntryId).toBe('entry-2'), { timeout: 100 });
    expect(result.current.isLoading).toBe(false);
    expect(mocks.syncTrials).toHaveBeenCalledTimes(1);
  });

  it('hydrates a missing entry before opening instead of treating a partial cache as complete', async () => {
    mocks.getEntriesByClass.mockResolvedValueOnce([]);
    const { result } = renderScoresheet(vi.fn());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entry?.entryId).toBe('entry-1');
    expect(mocks.syncTrials).toHaveBeenCalledWith('show-1');
    expect(mocks.syncEntries).toHaveBeenCalledWith('show-1');
    expect(mocks.transitionToInRing).toHaveBeenCalledOnce();
  });

  it('does not record completion, transition, or navigate when score submission fails', async () => {
    const onScored = vi.fn();
    mocks.submitScoreOptimistically.mockImplementation(async (options: SubmitOptions) => {
      options.onError?.(new Error('offline queue unavailable'));
    });
    const { result } = renderScoresheet(onScored);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(result.current.submit({ resultText: 'Qualified' } as never)).rejects.toThrow(
        /score was not saved/i
      );
    });

    expect(result.current.submitError).toContain('offline queue unavailable');
    expect(mocks.recordCompletionIntentIfConfirmed).not.toHaveBeenCalled();
    expect(mocks.transitionToCompleted).not.toHaveBeenCalled();
    expect(onScored).not.toHaveBeenCalled();
  });
});
