/**
 * MYK9-1574: a UKC/ASCA trial with no trial type refuses every scoresheet. The page says
 * why, and sends a viewer who can manage the show to the trial page to set it.
 */
import { Routes, Route } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';

const mocks = vi.hoisted(() => ({
  getTrialById: vi.fn(),
  getShow: vi.fn(),
  canManage: false,
}));

vi.mock('./useScoringBreadcrumb', () => ({
  useScoringBreadcrumb: () => ({ isLoading: false, showId: 'show-1' }),
}));
vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({ canManage: mocks.canManage }),
}));
vi.mock('./liveScoringBreed', () => ({ resolveLiveScoringBreed: async () => null }));
vi.mock('@/hooks/useOptimisticScoring', () => ({
  useOptimisticScoring: () => ({
    submitScoreOptimistically: vi.fn(),
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
vi.mock('./types', async importOriginal => ({
  ...(await importOriginal<typeof import('./types')>()),
  toScoringEntry: () => ({ entryId: 'entry-1', armband: 105 }),
  toClassInfo: () => ({ id: 'class-1', name: 'Interior' }),
}));
vi.mock('./classScoringRules', () => ({ classScoringRules: () => ({ maxTimeSeconds: 120 }) }));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: {
    getClassById: async () => ({ id: 'class-1', trialId: 'trial-1', className: 'Interior' }),
  },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { getTrialById: mocks.getTrialById },
}));
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: { get: mocks.getShow },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { get: async () => null },
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getEntriesByClass: async () => [
      { id: 'entry-1', dogId: null, entryStatus: 'confirmed', checkInStatus: 'no-status' },
    ],
    subscribe: () => () => undefined,
  },
}));

import { ScoresheetPage } from './ScoresheetPage';

function renderSheet() {
  return render(
    <Routes>
      <Route path="/scoring/classes/:classId/entries/:entryId" element={<ScoresheetPage />} />
    </Routes>,
    { initialRoute: '/scoring/classes/class-1/entries/entry-1' }
  );
}

describe('ScoresheetPage with no trial type (MYK9-1574)', () => {
  beforeEach(() => {
    mocks.canManage = false;
    mocks.getTrialById.mockResolvedValue({
      id: 'trial-1',
      showId: 'show-1',
      trialType: null,
    });
    mocks.getShow.mockResolvedValue({ id: 'show-1', organization: 'UKC' });
  });

  it('names the missing trial type and links a show manager to the trial page', async () => {
    mocks.canManage = true;
    renderSheet();

    expect(await screen.findByText(/no trial type set/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /set the trial type/i })).toHaveAttribute(
      'href',
      '/shows/show-1/trials/trial-1'
    );
  });

  it('tells a viewer who cannot manage the show to ask the secretary, with no link', async () => {
    renderSheet();

    expect(await screen.findByText(/no trial type set/i)).toBeInTheDocument();
    expect(screen.getByText('Ask the show secretary to set the trial type.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /set the trial type/i })).toBeNull();
  });

  it('keeps the generic message for a trial type the registry has no sheet for', async () => {
    mocks.getTrialById.mockResolvedValue({ id: 'trial-1', showId: 'show-1', trialType: 'Agility' });
    renderSheet();

    expect(await screen.findByText(/is not yet implemented/i)).toBeInTheDocument();
    expect(screen.queryByText(/no trial type set/i)).toBeNull();
  });
});
