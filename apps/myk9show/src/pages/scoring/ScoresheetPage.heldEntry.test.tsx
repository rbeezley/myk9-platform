/**
 * MYK9-1162: the secretary's paper-score sheet sits behind the same live hold
 * gate as ringside. A score keyed here for a held dog would show as saved and
 * then be refused by the server, so it is never offered, and opening the sheet
 * does not move the dog in-ring.
 */
import { Routes, Route } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';

const mocks = vi.hoisted(() => ({
  getEntriesByClass: vi.fn(),
  getEntryById: vi.fn(),
  submitScoreOptimistically: vi.fn(),
  transitionToInRing: vi.fn(),
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
  transitionToInRing: mocks.transitionToInRing,
  transitionToCompleted: vi.fn(),
}));
vi.mock('@myk9/scoring-ui', () => ({
  getScoresheetComponent: () => () => <div data-testid="live-scoresheet" />,
}));
vi.mock('./classScoringRules', () => ({ classScoringRules: () => ({ maxTimeSeconds: 120 }) }));
vi.mock('./types', () => ({
  toScoringEntry: () => ({ entryId: 'entry-1', armband: 105 }),
  toClassInfo: () => ({ id: 'class-1', name: 'Container Novice' }),
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
    getEntryById: mocks.getEntryById,
    subscribe: () => () => undefined,
  },
}));

import { ScoresheetPage } from './ScoresheetPage';

const heldRow = {
  id: 'entry-1',
  dogId: null,
  entryStatus: 'confirmed',
  checkInStatus: 'no-status',
  awaitingRegistrationNumber: true,
};

function renderSheet() {
  return render(
    <Routes>
      <Route path="/scoring/classes/:classId/entries/:entryId" element={<ScoresheetPage />} />
    </Routes>,
    { initialRoute: '/scoring/classes/class-1/entries/entry-1' }
  );
}

describe('ScoresheetPage held entry (MYK9-1162)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('locks the sheet behind the notice and never moves the dog in-ring', async () => {
    mocks.getEntriesByClass.mockResolvedValue([heldRow]);
    mocks.getEntryById.mockResolvedValue(heldRow);

    renderSheet();

    expect(await screen.findByText('Registration number needed')).toBeInTheDocument();
    expect(screen.getByTestId('live-scoresheet').closest('[inert]')).not.toBeNull();
    expect(mocks.transitionToInRing).not.toHaveBeenCalled();
  });

  it('offers the sheet for a dog that is not held', async () => {
    const row = { ...heldRow, awaitingRegistrationNumber: false };
    mocks.getEntriesByClass.mockResolvedValue([row]);
    mocks.getEntryById.mockResolvedValue(row);

    renderSheet();

    const sheet = await screen.findByTestId('live-scoresheet');
    await waitFor(() => expect(mocks.getEntryById).toHaveBeenCalled());
    expect(sheet.closest('[inert]')).toBeNull();
    expect(screen.queryByText('Registration number needed')).toBeNull();
    expect(mocks.transitionToInRing).toHaveBeenCalledTimes(1);
  });
});
