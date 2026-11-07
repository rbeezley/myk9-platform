/**
 * MYK9-1555: the ringside scoresheet owns exactly one `main` landmark in every
 * full-page state (axe `landmark-one-main` / `region`), and its headings never
 * skip a level (axe `heading-order`). Harness mirrors AtShowScoresheetPage.test.tsx.
 * axe-core itself is not a vitest dependency here; the e2e suite runs it in a
 * real browser via @axe-core/playwright.
 */

import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { ReplicationSyncTestProvider } from '@/test/utils/ReplicationSyncTestProvider';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';

// Effective ringside role drives the scoring gate. Default to a JUDGE (can
// score) so the happy-path wiring tests render the scoresheet; individual tests
// reassign `mockRoles` to exercise the deny path. Real `getPrimaryRole` is kept
// so the account-RBAC → ringside-role mapping is exercised, not stubbed away.
let mockRoles: UserRole[] = [UserRole.JUDGE];
// MYK9-82: the signed-in judge's person id, matched against judge_assignments.
let mockPersonId: string | undefined = 'judge-1';
// MYK9-82: whether the Supabase session is anonymous (a passcode guest). A
// signed-in account is the default; the anonymous-exempt test flips this.
let mockIsAnonymous = false;
vi.mock('@/hooks/useAuthContext', async importOriginal => {
  const actual = await importOriginal<typeof import('@/hooks/useAuthContext')>();
  return {
    ...actual,
    useAuthContext: () => ({
      getUserRoles: () => mockRoles,
      userWithRoles: { databaseUserId: mockPersonId },
      personId: mockPersonId,
      user: { is_anonymous: mockIsAnonymous },
    }),
  };
});

// The "sign out to use a passcode" escape signs out via supabase directly
// (NOT the AuthContext signOut, which hard-redirects and would clobber the
// client-side navigation to the passcode form).
const { supabaseSignOut, supabaseGetSession } = vi.hoisted(() => ({
  supabaseSignOut: vi.fn().mockResolvedValue({ error: null }),
  // auth-js removes the local session even on a failed revoke, so the handler
  // decides by the RESULTING session, not the returned error. Default: gone.
  supabaseGetSession: vi.fn().mockResolvedValue({ data: { session: null } }),
}));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { auth: { signOut: supabaseSignOut, getSession: supabaseGetSession } },
}));

vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: { getClassById: vi.fn(), sync: vi.fn() },
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getEntriesByClass: vi.fn(),
    getEntryById: vi.fn(),
    getScoreUploadState: vi.fn().mockResolvedValue('pending'),
    readScoreFromServer: vi.fn().mockResolvedValue(null),
    sync: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { get: vi.fn() },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { sync: vi.fn(), getTrialsByShow: vi.fn(), getTrialById: vi.fn() },
}));

