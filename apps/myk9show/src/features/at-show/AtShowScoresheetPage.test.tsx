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
      user: { is_anonymous: mockIsAnonymous },
    }),
  };
});

// The "sign out to use a passcode" escape signs out via supabase directly
// (NOT the AuthContext signOut, which hard-redirects and would clobber the
// client-side navigation to the passcode form).
const { supabaseSignOut } = vi.hoisted(() => ({
  supabaseSignOut: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { auth: { signOut: supabaseSignOut } },
}));

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
vi.mock('@/services/replication', () => ({
  replicatedJudgeAssignmentsTable: {
    getAll: judgeAssignmentsGetAll,
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
  onWarningChime,
  onVoiceAnnouncement,
  enableVoiceAnnouncements,
}: {
  entry: { armband: number };
  onSubmit: (sd: unknown) => void;
  onBack: () => void;
  onWarningChime?: () => void;
  onVoiceAnnouncement?: (secondsRemaining: number) => void;
  enableVoiceAnnouncements?: boolean;
}) => (
  <div>
    <div data-testid="live-scoresheet">Live scoresheet for #{entry.armband}</div>
    <div data-testid="voice-announcements-enabled">{String(enableVoiceAnnouncements)}</div>
    <button onClick={() => onSubmit({ resultText: 'Qualified', searchTime: '0:30.00' })}>
      Submit Score
    </button>
    <button onClick={onBack}>Back</button>
    <button onClick={() => onWarningChime?.()}>Fire warning chime</button>
    <button onClick={() => onVoiceAnnouncement?.(30)}>Fire voice announcement</button>
  </div>
);
vi.mock('@myk9/scoring-ui', () => ({
  getScoresheetComponent: () => StubLiveScoresheet,
  buildResolvedClassRules: () => ({ maxTimeSeconds: 120 }),
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
    mockPersonId = 'judge-1';
    mockIsAnonymous = false;
    // Default cold-cache (fail-open): tests exercising the pre-flight gate set
    // an explicit assignment list; every other test just needs it to resolve.
    judgeAssignmentsGetAll.mockResolvedValue([]);
    judgeAssignmentsSync.mockResolvedValue({ success: true });
    // clearAllMocks resets call history but not mockResolvedValue impls — the
    // sign-out-failure test overrides this, so restore the success default.
    supabaseSignOut.mockResolvedValue({ error: null });
    // The canScore gate reads the grant store; clear it so a leaked grant from
    // a sibling test (or future Phase 1b setGrant) can't silently override
    // `mockRoles` and pass the deny-path tests for the wrong reason.
    useRingsideGrantStore.getState().clearGrant();
    // useAtShowAudioMute persists to localStorage — start every test unmuted.
    localStorage.clear();
    seed();
  });

  it('loads the entry and renders the live scoresheet', async () => {
    renderPage();
    expect(await screen.findByTestId('live-scoresheet')).toBeInTheDocument();
    expect(screen.getByText('Live scoresheet for #105')).toBeInTheDocument();
    expect(replicatedTrialsTable.sync).toHaveBeenCalledWith('show-1');
    expect(replicatedClassesTable.sync).toHaveBeenCalledWith('trial-1');
    expect(replicatedEntriesTable.sync).toHaveBeenCalledWith('show-1');
  });

  it('shows syncing copy instead of Class not found while first sync is pending', async () => {
    vi.mocked(replicatedClassesTable.getClassById).mockResolvedValue(null as never);

    renderPage({
      ...settledSyncStatus,
      isSyncing: true,
      tablesStatus: { classes: 'syncing', entries: 'idle', dogs: 'idle', trials: 'idle' },
    });

    // MYK9-82's pre-flight (`useJudgeAssignedToClass`) resolves one microtask
    // after mount before `ScoresheetContent` mounts at all — sync it first so
    // the findByRole below is checking the scoring engine's OWN loading state,
    // not racing the pre-flight's.
    await waitFor(() => expect(judgeAssignmentsGetAll).toHaveBeenCalled());

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

    judgeAssignmentsGetAll.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'switch scoresheet' }));

    // MYK9-82's pre-flight re-runs for the new classId before `ScoresheetContent`
    // remounts — sync on it first, same reasoning as the test above.
    await waitFor(() => expect(judgeAssignmentsGetAll).toHaveBeenCalled());

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

  // MYK9-82: `canScore` only checks the ROLE. The server additionally requires
  // a signed-in judge be assigned to THIS class — without a client-side
  // pre-flight, an unassigned judge would submit a score that dead-letters at
  // sync. A passcode grant does NOT establish server authz for an account
  // session, so it is not an exemption.
  describe('judge assignment pre-flight (MYK9-82)', () => {
    it('blocks a signed-in judge with no matching assignment, offering the guest-passcode escape', async () => {
      judgeAssignmentsGetAll.mockResolvedValue([
        { id: 'a1', personId: 'judge-1', classId: 'some-other-class', status: 'confirmed' },
      ]);
      renderPage();

      expect(
        await screen.findByText("You're not assigned to judge this class")
      ).toBeInTheDocument();
      expect(screen.queryByTestId('live-scoresheet')).not.toBeInTheDocument();
      // The CTA no longer offers an in-place passcode link (that keeps the
      // unauthorized account session); it offers sign-out to a guest passcode.
      expect(screen.queryByRole('link', { name: /passcode/i })).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /sign out to use a passcode/i })
      ).toBeInTheDocument();
      // No optimistic score, no in-ring transition — same structural guarantee
      // as the canScore gate: a denied session runs none of the scoring flow.
      expect(transitionToInRing).not.toHaveBeenCalled();
    });

    it('signs out via supabase, clears the grant, then routes to the guest passcode form', async () => {
      useRingsideGrantStore.getState().setGrant({
        showId: 'show-1',
        role: 'judge',
        source: 'passcode',
      });
      judgeAssignmentsGetAll.mockResolvedValue([
        { id: 'a1', personId: 'judge-1', classId: 'some-other-class', status: 'confirmed' },
      ]);
      renderPage();

      const escape = await screen.findByRole('button', { name: /sign out to use a passcode/i });
      fireEvent.click(escape);

      // Direct supabase sign-out (not the hard-redirecting AuthContext signOut),
      // so the client-side navigation to the passcode form isn't clobbered. Uses
      // LOCAL scope so a failed server-revoke can't leave the session in a
      // partial state. The in-memory grant is cleared since we skip the hard
      // reload it relied on.
      await waitFor(() => expect(supabaseSignOut).toHaveBeenCalledTimes(1));
      expect(supabaseSignOut).toHaveBeenCalledWith({ scope: 'local' });
      expect(useRingsideGrantStore.getState().activeGrant).toBeNull();
    });

    it('stays on the block (no navigation, no grant clear) when sign-out fails', async () => {
      supabaseSignOut.mockResolvedValue({ error: { message: 'network' } });
      useRingsideGrantStore.getState().setGrant({
        showId: 'show-1',
        role: 'judge',
        source: 'passcode',
      });
      judgeAssignmentsGetAll.mockResolvedValue([
        { id: 'a1', personId: 'judge-1', classId: 'some-other-class', status: 'confirmed' },
      ]);
      renderPage();

      const escape = await screen.findByRole('button', { name: /sign out to use a passcode/i });
      fireEvent.click(escape);

      // supabase.auth.signOut RESOLVES with an error rather than throwing — we
      // must not navigate on failure (the account session is still live) and
      // must not discard the grant.
      await screen.findByRole('alert');
      expect(screen.getByText("You're not assigned to judge this class")).toBeInTheDocument();
      expect(useRingsideGrantStore.getState().activeGrant).not.toBeNull();
    });

    it('allows a signed-in judge who IS assigned (confirmed) to this class', async () => {
      judgeAssignmentsGetAll.mockResolvedValue([
        { id: 'a1', personId: 'judge-1', classId: 'class-1', status: 'confirmed' },
      ]);
      renderPage();

      expect(await screen.findByTestId('live-scoresheet')).toBeInTheDocument();
      expect(screen.queryByText("You're not assigned to judge this class")).not.toBeInTheDocument();
      // Local match — no forced sync needed.
      expect(judgeAssignmentsSync).not.toHaveBeenCalled();
    });

    it('allows an "invited" (not yet confirmed) assignment', async () => {
      judgeAssignmentsGetAll.mockResolvedValue([
        { id: 'a1', personId: 'judge-1', classId: 'class-1', status: 'invited' },
      ]);
      renderPage();

      expect(await screen.findByTestId('live-scoresheet')).toBeInTheDocument();
    });

    it('does not block a withdrawn/declined assignment status', async () => {
      judgeAssignmentsGetAll.mockResolvedValue([
        { id: 'a1', personId: 'judge-1', classId: 'class-1', status: 'declined' },
      ]);
      renderPage();

      expect(
        await screen.findByText("You're not assigned to judge this class")
      ).toBeInTheDocument();
    });

    it('forces a fresh sync before denying, and unblocks when the sync pulls the assignment', async () => {
      // Stale cache (unrelated rows) → first read misses; the forced sync
      // downloads the real assignment → second read matches → not blocked.
      judgeAssignmentsGetAll
        .mockResolvedValueOnce([
          { id: 'a2', personId: 'someone-else', classId: 'class-1', status: 'confirmed' },
        ])
        .mockResolvedValueOnce([
          { id: 'a1', personId: 'judge-1', classId: 'class-1', status: 'confirmed' },
        ]);
      renderPage();

      expect(await screen.findByTestId('live-scoresheet')).toBeInTheDocument();
      expect(judgeAssignmentsSync).toHaveBeenCalledTimes(1);
    });

    it('fails open when the local assignment store is a cold cache (empty)', async () => {
      judgeAssignmentsGetAll.mockResolvedValue([]);
      renderPage();

      // A legitimate judge must never be blocked by missing local data — the
      // server RPC remains the real enforcement boundary regardless.
      expect(await screen.findByTestId('live-scoresheet')).toBeInTheDocument();
    });

    it('fails open when the forced sync fails (offline)', async () => {
      judgeAssignmentsGetAll.mockResolvedValue([
        { id: 'a2', personId: 'someone-else', classId: 'class-1', status: 'confirmed' },
      ]);
      judgeAssignmentsSync.mockResolvedValue({ success: false, error: 'offline' });
      renderPage();

      expect(await screen.findByTestId('live-scoresheet')).toBeInTheDocument();
    });

    it('fails open when the replicated read itself errors', async () => {
      judgeAssignmentsGetAll.mockRejectedValue(new Error('IDB unavailable'));
      renderPage();

      expect(await screen.findByTestId('live-scoresheet')).toBeInTheDocument();
    });

    it('BLOCKS a signed-in judge holding a passcode GRANT but no assignment', async () => {
      // A client-side passcode grant does NOT establish server authorization for
      // a signed-in account (validate-passcode stamps only anonymous sessions),
      // so the assignment check must still apply — the grant is not an exemption.
      useRingsideGrantStore.getState().setGrant({
        showId: 'show-1',
        role: 'judge',
        source: 'passcode',
      });
      judgeAssignmentsGetAll.mockResolvedValue([
        { id: 'a1', personId: 'judge-1', classId: 'some-other-class', status: 'confirmed' },
      ]);
      renderPage();

      expect(
        await screen.findByText("You're not assigned to judge this class")
      ).toBeInTheDocument();
      expect(screen.queryByTestId('live-scoresheet')).not.toBeInTheDocument();
    });

    it('exempts an ANONYMOUS passcode session (server-authorized show-wide by its claim)', async () => {
      mockIsAnonymous = true;
      judgeAssignmentsGetAll.mockResolvedValue([]);
      renderPage();

      expect(await screen.findByTestId('live-scoresheet')).toBeInTheDocument();
      // Anonymous sessions never consult judge_assignments — their claim
      // authorizes every class in the show.
      expect(judgeAssignmentsGetAll).not.toHaveBeenCalled();
    });

    it('exempts a manager ACCOUNT holding a judge passcode grant (server manager tier)', async () => {
      // A secretary who entered a JUDGE passcode has effective role 'judge', but
      // the server authorizes them via the manager tier regardless of assignment
      // — the gate must not block them.
      mockRoles = [UserRole.SECRETARY];
      useRingsideGrantStore.getState().setGrant({
        showId: 'show-1',
        role: 'judge',
        source: 'passcode',
      });
      judgeAssignmentsGetAll.mockResolvedValue([
        { id: 'a1', personId: 'someone-else', classId: 'class-1', status: 'confirmed' },
      ]);
      renderPage();

      expect(await screen.findByTestId('live-scoresheet')).toBeInTheDocument();
      expect(screen.queryByText("You're not assigned to judge this class")).not.toBeInTheDocument();
    });

    it('does not apply the pre-flight to a manager role (assignment-irrelevant)', async () => {
      mockRoles = [UserRole.SITE_ADMIN];
      judgeAssignmentsGetAll.mockResolvedValue([
        { id: 'a1', personId: 'someone-else', classId: 'class-1', status: 'confirmed' },
      ]);
      renderPage();

      expect(await screen.findByTestId('live-scoresheet')).toBeInTheDocument();
    });
  });

  // MYK9-76: the timer's 30-second chime/voice announcements were previously
  // silent because the callbacks were never passed to the live scoresheet.
  describe('timer audio (MYK9-76)', () => {
    it('wires the chime and voice announcement callbacks, enabled by default', async () => {
      renderPage();
      await screen.findByTestId('live-scoresheet');

      expect(screen.getByTestId('voice-announcements-enabled')).toHaveTextContent('true');

      fireEvent.click(screen.getByText('Fire warning chime'));
      expect(playWarning).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByText('Fire voice announcement'));
      expect(speakRemainingSeconds).toHaveBeenCalledWith(30);
    });

    it('mutes via the toggle: disables voice announcements and zeroes chime volume', async () => {
      renderPage();
      await screen.findByTestId('live-scoresheet');

      fireEvent.click(screen.getByRole('button', { name: 'Mute timer sounds' }));

      expect(screen.getByTestId('voice-announcements-enabled')).toHaveTextContent('false');
      expect(vi.mocked(useAudioWarnings)).toHaveBeenLastCalledWith(
        expect.objectContaining({ volume: 0 })
      );

      fireEvent.click(screen.getByText('Fire voice announcement'));
      expect(speakRemainingSeconds).not.toHaveBeenCalled();

      // Unmuting restores both.
      fireEvent.click(screen.getByRole('button', { name: 'Unmute timer sounds' }));
      expect(screen.getByTestId('voice-announcements-enabled')).toHaveTextContent('true');
      expect(vi.mocked(useAudioWarnings)).toHaveBeenLastCalledWith(
        expect.objectContaining({ volume: expect.any(Number) })
      );
      expect(vi.mocked(useAudioWarnings).mock.calls.at(-1)?.[0].volume).toBeGreaterThan(0);
    });

    it('persists the mute preference across remounts', async () => {
      const first = renderPage();
      await screen.findByTestId('live-scoresheet');
      fireEvent.click(screen.getByRole('button', { name: 'Mute timer sounds' }));
      first.unmount();

      renderPage();
      await screen.findByTestId('live-scoresheet');
      expect(screen.getByTestId('voice-announcements-enabled')).toHaveTextContent('false');
    });
  });
});
