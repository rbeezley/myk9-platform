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
    vi.clearAllMocks();
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

  it('does not record completion, transition, or navigate when score submission fails', async () => {
    const onScored = vi.fn();
    mocks.submitScoreOptimistically.mockImplementation(async (options: SubmitOptions) => {
      options.onError?.(new Error('offline queue unavailable'));
    });
    const { result } = renderScoresheet(onScored);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.submit({ resultText: 'Qualified' } as never);
    });

    expect(result.current.submitError).toContain('offline queue unavailable');
    expect(mocks.recordCompletionIntentIfConfirmed).not.toHaveBeenCalled();
    expect(mocks.transitionToCompleted).not.toHaveBeenCalled();
    expect(onScored).not.toHaveBeenCalled();
  });
});
