import '@/test/utils/pageRenderWait';
/**
 * MYK9-2014: a judge who reloads the class list with no signal keeps "Your ring",
 * the same classes, and each class's scored count from the device's copy.
 *
 * The device reads are mocked the way a primed phone answers them. The auth mock
 * models a cold offline boot exactly: the network `people` lookup never answers
 * (`databaseUserId` undefined) while the device-saved pairing (`personId`) and the
 * cached roles are present. The "reload" is a fresh render of the page against the
 * same device data, with the browser offline for both the page and react-query.
 */

import { Routes, Route } from 'react-router-dom';
import { onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@/test/utils/testUtils';
import { ReplicationSyncTestProvider } from '@/test/utils/ReplicationSyncTestProvider';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';
import { UserRole, type UserWithRoles } from '@/types/auth-types';

vi.mock('@/services/replication', () => ({
  replicatedArmbandsTable: {
    getByShow: vi.fn(async () => []),
    sync: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  },
  replicatedShowsTable: { getShowById: vi.fn(), subscribe: vi.fn(() => vi.fn()) },
  replicatedTrialsTable: {
    getTrialsByShow: vi.fn(),
    getSyncMetadata: vi.fn(),
    sync: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  },
  replicatedClassesTable: {
    getClassesByTrial: vi.fn(),
    getSyncMetadata: vi.fn(),
    sync: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  },
  replicatedEntriesTable: {
    getEntriesByShow: vi.fn(),
    getSyncMetadata: vi.fn(),
    sync: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  },
}));

const judgeAssignmentData = vi.hoisted(() => ({
  getActive: vi.fn(),
  subscribe: vi.fn(() => vi.fn()),
}));

vi.mock('@/services/database/judges', () => ({
  getActiveJudgeAssignmentsForShow: judgeAssignmentData.getActive,
  subscribeToJudgeAssignmentChanges: judgeAssignmentData.subscribe,
}));

const authState = vi.hoisted(() => ({
  hasRole: (_role: unknown): boolean => false,
  userWithRoles: null as UserWithRoles | null,
  personId: null as string | null,
  user: null as { is_anonymous?: boolean; app_metadata?: Record<string, unknown> } | null,
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ ...authState, getUserRoles: () => [] }),
  getPrimaryRole: () => null,
}));

import { AtShowClassListPage } from './AtShowClassListPage';
import {
  replicatedClassesTable,
  replicatedEntriesTable,
  replicatedShowsTable,
  replicatedTrialsTable,
} from '@/services/replication';

const MY_CLASS = {
  id: 'class-mine',
  element: 'Interior',
  level: 'Advanced',
  section: '-',
  classStatus: 'setup',
  classOrder: 1,
  judgeName: 'Test Judge',
};
const OTHER_JUDGES_CLASS = {
  id: 'class-other',
  element: 'Buried',
  level: 'Master',
  section: '-',
  classStatus: 'setup',
  classOrder: 2,
  judgeName: 'Someone Else',
};
const UNASSIGNED_CLASS = {
  id: 'class-unassigned',
  element: 'Exterior',
  level: 'Excellent',
  section: '-',
  classStatus: 'setup',
  classOrder: 3,
  judgeName: null,
};

/** Five entries in this judge's class, two scored. */
const MY_ENTRIES = ['e1', 'e2', 'e3', 'e4', 'e5'].map((id, index) => ({
  id,
  showId: 'show-1',
  classId: MY_CLASS.id,
  isScored: index < 2,
}));

/** What the provider reports offline: it skips every sync, so each table stays idle. */
const offlineSyncStatus: ReplicationSyncContextValue['status'] = {
  isSyncing: false,
  lastSyncAt: null,
  error: null,
  tablesStatus: {
    shows: 'idle',
    trials: 'idle',
    classes: 'idle',
    entries: 'idle',
    judge_assignments: 'idle',
  },
};

