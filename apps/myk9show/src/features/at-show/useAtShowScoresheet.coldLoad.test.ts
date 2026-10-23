import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAtShowScoresheet } from './useAtShowScoresheet';

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

// The stalled-sync promises below never settle, so a hook that awaited them
// would never leave loading at ANY deadline. The deadline therefore only needs
// to outlast scheduler jitter in a loaded full-suite run (MYK9-1252: 100 ms was
// missed once under load); it does not define "fast".
/**
 * MYK9-1333: a cold scoresheet (the show is not on this device yet) syncs the
 * show first. Under a saturated server one of those syncs can fail; the class or
 * entry is then still missing locally, which is "not loaded yet", not "not
 * found". The judge must not be parked on a terminal error.
 */
describe('useAtShowScoresheet cold load', () => {
  const CLASS = { id: 'canonical-class', trialId: 'trial-1' };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getTrialsByShow.mockResolvedValue([{ id: 'trial-1' }]);
    mocks.getTrialById.mockResolvedValue({ id: 'trial-1', date: '2026-07-24', trialNumber: '1' });
    mocks.getEntriesByClass.mockResolvedValue([
      { id: 'entry-1', dogId: 'dog-1', checkInStatus: 'checked-in' },
    ]);
    mocks.getDog.mockResolvedValue({ id: 'dog-1', name: 'Rex' });
    mocks.syncTrials.mockResolvedValue({ success: true });
    mocks.syncEntries.mockResolvedValue({ success: true });
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

  it('treats a failed show sync as not loaded yet and retries on its own', async () => {
    // Missing before and after the failed first sync; present after the retry.
    mocks.getClassById
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(CLASS);
    mocks.syncClasses
      .mockResolvedValueOnce({
        success: false,
        error: 'canceling statement due to statement timeout',
      })
      .mockResolvedValue({ success: true });

    const { result } = renderScoresheet();

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).not.toBe('Class not found');

    await waitFor(() => expect(result.current.entry?.entryId).toBe('entry-1'), {
      timeout: 5_000,
    });
    expect(result.current.error).toBeNull();
    expect(mocks.syncTrials).toHaveBeenCalledTimes(2);
  });

  it('treats a thrown trials sync the same way', async () => {
    mocks.getClassById
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(CLASS);
    mocks.syncClasses.mockResolvedValue({ success: true });
    mocks.syncTrials
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({ success: true });

    const { result } = renderScoresheet();

    await waitFor(() => expect(result.current.entry?.entryId).toBe('entry-1'), {
      timeout: 5_000,
    });
    expect(result.current.error).toBeNull();
  });

  it('still reports a class the server does not have as not found', async () => {
    mocks.getClassById.mockResolvedValue(null);
    mocks.syncClasses.mockResolvedValue({ success: true });

    const { result } = renderScoresheet();

    await waitFor(() => expect(result.current.error).toBe('Class not found'));
  });
});
