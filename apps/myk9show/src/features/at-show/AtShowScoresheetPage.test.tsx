/**
 * Integration test for the at-show live scoresheet page.
 *
 * Proves the wiring: route params → useAtShowScoresheet loads the entry from
 * the (mocked) replication layer → renders the resolved LiveScoresheet → a
 * submit fires `submitScoreOptimistically` with the entry's identity.
 *
 * The scoring helpers + the LiveScoresheet registry are stubbed so the test
 * exercises the at-show wiring, not the scoring engine internals (those are
 * covered in @myk9/scoring-ui + the secretary ScoresheetPage).
 */

import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';

// Effective ringside role drives the scoring gate. Default to a JUDGE (can
// score) so the happy-path wiring tests render the scoresheet; individual tests
// reassign `mockRoles` to exercise the deny path. Real `getPrimaryRole` is kept
// so the account-RBAC → ringside-role mapping is exercised, not stubbed away.
let mockRoles: UserRole[] = [UserRole.JUDGE];
vi.mock('@/hooks/useAuthContext', async importOriginal => {
  const actual = await importOriginal<typeof import('@/hooks/useAuthContext')>();
  return {
    ...actual,
    useAuthContext: () => ({ getUserRoles: () => mockRoles }),
  };
});

vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: { getClassById: vi.fn() },
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { getEntriesByClass: vi.fn() },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { get: vi.fn() },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { getTrialById: vi.fn() },
}));

const submitScoreOptimistically = vi.fn();
vi.mock('@/hooks/useOptimisticScoring', () => ({
  useOptimisticScoring: () => ({ submitScoreOptimistically, isSyncing: false, hasError: false }),
}));

vi.mock('@/utils/checkInTransitions', () => ({
  transitionToInRing: vi.fn(),
  transitionToCompleted: vi.fn(),
}));

// Controlled scoring-helper stubs — exercise at-show wiring, not engine internals.
vi.mock('@/pages/scoring/types', () => ({
  toScoringEntry: (re: { id: string; armband: number }) => ({
    entryId: re.id,
    armband: re.armband,
    dogName: 'Rex',
  }),
  toClassInfo: (cls: { id: string }) => ({ id: cls.id, name: 'Container Novice' }),
  resolveSportTypeForClass: vi.fn().mockResolvedValue('AKC_SCENT_WORK'),
  toOptimisticScorePayload: (sd: unknown) => sd,
  mapSportType: () => ({ organization: 'AKC', sportType: 'SCENT_WORK' }),
  detectScoresheetType: () => ({ organization: 'AKC', sportType: 'SCENT_WORK' }),
  toRegistryKey: () => 'AKC_SCENT_WORK',
  toScoresheetEntry: (e: unknown) => e,
  toScoresheetClassInfo: (c: unknown) => c,
}));

const StubLiveScoresheet = ({
  entry,
  onSubmit,
  onBack,
}: {
  entry: { armband: number };
  onSubmit: (sd: unknown) => void;
  onBack: () => void;
}) => (
  <div>
    <div data-testid="live-scoresheet">Live scoresheet for #{entry.armband}</div>
    <button onClick={() => onSubmit({ resultText: 'Qualified', searchTime: '0:30.00' })}>
      Submit Score
    </button>
    <button onClick={onBack}>Back</button>
  </div>
);
vi.mock('@myk9/scoring-ui', () => ({
  getScoresheetComponent: () => StubLiveScoresheet,
  buildResolvedClassRules: () => ({ maxTimeSeconds: 120 }),
}));

import { AtShowScoresheetPage } from './AtShowScoresheetPage';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';

function seed() {
  vi.mocked(replicatedClassesTable.getClassById).mockResolvedValue({
    id: 'class-1',
    trialId: 'trial-1',
    element: 'Container',
    level: 'Novice',
  } as never);
  vi.mocked(replicatedEntriesTable.getEntriesByClass).mockResolvedValue([
    { id: 'entry-1', armband: 105, dogId: 'dog-1', checkInStatus: 'no-status' },
  ] as never);
  vi.mocked(replicatedDogsTable.get).mockResolvedValue({ id: 'dog-1', callName: 'Rex' } as never);
  vi.mocked(replicatedTrialsTable.getTrialById).mockResolvedValue({
    id: 'trial-1',
    trialNumber: '1',
    date: '2026-06-01',
  } as never);
}

const renderPage = () =>
  render(
    <Routes>
      <Route
        path="/at-show/:showId/class/:classId/score/:entryId"
        element={<AtShowScoresheetPage />}
      />
      <Route path="/at-show/:showId/class/:classId" element={<div>Entry List</div>} />
    </Routes>,
    { initialRoute: '/at-show/show-1/class/class-1/score/entry-1' }
  );

describe('AtShowScoresheetPage (Phase 1h live scoresheet)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoles = [UserRole.JUDGE];
    seed();
  });

  it('loads the entry and renders the live scoresheet', async () => {
    renderPage();
    expect(await screen.findByTestId('live-scoresheet')).toBeInTheDocument();
    expect(screen.getByText('Live scoresheet for #105')).toBeInTheDocument();
  });

  it('submits the score via submitScoreOptimistically with the entry identity', async () => {
    renderPage();
    await screen.findByTestId('live-scoresheet');

    fireEvent.click(screen.getByText('Submit Score'));

    await waitFor(() =>
      expect(submitScoreOptimistically).toHaveBeenCalledWith(
        expect.objectContaining({ entryId: 'entry-1', classId: 'class-1', armband: 105 })
      )
    );
  });

  it('navigates back to the at-show entry list', async () => {
    renderPage();
    await screen.findByTestId('live-scoresheet');

    fireEvent.click(screen.getByText('Back'));

    expect(await screen.findByText('Entry List')).toBeInTheDocument();
  });

  // Security gate: the STAFF_ROLES route guard admits stewards, but ringside's
  // permission model gives a steward `canScore: false`. The page must block them
  // before the scoresheet renders — closing the over-permit the route guard left.
  it('blocks a steward (canScore=false) with a no-access state instead of the scoresheet', async () => {
    mockRoles = [UserRole.STEWARD];
    renderPage();

    expect(await screen.findByText('No Scoring Access')).toBeInTheDocument();
    expect(screen.queryByTestId('live-scoresheet')).not.toBeInTheDocument();
  });

  it('never reaches submit for a non-scoring role', async () => {
    mockRoles = [UserRole.STEWARD];
    renderPage();
    await screen.findByText('No Scoring Access');

    // No scoresheet means no submit affordance, and the optimistic-score hook
    // is never invoked — the block is structural, not a hidden button.
    expect(screen.queryByText('Submit Score')).not.toBeInTheDocument();
    expect(submitScoreOptimistically).not.toHaveBeenCalled();
  });

  it('allows an admin role to score', async () => {
    mockRoles = [UserRole.SITE_ADMIN];
    renderPage();

    expect(await screen.findByTestId('live-scoresheet')).toBeInTheDocument();
    expect(screen.queryByText('No Scoring Access')).not.toBeInTheDocument();
  });
});