function seedPrimedDevice() {
  vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue({
    name: 'Heartland Scent Work Classic',
    organization: 'AKC Scent Work',
  } as never);
  vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([
    { id: 'trial-1', trialNumber: 1, date: '2026-06-01' },
  ] as never);
  vi.mocked(replicatedClassesTable.getClassesByTrial).mockResolvedValue([
    MY_CLASS,
    OTHER_JUDGES_CLASS,
    UNASSIGNED_CLASS,
  ] as never);
  vi.mocked(replicatedEntriesTable.getEntriesByShow).mockResolvedValue(MY_ENTRIES as never);
  vi.mocked(replicatedEntriesTable.getSyncMetadata).mockResolvedValue({
    totalRows: MY_ENTRIES.length,
  } as never);
  vi.mocked(replicatedTrialsTable.getSyncMetadata).mockResolvedValue({
    expectedRemoteRows: 1,
  } as never);
  vi.mocked(replicatedClassesTable.getSyncMetadata).mockResolvedValue({
    expectedRemoteRows: 3,
  } as never);
  judgeAssignmentData.getActive.mockImplementation(async (_showId: string, personId: string) =>
    personId === 'judge-1' ? [{ id: 'a1', classId: MY_CLASS.id }] : []
  );
}

function goOffline() {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
  onlineManager.setOnline(false);
}

function goOnline() {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  onlineManager.setOnline(true);
}

function renderPage() {
  return render(
    <ReplicationSyncTestProvider
      value={{ status: offlineSyncStatus, triggerSync: vi.fn(), syncTable: vi.fn() }}
    >
      <Routes>
        <Route path="/at-show/:showId" element={<AtShowClassListPage />} />
      </Routes>
    </ReplicationSyncTestProvider>,
    { initialRoute: '/at-show/show-1' }
  );
}

function expectScopedToMyRing() {
  const yourRing = screen.getByRole('region', { name: 'Your ring' });
  expect(within(yourRing).getByText(/Interior Advanced/)).toBeInTheDocument();
  expect(within(yourRing).getByText('2 of 5 scored')).toBeInTheDocument();
  expect(screen.queryByText(/Buried Master/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Exterior Excellent/)).not.toBeInTheDocument();
  expect(screen.queryByText('Entry count not loaded yet')).not.toBeInTheDocument();
}

describe('AtShowClassListPage after a reload with no signal (MYK9-2014)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    authState.hasRole = () => false;
    authState.userWithRoles = null;
    authState.personId = null;
    authState.user = null;
  });

  afterEach(() => {
    goOnline();
  });

  it('keeps "Your ring" and its scored counts for an account judge', async () => {
    seedPrimedDevice();
    authState.hasRole = role => role === UserRole.JUDGE;
    authState.user = { is_anonymous: false };
    // Cold offline boot: the network lookup never answered, the saved pairing did.
    authState.userWithRoles = {} as UserWithRoles;
    authState.personId = 'judge-1';
    goOffline();

    renderPage();

    expect(await screen.findByRole('region', { name: 'Your ring' })).toBeInTheDocument();
    expectScopedToMyRing();
    expect(judgeAssignmentData.getActive).toHaveBeenCalledWith('show-1', 'judge-1');
  });

  it('keeps the same scope and counts for a judge on a passcode', async () => {
    seedPrimedDevice();
    authState.user = {
      is_anonymous: true,
      app_metadata: {
        kind: 'ringside_passcode',
        show_id: 'show-1',
        ringside_role: 'judge',
        ringside_person_id: 'judge-1',
      },
    };
    goOffline();

    renderPage();

    expect(await screen.findByRole('region', { name: 'Your ring' })).toBeInTheDocument();
    expectScopedToMyRing();
  });

  it('shows no other judge classes when the person pairing is not on the device', async () => {
    seedPrimedDevice();
    authState.hasRole = role => role === UserRole.JUDGE;
    authState.user = { is_anonymous: false };
    authState.userWithRoles = {} as UserWithRoles;
    authState.personId = null;
    goOffline();

    renderPage();

    expect(await screen.findByText('Your classes are not on this device yet')).toBeInTheDocument();
    expect(screen.queryByText(/Interior Advanced/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Buried Master/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Exterior Excellent/)).not.toBeInTheDocument();
  });

  it('offers a way on to every class when scope is unknown, so the judge is never stuck', async () => {
    seedPrimedDevice();
    authState.hasRole = role => role === UserRole.JUDGE;
    authState.user = { is_anonymous: false };
    authState.userWithRoles = {} as UserWithRoles;
    authState.personId = null;
    goOffline();

    const { user } = renderPage();

    await user.click(await screen.findByRole('button', { name: 'Show every class in this show' }));

    expect(await screen.findByText(/Interior Advanced/)).toBeInTheDocument();
    expect(screen.getByText(/Buried Master/)).toBeInTheDocument();
  });
});