// MYK9-82's pre-flight assignment check reads this barrel export directly.
// `getAll` defaults to an empty store (cold cache) — tests that need an
// assignment decision set it explicitly; everything else exercises the
// documented fail-open behavior. `vi.hoisted` because `vi.mock` factories are
// hoisted above top-level consts.
const { judgeAssignmentsGetAll, judgeAssignmentsSync } = vi.hoisted(() => ({
  judgeAssignmentsGetAll: vi.fn().mockResolvedValue([]),
  judgeAssignmentsSync: vi.fn().mockResolvedValue({ success: true }),
}));
// `syncAtShowData` (the cold load's show sync) reads the tables through this
// index, so it shares the per-table mocks above.
vi.mock('@/services/replication', async () => ({
  replicatedArmbandsTable: {
    sync: vi.fn().mockResolvedValue({ success: true }),
    subscribe: vi.fn(() => () => undefined),
  },
  replicatedClassesTable: {
    ...(await import('@/services/replication/ReplicatedClassesTable')).replicatedClassesTable,
    clearCachedHideCounts: vi.fn().mockResolvedValue(undefined),
  },
  replicatedEntriesTable: (await import('@/services/replication/ReplicatedEntriesTable'))
    .replicatedEntriesTable,
  replicatedTrialsTable: (await import('@/services/replication/ReplicatedTrialsTable'))
    .replicatedTrialsTable,
  replicatedJudgeAssignmentsTable: {
    getAll: judgeAssignmentsGetAll,
    getAllOrThrow: judgeAssignmentsGetAll,
    sync: judgeAssignmentsSync,
  },
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

const StubLiveScoresheet = ({ entry }: { entry: { armband: number } }) => (
  <div>
    <h1>Scoresheet</h1>
    <h2 data-testid="live-scoresheet">Live scoresheet for #{entry.armband}</h2>
  </div>
);
vi.mock('@myk9/scoring-ui', () => ({
  ScoresheetActionBarRefContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
  },
  getScoresheetComponent: () => StubLiveScoresheet,
  // Like the real builder: no saved limit means no limit (0).
  buildResolvedClassRules: (cls: { timeLimitSeconds?: number }) => ({
    maxTimeSeconds: cls.timeLimitSeconds ?? 0,
  }),
}));

const playWarning = vi.fn();
vi.mock('@/hooks/useAudioWarnings', () => ({
  useAudioWarnings: vi.fn(() => ({ playWarning })),
}));

const speakRemainingSeconds = vi.fn();
vi.mock('./atShowVoiceAnnouncement', () => ({
  speakRemainingSeconds: (...args: unknown[]) => speakRemainingSeconds(...args),
}));

import { AtShowScoresheetPage } from './AtShowScoresheetPage';
import { useNotificationStore } from '@/store/notificationStore';
import { useRingsideGrantStore } from '@/store/ringsideGrantStore';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';

function seed() {
  vi.mocked(replicatedClassesTable.sync).mockResolvedValue({} as never);
  vi.mocked(replicatedEntriesTable.sync).mockResolvedValue({} as never);
  vi.mocked(replicatedTrialsTable.sync).mockResolvedValue({} as never);
  vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([
    { id: 'trial-1', showId: 'show-1' },
  ] as never);
  vi.mocked(replicatedClassesTable.getClassById).mockResolvedValue({
    id: 'class-1',
    trialId: 'trial-1',
    element: 'Container',
    level: 'Novice',
  } as never);
  vi.mocked(replicatedEntriesTable.getEntriesByClass).mockResolvedValue([
    { id: 'entry-1', armband: 105, dogId: 'dog-1', checkInStatus: 'no-status' },
  ] as never);
  vi.mocked(replicatedEntriesTable.getEntryById).mockResolvedValue({
    id: 'entry-1',
    resultStatus: 'qualified',
    searchTimeSeconds: 30,
    totalFaults: 0,
    scoringCompletedAt: '2026-06-01T12:00:00.000Z',
  } as never);
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
    <ReplicationSyncTestProvider
      value={{ status: syncStatus, triggerSync: vi.fn(), syncTable: vi.fn() }}
    >
      <Routes>
        <Route
          path="/at-show/:showId/class/:classId/score/:entryId"
          element={<AtShowScoresheetPage />}
        />
        <Route path="/at-show/:showId/class/:classId" element={<div>Entry List</div>} />
      </Routes>
    </ReplicationSyncTestProvider>,
    { initialRoute: '/at-show/show-1/class/class-1/score/entry-1' }
  );

/** Levels of every heading in document order. */
const headingLevels = () => screen.getAllByRole('heading').map(h => Number(h.tagName.slice(1)));

/** True when no heading is more than one level deeper than its predecessor. */
const skipsLevel = (levels: number[]) =>
  levels.some((level, i) => (i === 0 ? false : level - levels[i - 1] > 1));

describe('AtShowScoresheetPage landmarks (MYK9-1555)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(replicatedEntriesTable.getScoreUploadState).mockResolvedValue('pending');
    vi.mocked(replicatedEntriesTable.readScoreFromServer).mockResolvedValue(null);
    vi.mocked(replicatedEntriesTable.subscribe).mockImplementation(() => () => undefined);
    mockRoles = [UserRole.JUDGE];
    mockPersonId = 'judge-1';
    mockIsAnonymous = false;
    judgeAssignmentsGetAll.mockResolvedValue([]);
    judgeAssignmentsSync.mockResolvedValue({ success: true });
    supabaseSignOut.mockResolvedValue({ error: null });
    supabaseGetSession.mockResolvedValue({ data: { session: null } });
    useRingsideGrantStore.getState().clearGrant();
    localStorage.clear();
    useNotificationStore
      .getState()
      .updatePreferences({ timerVoiceEnabled: true, voiceEnabled: false });
    seed();
  });

  it('the live scoresheet has exactly one main landmark and skip-free headings', async () => {
    renderPage();
    expect(await screen.findByTestId('live-scoresheet')).toBeInTheDocument();
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toContainElement(screen.getByTestId('live-scoresheet'));
    expect(headingLevels()).toEqual([1, 2]);
    expect(skipsLevel(headingLevels())).toBe(false);
  });

  it('the loading skeleton sits inside the single main landmark', async () => {
    vi.mocked(replicatedClassesTable.getClassById).mockReturnValue(new Promise(() => undefined));
    renderPage();
    await screen.findByRole('status', { name: 'Loading scoresheet' });
    // Re-query after the skeleton settles: the page swaps one skeleton for the next.
    await waitFor(() => {
      const mains = screen.getAllByRole('main');
      expect(mains).toHaveLength(1);
      expect(
        within(mains[0]).getByRole('status', { name: 'Loading scoresheet' })
      ).toBeInTheDocument();
    });
  });

  it('the no-scoring-access state has exactly one main landmark', async () => {
    mockRoles = [UserRole.EXHIBITOR];
    renderPage();
    expect(await screen.findByText('No Scoring Access')).toBeInTheDocument();
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toContainElement(screen.getByText('No Scoring Access'));
  });

  it('the heading-skip helper flags a skipped level (positive control)', () => {
    expect(skipsLevel([1, 3])).toBe(true);
    expect(skipsLevel([1, 2, 3, 2])).toBe(false);
  });
});
