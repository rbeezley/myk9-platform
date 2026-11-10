/**
 * MYK9-1847: the at-show scoresheet reads the class's stored status live. A cancelled class
 * shows the plain cancelled message instead of a sheet (deep link, back/forward, or cancelled
 * while the sheet is open), and un-cancelling restores the sheet.
 */

import {
  Routes,
  Route,
  RouterProvider,
  createMemoryRouter,
  useLocation,
  useNavigate,
  useNavigationType,
} from 'react-router-dom';
import { render as rawRender } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  createTestQueryClient,
} from '@/test/utils/testUtils';
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
  replicatedClassesTable: {
    getClassById: vi.fn(),
    sync: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  },
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

const StubLiveScoresheet = ({
  entry,
  onSubmit,
  onBack,
  backLabel,
  onDirtyChange,
  onWarningChime,
  onVoiceAnnouncement,
  enableVoiceAnnouncements,
  headerActions,
}: {
  entry: { armband: number };
  onSubmit: (sd: unknown) => void;
  onBack: () => void;
  backLabel?: string;
  onDirtyChange?: (dirty: boolean) => void;
  onWarningChime?: () => void;
  onVoiceAnnouncement?: (secondsRemaining: number) => void;
  enableVoiceAnnouncements?: boolean;
  headerActions?: React.ReactNode;
}) => (
  <div>
    <header>{headerActions}</header>
    <div data-testid="live-scoresheet">Live scoresheet for #{entry.armband}</div>
    <div data-testid="back-label">{backLabel}</div>
    <button onClick={() => onDirtyChange?.(true)}>Mark dirty</button>
    <div data-testid="voice-announcements-enabled">{String(enableVoiceAnnouncements)}</div>
    {/* Like the real sheet, a refused save is caught (and shown) by the sheet. */}
    <button
      onClick={() =>
        void Promise.resolve(onSubmit({ resultText: 'Qualified', searchTime: '0:30.00' })).catch(
          () => undefined
        )
      }
    >
      Submit Score
    </button>
    <button onClick={onBack}>Back</button>
    <button onClick={() => onWarningChime?.()}>Fire warning chime</button>
    <button onClick={() => onVoiceAnnouncement?.(30)}>Fire voice announcement</button>
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
import { useAudioWarnings } from '@/hooks/useAudioWarnings';
import { useNotificationStore } from '@/store/notificationStore';
import { useRingsideGrantStore } from '@/store/ringsideGrantStore';
import { transitionToInRing } from '@/utils/checkInTransitions';
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

import { CANCELLED_CLASS_MESSAGE } from './cancelledClassGuard';

describe('AtShowScoresheetPage with a cancelled class (MYK9-1847)', () => {
  let emitClasses: (rows: unknown[]) => void;

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
    useRingsideGrantStore.getState().clearGrant();
    localStorage.clear();
    seed();
    // The guard reads the class replica live; keep the listener so a test can change the status.
    emitClasses = () => undefined;
    vi.mocked(replicatedClassesTable.subscribe).mockImplementation(listener => {
      emitClasses = rows => listener(rows as never);
      return () => undefined;
    });
  });

  const classRow = (classStatus: string) => ({
    id: 'class-1',
    trialId: 'trial-1',
    element: 'Container',
    level: 'Novice',
    classStatus,
  });

  it('opened on a cancelled class (deep link) shows the message and no sheet', async () => {
    vi.mocked(replicatedClassesTable.getClassById).mockResolvedValue(
      classRow('cancelled') as never
    );
    vi.mocked(replicatedClassesTable.subscribe).mockImplementation(listener => {
      listener([classRow('cancelled')] as never);
      return () => undefined;
    });
    renderPage();

    expect(await screen.findByText(CANCELLED_CLASS_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByTestId('live-scoresheet')).not.toBeInTheDocument();
    expect(submitScoreOptimistically).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /entries/i })).toBeInTheDocument();
  });

  it('a class cancelled while the sheet is open swaps the sheet for the message, and back', async () => {
    emitClasses = () => undefined;
    renderPage();
    expect(await screen.findByTestId('live-scoresheet')).toBeInTheDocument();

    act(() => emitClasses([classRow('cancelled')]));
    expect(await screen.findByText(CANCELLED_CLASS_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByTestId('live-scoresheet')).not.toBeInTheDocument();

    act(() => emitClasses([classRow('in_progress')]));
    expect(await screen.findByTestId('live-scoresheet')).toBeInTheDocument();
    expect(screen.queryByText(CANCELLED_CLASS_MESSAGE)).not.toBeInTheDocument();
  });

  it('moves the dog into the ring as usual when the class is running', async () => {
    renderPage();
    await screen.findByTestId('live-scoresheet');
    expect(transitionToInRing).toHaveBeenCalled();
  });

  it('does not move the dog into the ring when the class is cancelled', async () => {
    vi.mocked(replicatedClassesTable.getClassById).mockResolvedValue(
      classRow('cancelled') as never
    );
    vi.mocked(replicatedClassesTable.subscribe).mockImplementation(listener => {
      listener([classRow('cancelled')] as never);
      return () => undefined;
    });
    renderPage();
    await screen.findByText(CANCELLED_CLASS_MESSAGE);
    expect(transitionToInRing).not.toHaveBeenCalled();
  });
});
