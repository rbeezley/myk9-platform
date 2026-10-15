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
  subscribe: vi.fn(),
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
    subscribe: mocks.subscribe,
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

/**
 * MYK9-1162: a held sheet unlocks itself once sync brings the entry back with the
 * hold cleared, without the judge leaving the page.
 */
describe('useAtShowScoresheet held entry', () => {
  let notify: () => void = () => undefined;
  let held = true;

  beforeEach(() => {
    vi.resetAllMocks();
    held = true;
    mocks.getTrialsByShow.mockResolvedValue([{ id: 'trial-1' }]);
    mocks.getTrialById.mockResolvedValue({ id: 'trial-1', date: '2026-07-24', trialNumber: '1' });
    mocks.getClassById.mockResolvedValue({ id: 'canonical-class', trialId: 'trial-1' });
    mocks.getEntriesByClass.mockImplementation(async () => [
      {
        id: 'entry-1',
        dogId: 'dog-1',
        checkInStatus: 'checked-in',
        awaitingRegistrationNumber: held,
      },
    ]);
    mocks.getDog.mockResolvedValue({ id: 'dog-1', name: 'Rex' });
    mocks.subscribe.mockImplementation((listener: () => void) => {
      notify = listener;
      return () => undefined;
    });
  });

  function renderScoresheet() {
    return renderHook(() =>
      useAtShowScoresheet({
        showId: 'show-1',
        classId: 'route-class',
        entryId: 'entry-1',
        onScored: vi.fn(),
      })
    );
  }

  it('unlocks when a replica change brings the entry back with the hold cleared', async () => {
    const { result } = renderScoresheet();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.awaitingRegistrationNumber).toBe(true);
    expect(mocks.transitionToInRing).not.toHaveBeenCalled();

    held = false;
    await act(async () => {
      notify();
    });

    await waitFor(() => expect(result.current.awaitingRegistrationNumber).toBe(false));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('stays locked through a replica change that leaves it held', async () => {
    const { result } = renderScoresheet();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const loads = mocks.getClassById.mock.calls.length;

    await act(async () => {
      notify();
    });

    expect(result.current.awaitingRegistrationNumber).toBe(true);
    expect(mocks.getClassById.mock.calls.length).toBe(loads);
  });
});
