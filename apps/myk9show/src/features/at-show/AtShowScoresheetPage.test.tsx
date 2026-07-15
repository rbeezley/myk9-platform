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

import { Routes, Route, useNavigate } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { ReplicationSyncContext } from '@/context/ReplicationSyncContext';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';

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
  replicatedClassesTable: { getClassById: vi.fn(), sync: vi.fn() },
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { getEntriesByClass: vi.fn(), sync: vi.fn() },
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
import { useRingsideGrantStore } from '@/store/ringsideGrantStore';
import { transitionToInRing } from '@/utils/checkInTransitions';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';

function seed() {
  vi.mocked(replicatedClassesTable.sync).mockResolvedValue({} as never);
  vi.mocked(replicatedEntriesTable.sync).mockResolvedValue({} as never);
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

const settledSyncStatus: ReplicationSyncContextValue['status'] = {
  isSyncing: false,
  lastSyncAt: new Date('2026-06-01T12:00:00Z'),
  error: null,
  tablesStatus: {
    classes: 'success',
    entries: 'success',
    dogs: 'success',
    trials: 'success',
  },
};

const renderPage = (syncStatus: ReplicationSyncContextValue['status'] = settledSyncStatus) =>
  render(
    <ReplicationSyncContext.Provider
      value={{ status: syncStatus, triggerSync: vi.fn(), syncTable: vi.fn() }}
    >
      <Routes>
        <Route
          path="/at-show/:showId/class/:classId/score/:entryId"
          element={<AtShowScoresheetPage />}
        />
        <Route path="/at-show/:showId/class/:classId" element={<div>Entry List</div>} />
      </Routes>
    </ReplicationSyncContext.Provider>,
    { initialRoute: '/at-show/show-1/class/class-1/score/entry-1' }
  );

describe('AtShowScoresheetPage (Phase 1h live scoresheet)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoles = [UserRole.JUDGE];
    // The canScore gate reads the grant store; clear it so a leaked grant from
    // a sibling test (or future Phase 1b setGrant) can't silently override
    // `mockRoles` and pass the deny-path tests for the wrong reason.
    useRingsideGrantStore.getState().clearGrant();
    seed();
  });

  it('loads the entry and renders the live scoresheet', async () => {
    renderPage();
    expect(await screen.findByTestId('live-scoresheet')).toBeInTheDocument();
    expect(screen.getByText('Live scoresheet for #105')).toBeInTheDocument();
    expect(replicatedClassesTable.sync).toHaveBeenCalledWith('');
    expect(replicatedEntriesTable.sync).toHaveBeenCalledWith('show-1');
  });

  it('shows syncing copy instead of Class not found while first sync is pending', async () => {
    vi.mocked(replicatedClassesTable.getClassById).mockResolvedValue(null as never);

    renderPage({
      ...settledSyncStatus,
      isSyncing: true,
      tablesStatus: { classes: 'syncing', entries: 'idle', dogs: 'idle', trials: 'idle' },
    });

    expect(await screen.findByRole('status', { name: 'Loading scoresheet' })).toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeNull();
    expect(screen.queryByText('Class not found')).not.toBeInTheDocument();
  });

  it('does not render a previous scoresheet after route params change during first sync', async () => {
    vi.mocked(replicatedClassesTable.getClassById).mockImplementation(async (id: string) => {
      if (id === 'class-1') {
        return {
          id: 'class-1',
          trialId: 'trial-1',
          element: 'Container',
          level: 'Novice',
        } as never;
      }
      return null as never;
    });
    vi.mocked(replicatedEntriesTable.getEntriesByClass).mockImplementation(async (id: string) => {
      if (id === 'class-1') {
        return [
          { id: 'entry-1', armband: 105, dogId: 'dog-1', checkInStatus: 'no-status' },
        ] as never;
      }
      return [] as never;
    });

    const SwitchScoresheet = () => {
      const navigate = useNavigate();
      return (
        <button
          type="button"
          onClick={() => navigate('/at-show/show-1/class/class-2/score/entry-2')}
        >
          switch scoresheet
        </button>
      );
    };

    render(
      <ReplicationSyncContext.Provider
        value={{
          status: {
            ...settledSyncStatus,
            isSyncing: true,
            tablesStatus: { classes: 'syncing', entries: 'idle', dogs: 'idle', trials: 'idle' },
          },
          triggerSync: vi.fn(),
          syncTable: vi.fn(),
        }}
      >
        <SwitchScoresheet />
        <Routes>
          <Route
            path="/at-show/:showId/class/:classId/score/:entryId"
            element={<AtShowScoresheetPage />}
          />
        </Routes>
      </ReplicationSyncContext.Provider>,
      { initialRoute: '/at-show/show-1/class/class-1/score/entry-1' }
    );

    expect(await screen.findByText('Live scoresheet for #105')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'switch scoresheet' }));

    expect(await screen.findByRole('status', { name: 'Loading scoresheet' })).toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeNull();
    expect(screen.queryByText('Live scoresheet for #105')).not.toBeInTheDocument();
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

  it('runs no scoring-flow side effects for a non-scoring role', async () => {
    mockRoles = [UserRole.STEWARD];
    renderPage();
    await screen.findByText('No Scoring Access');

    // The scoring engine (useAtShowScoresheet) never mounts for a denied role,
    // so neither the submit nor the on-load `transitionToInRing` auto-advance
    // fires — the block is structural, not just a hidden submit button.
    expect(screen.queryByText('Submit Score')).not.toBeInTheDocument();
    expect(submitScoreOptimistically).not.toHaveBeenCalled();
    expect(transitionToInRing).not.toHaveBeenCalled();
  });

  it('allows an admin role to score', async () => {
    mockRoles = [UserRole.SITE_ADMIN];
    renderPage();

    expect(await screen.findByTestId('live-scoresheet')).toBeInTheDocument();
    expect(screen.queryByText('No Scoring Access')).not.toBeInTheDocument();
  });
});
