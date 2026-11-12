/**
 * MYK9-1836: a score the durable queue refuses must reject out of the page's
 * submit handler, so the scoresheet's double-submit guard clears and Save works
 * again without a reload. A saved score still navigates away.
 */
import { Routes, Route } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, waitFor } from '@testing-library/react';
import { render, screen } from '@/test/utils/testUtils';

const mocks = vi.hoisted(() => ({
  getEntriesByClass: vi.fn(),
  submitScoreOptimistically: vi.fn(),
  outcomes: [] as string[],
}));

vi.mock('./useScoringBreadcrumb', () => ({
  useScoringBreadcrumb: () => ({ isLoading: true }),
}));
vi.mock('./liveScoringBreed', () => ({ resolveLiveScoringBreed: async () => null }));
vi.mock('@/hooks/useOptimisticScoring', () => ({
  useOptimisticScoring: () => ({
    submitScoreOptimistically: mocks.submitScoreOptimistically,
    isSyncing: false,
    hasError: false,
    submitError: null,
    clearSubmitError: vi.fn(),
  }),
}));
vi.mock('@/utils/checkInTransitions', () => ({
  transitionToInRing: vi.fn(),
  transitionToCompleted: vi.fn(),
}));
vi.mock('@myk9/scoring-ui', () => ({
  ScoresheetActionBarRefContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
  },
  getScoresheetComponent:
    () =>
    ({ onSubmit }: { onSubmit: (data: unknown) => Promise<void> }) => (
      <button
        data-testid="live-scoresheet"
        onClick={() => {
          // Mirrors the scoresheet guard: a rejection is its signal to unlatch.
          onSubmit({ resultText: 'Pass' }).then(
            () => mocks.outcomes.push('resolved'),
            () => mocks.outcomes.push('rejected')
          );
        }}
      >
        Save
      </button>
    ),
}));
vi.mock('./classScoringRules', () => ({ classScoringRules: () => ({ maxTimeSeconds: 120 }) }));
vi.mock('./types', () => ({
  toScoringEntry: () => ({ entryId: 'entry-1', armband: 105 }),
  toClassInfo: () => ({ id: 'class-1', name: 'Container Novice' }),
  MISSING_TRIAL_TYPE_SPORT_TYPE: 'unresolved-missing-trial-type',
  resolveSportTypeForClass: async () => 'scent-work',
  mapSportType: () => ({ organization: 'AKC', sportType: 'scent-work' }),
  detectScoresheetType: () => ({ organization: 'AKC', sportType: 'scent-work' }),
  toRegistryKey: () => 'akc-scent-work',
  toScoresheetEntry: () => ({}),
  toScoresheetClassInfo: () => ({}),
  toOptimisticScorePayload: (data: unknown) => data,
}));
vi.mock('@/features/at-show/MaxTimeNotSetNotice', () => ({ MaxTimeNotSetNotice: () => null }));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: { getClassById: async () => ({ id: 'class-1', trialId: 'trial-1' }) },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { getTrialById: async () => ({ id: 'trial-1' }) },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { get: async () => null },
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getEntriesByClass: mocks.getEntriesByClass,
    subscribe: () => () => undefined,
  },
}));

import { ScoresheetPage } from './ScoresheetPage';

const row = {
  id: 'entry-1',
  dogId: null,
  entryStatus: 'confirmed',
  checkInStatus: 'no-status',
  awaitingRegistrationNumber: false,
};

function renderSheet() {
  return render(
    <Routes>
      <Route path="/scoring/classes/:classId/entries/:entryId" element={<ScoresheetPage />} />
    </Routes>,
    { initialRoute: '/scoring/classes/class-1/entries/entry-1' }
  );
}

describe('ScoresheetPage failed save (MYK9-1836)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.outcomes.length = 0;
    mocks.getEntriesByClass.mockResolvedValue([row]);
  });

  it('rejects when the score is not stored, then resolves on a successful retry', async () => {
    mocks.submitScoreOptimistically
      .mockImplementationOnce(async ({ onError }: { onError: (e: Error) => void }) => {
        onError(new Error('quota'));
      })
      .mockImplementationOnce(async ({ onSuccess }: { onSuccess: () => void }) => {
        onSuccess();
      });

    renderSheet();
    const save = await screen.findByTestId('live-scoresheet');

    fireEvent.click(save);
    await waitFor(() => expect(mocks.outcomes).toEqual(['rejected']));

    fireEvent.click(save);
    await waitFor(() => expect(mocks.outcomes).toEqual(['rejected', 'resolved']));
    expect(mocks.submitScoreOptimistically).toHaveBeenCalledTimes(2);
  });
});
