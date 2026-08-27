/**
 * Offline truthfulness for the at-show class picker.
 *
 * The picker reads IndexedDB but inherited React Query's default
 * networkMode:'online', so offline every query PAUSED: `isLoading` false,
 * `data` undefined, `error` null. Each branch downstream read that settled
 * shape as a fact about the show. These tests pin the three claims that were
 * wrong, using the real pause mechanism (`onlineManager.setOnline(false)`)
 * rather than a stubbed hook -- a hand-stubbed "offline" cannot reproduce a
 * paused query, which is the whole defect.
 */
import { Route, Routes } from 'react-router-dom';
import { onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { ReplicationSyncContext } from '@/context/ReplicationSyncContext';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';
import { UserRole, type UserWithRoles } from '@/types/auth-types';

const judgeAssignmentData = vi.hoisted(() => ({
  getActive: vi.fn(),
  subscribe: vi.fn(() => vi.fn()),
}));

vi.mock('@/services/replication', () => ({
  replicatedShowsTable: { getShowById: vi.fn() },
  replicatedTrialsTable: { getTrialsByShow: vi.fn(), subscribe: vi.fn(() => vi.fn()) },
  replicatedClassesTable: { getClassesByTrial: vi.fn(), subscribe: vi.fn(() => vi.fn()) },
  replicatedEntriesTable: { getEntriesByShow: vi.fn(), subscribe: vi.fn(() => vi.fn()) },
}));

vi.mock('@/services/database/judges', () => ({
  getActiveJudgeAssignmentsForShow: judgeAssignmentData.getActive,
  subscribeToJudgeAssignmentChanges: judgeAssignmentData.subscribe,
}));

const authState = vi.hoisted(() => ({
  hasRole: (_role: unknown): boolean => false,
  userWithRoles: null as UserWithRoles | null,
  user: null as { is_anonymous?: boolean } | null,
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => authState,
}));

import { AtShowClassListPage } from './AtShowClassListPage';
import {
  replicatedClassesTable,
  replicatedEntriesTable,
  replicatedShowsTable,
  replicatedTrialsTable,
} from '@/services/replication';

const CONTAINER_NOVICE = {
  id: 'class-a',
  element: 'Container',
  level: 'Novice',
  section: '-',
  classStatus: 'setup',
  classOrder: 1,
  judgeName: 'Judge J',
};

/** Every table 'idle': what the provider reports offline, since it skips sync. */
const neverSyncedStatus: ReplicationSyncContextValue['status'] = {
  isSyncing: false,
  lastSyncAt: null,
  error: null,
  tablesStatus: { shows: 'idle', trials: 'idle', classes: 'idle', entries: 'idle' },
};

const syncedStatus: ReplicationSyncContextValue['status'] = {
  isSyncing: false,
  lastSyncAt: new Date('2026-06-01T12:00:00Z'),
  error: null,
  tablesStatus: { shows: 'success', trials: 'success', classes: 'success', entries: 'success' },
};

function seedPrimedDevice() {
  vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue({
    name: 'Spring Trial',
    organization: 'AKC Scent Work',
  } as never);
  vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([
    { id: 'trial-1', trialNumber: 1, date: '2026-06-01' },
  ] as never);
  vi.mocked(replicatedClassesTable.getClassesByTrial).mockResolvedValue([
    CONTAINER_NOVICE,
  ] as never);
  vi.mocked(replicatedEntriesTable.getEntriesByShow).mockResolvedValue([] as never);
  judgeAssignmentData.getActive.mockResolvedValue([]);
}

/** Nothing has ever reached this device's IndexedDB. */
function seedColdDevice() {
  vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue(null as never);
  vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([] as never);
  vi.mocked(replicatedClassesTable.getClassesByTrial).mockResolvedValue([] as never);
  vi.mocked(replicatedEntriesTable.getEntriesByShow).mockResolvedValue([] as never);
  judgeAssignmentData.getActive.mockResolvedValue([]);
}

/**
 * Going offline moves TWO things that this page reads independently:
 * react-query's `onlineManager` (which decides whether a query pauses) and
 * `navigator.onLine` (which `useOnlineStatus` reads). Moving only one leaves a
 * state a real browser never produces, so the helper moves both together.
 */
function goOffline() {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
  onlineManager.setOnline(false);
}

function goOnline() {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  onlineManager.setOnline(true);
}

function renderPage(syncStatus: ReplicationSyncContextValue['status']) {
  return render(
    <ReplicationSyncContext.Provider
      value={{ status: syncStatus, triggerSync: vi.fn(), syncTable: vi.fn() }}
    >
      <Routes>
        <Route path="/at-show/:showId" element={<AtShowClassListPage />} />
      </Routes>
    </ReplicationSyncContext.Provider>,
    { initialRoute: '/at-show/show-1' }
  );
}

describe('AtShowClassListPage offline truthfulness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    authState.hasRole = () => false;
    authState.userWithRoles = null;
    authState.user = null;
  });

  afterEach(() => {
    // Global to react-query: leaking it offline fails every later suite.
    goOnline();
  });

  it('renders the cached classes offline instead of a skeleton that never resolves', async () => {
    // The device is primed, but the provider skips sync while offline so every
    // table stays 'idle' -- which the pending-first-sync helper counts as
    // "still loading" forever. The judge is at the ring with the whole show in
    // IndexedDB beneath them.
    seedPrimedDevice();
    goOffline();

    renderPage(neverSyncedStatus);

    expect(await screen.findByText(/Container Novice/)).toBeInTheDocument();
    expect(
      screen.queryByRole('status', { name: 'Loading at-show classes' })
    ).not.toBeInTheDocument();
  });

  it('does not tell an offline judge their secretary never assigned them', async () => {
    // Roles survive a cold offline boot via the MYK9-200 permissions cache;
    // databaseUserId does not, because it comes from a network `people` lookup.
    // So hasRole(JUDGE) is true while the identity is undefined -- assignments
    // are unknowable, and the page used to report them as absent.
    authState.hasRole = role => role === UserRole.JUDGE;
    authState.userWithRoles = {} as UserWithRoles; // no databaseUserId
    authState.user = { is_anonymous: false };
    seedPrimedDevice();
    goOffline();

    renderPage(neverSyncedStatus);

    await waitFor(() => expect(screen.getByText(/Container Novice/)).toBeInTheDocument());
    expect(screen.queryByText(/No classes assigned yet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/has not assigned you to a class/)).not.toBeInTheDocument();
  });

  it('says the classes are not on this device rather than that the show has none', async () => {
    seedColdDevice();
    goOffline();

    renderPage(neverSyncedStatus);

    expect(await screen.findByText(/Classes not on this device yet/)).toBeInTheDocument();
    expect(screen.queryByText(/This show has no classes yet/)).not.toBeInTheDocument();
  });

  it('does not blame the show when the first sync errored while online', async () => {
    // Venue wifi that associates but does not carry. The table lands on
    // 'error', which the pending-first-sync helper does NOT count (it only
    // counts idle/syncing), and getAll() catches the read failure and returns
    // [] so the query reports no error either. Every signal says "settled and
    // empty" while nothing was ever read -- and the device IS online, so a
    // guard written only around connectivity misses it entirely.
    seedColdDevice();

    renderPage({
      ...neverSyncedStatus,
      // The sync ran and failed, so every scope it covers lands on 'error'.
      // Leaving siblings at 'idle' would be a state no failed sync produces,
      // and the skeleton would legitimately win because those really are
      // still pending.
      tablesStatus: { shows: 'error', trials: 'error', classes: 'error', entries: 'error' },
    });

    expect(await screen.findByText(/could not be loaded onto this device/i)).toBeInTheDocument();
    expect(screen.queryByText(/This show has no classes yet/)).not.toBeInTheDocument();
  });

  it('still reports a genuinely empty show as empty when online and synced', async () => {
    // The guard must not swallow the real zero: online, sync succeeded, and the
    // show truly has no classes.
    seedColdDevice();

    renderPage(syncedStatus);

    expect(await screen.findByText(/This show has no classes yet/)).toBeInTheDocument();
    expect(screen.queryByText(/Classes not on this device yet/)).not.toBeInTheDocument();
  });
});
