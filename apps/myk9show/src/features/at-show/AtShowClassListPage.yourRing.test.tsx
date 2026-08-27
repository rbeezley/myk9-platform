import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@/test/utils/testUtils';
import { ReplicationSyncContext } from '@/context/ReplicationSyncContext';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';
import { UserRole, type UserWithRoles } from '@/types/auth-types';

const judgeAssignmentSubscription = vi.hoisted(() => ({
  onChange: null as (() => void) | null,
}));

const judgeAssignmentData = vi.hoisted(() => ({
  getActive: vi.fn(),
  subscribe: vi.fn((onChange: () => void) => {
    judgeAssignmentSubscription.onChange = onChange;
    return vi.fn();
  }),
}));

const syncJudgeAssignments = vi.hoisted(() => vi.fn());

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

const NOVICE_A = {
  id: 'class-a',
  element: 'Container',
  level: 'Novice',
  section: 'A',
  classStatus: 'no-status',
  classOrder: 2,
  judgeName: 'Judge J',
};
const NOVICE_B = { ...NOVICE_A, id: 'class-b', section: 'B', classOrder: 3 };
const INTERIOR_EXCELLENT = {
  id: 'class-c',
  element: 'Interior',
  level: 'Excellent',
  section: '-',
  classStatus: 'setup',
  classOrder: 1,
  judgeName: 'Judge J',
};
const BURIED_ADVANCED = {
  id: 'class-e',
  element: 'Buried',
  level: 'Advanced',
  section: '-',
  classStatus: 'setup',
  classOrder: 4,
  judgeName: 'Judge K',
};

const settledSyncStatus: ReplicationSyncContextValue['status'] = {
  isSyncing: false,
  lastSyncAt: new Date('2026-06-01T12:00:00Z'),
  error: null,
  tablesStatus: {
    shows: 'success',
    trials: 'success',
    classes: 'success',
    entries: 'success',
  },
};

function seedClassList() {
  vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue({
    name: 'Spring Trial',
    organization: 'AKC Scent Work',
  } as never);
  vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([
    { id: 'trial-1', trialNumber: 1, date: '2026-06-01' },
  ] as never);
  vi.mocked(replicatedClassesTable.getClassesByTrial).mockResolvedValue([
    NOVICE_A,
    NOVICE_B,
    INTERIOR_EXCELLENT,
    BURIED_ADVANCED,
  ] as never);
  vi.mocked(replicatedEntriesTable.getEntriesByShow).mockResolvedValue([
    { id: 'entry-a', classId: 'class-a', isScored: true },
    { id: 'entry-c', classId: 'class-c', isScored: false },
  ] as never);
  judgeAssignmentData.getActive.mockResolvedValue([]);
}

function renderPage(syncStatus = settledSyncStatus) {
  return render(
    <ReplicationSyncContext.Provider
      value={{
        status: syncStatus,
        triggerSync: vi.fn(),
        syncTable: syncJudgeAssignments,
      }}
    >
      <Routes>
        <Route path="/at-show/:showId" element={<AtShowClassListPage />} />
      </Routes>
    </ReplicationSyncContext.Provider>,
    { initialRoute: '/at-show/show-1' }
  );
}

describe('AtShowClassListPage Your ring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    judgeAssignmentSubscription.onChange = null;
    syncJudgeAssignments.mockReset();
    syncJudgeAssignments.mockResolvedValue(undefined);
    authState.hasRole = () => false;
    authState.userWithRoles = null;
    authState.user = null;
    seedClassList();
  });

  it('pins exactly the signed-in judge assignments live-first without requiring favorites', async () => {
    authState.hasRole = role => role === UserRole.JUDGE;
    authState.userWithRoles = { databaseUserId: 'judge-1' } as UserWithRoles;
    authState.user = { is_anonymous: false };
    window.localStorage.setItem('favorites_show-1_trial-1', JSON.stringify(['class-c']));
    judgeAssignmentData.getActive.mockResolvedValue([
      {
        id: 'assignment-live',
        personId: 'judge-1',
        classId: 'class-a',
        status: 'confirmed',
      },
      {
        id: 'assignment-favorite',
        personId: 'judge-1',
        classId: 'class-c',
        status: 'invited',
      },
    ] as never);

    renderPage();

    const yourRing = await screen.findByRole('region', { name: 'Your ring' });
    const liveClass = within(yourRing).getByText(/Container Novice/);
    const favoriteSetupClass = within(yourRing).getByText(/Interior Excellent/);
    expect(liveClass.compareDocumentPosition(favoriteSetupClass)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(within(yourRing).queryByText(/Buried Advanced/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Buried Advanced/)).not.toBeInTheDocument();
    expect(yourRing.compareDocumentPosition(screen.getByTestId('at-show-trial-trial-1'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('keeps the class list stable while the judge assignment cache is loading', async () => {
    authState.hasRole = role => role === UserRole.JUDGE;
    authState.userWithRoles = { databaseUserId: 'judge-1' } as UserWithRoles;
    authState.user = { is_anonymous: false };
    let resolveAssignments: (assignments: never[]) => void = () => undefined;
    judgeAssignmentData.getActive.mockReturnValue(
      new Promise(resolve => {
        resolveAssignments = resolve;
      })
    );

    renderPage();

    await waitFor(() => expect(replicatedClassesTable.getClassesByTrial).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('status', { name: 'Loading at-show classes' })).toBeInTheDocument();
    expect(screen.queryByText(/Container Novice/)).not.toBeInTheDocument();

    resolveAssignments([]);
    expect(await screen.findByText('No classes assigned yet')).toBeInTheDocument();
  });

  it('waits for the first judge assignment sync before accepting an empty cache', async () => {
    authState.hasRole = role => role === UserRole.JUDGE;
    authState.userWithRoles = { databaseUserId: 'judge-1' } as UserWithRoles;
    authState.user = { is_anonymous: false };

    renderPage({
      ...settledSyncStatus,
      isSyncing: true,
      lastSyncAt: null,
      tablesStatus: {
        ...settledSyncStatus.tablesStatus,
        judge_assignments: 'syncing',
      },
    });

    await waitFor(() => expect(judgeAssignmentData.getActive).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('status', { name: 'Loading at-show classes' })).toBeInTheDocument();
    expect(screen.queryByText(/Container Novice/)).not.toBeInTheDocument();
  });

  it('refreshes a previously synced empty cache before hiding Your ring', async () => {
    authState.hasRole = role => role === UserRole.JUDGE;
    authState.userWithRoles = { databaseUserId: 'judge-1' } as UserWithRoles;
    authState.user = { is_anonymous: false };
    judgeAssignmentData.getActive
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'assignment-a', personId: 'judge-1', classId: 'class-a', status: 'confirmed' },
      ] as never);

    renderPage({
      ...settledSyncStatus,
      tablesStatus: {
        ...settledSyncStatus.tablesStatus,
        judge_assignments: 'success',
      },
    });

    const yourRing = await screen.findByRole('region', { name: 'Your ring' });
    expect(within(yourRing).getByText(/Container Novice/)).toBeInTheDocument();
    expect(syncJudgeAssignments).toHaveBeenCalledTimes(1);
    expect(syncJudgeAssignments).toHaveBeenCalledWith('judge_assignments');
  });

  it('shows the full picker offline rather than waiting for a sync or claiming no assignments', async () => {
    authState.hasRole = role => role === UserRole.JUDGE;
    authState.userWithRoles = { databaseUserId: 'judge-1' } as UserWithRoles;
    authState.user = { is_anonymous: false };
    const onlineSpy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    try {
      renderPage({
        ...settledSyncStatus,
        lastSyncAt: null,
        tablesStatus: {
          ...settledSyncStatus.tablesStatus,
          judge_assignments: 'idle',
        },
      });

      // The guarantee this test was written for (#1452, "keep assignment
      // matching offline-safe") is the ABSENCE of a spinner: an empty cached
      // result must settle, not hang. That still holds.
      //
      // What changed is the claim made once it settles. judge_assignments has
      // never synced on this device, so an empty cache is unknown rather than
      // authoritative, and "your secretary has not assigned you" was a
      // statement about the secretary drawn from a table that was never read.
      // The picker now fails open to the full class list instead.
      expect(await screen.findByText(/Container Novice/)).toBeInTheDocument();
      expect(screen.queryByText('No classes assigned yet')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('status', { name: 'Loading at-show classes' })
      ).not.toBeInTheDocument();
    } finally {
      onlineSpy.mockRestore();
    }
  });

  it('sorts a combined A/B row live-first when section B is live', async () => {
    authState.hasRole = role => role === UserRole.JUDGE;
    authState.userWithRoles = { databaseUserId: 'judge-1' } as UserWithRoles;
    authState.user = { is_anonymous: false };
    vi.mocked(replicatedClassesTable.getClassesByTrial).mockResolvedValue([
      NOVICE_A,
      { ...NOVICE_B, classStatus: 'in_progress' },
      INTERIOR_EXCELLENT,
      BURIED_ADVANCED,
    ] as never);
    vi.mocked(replicatedEntriesTable.getEntriesByShow).mockResolvedValue([
      { id: 'entry-a', classId: 'class-a', isScored: false },
      { id: 'entry-c', classId: 'class-c', isScored: false },
    ] as never);
    judgeAssignmentData.getActive.mockResolvedValue([
      { id: 'assignment-a', personId: 'judge-1', classId: 'class-a', status: 'confirmed' },
      { id: 'assignment-b', personId: 'judge-1', classId: 'class-b', status: 'confirmed' },
      { id: 'assignment-c', personId: 'judge-1', classId: 'class-c', status: 'confirmed' },
    ] as never);

    renderPage();

    const yourRing = await screen.findByRole('region', { name: 'Your ring' });
    const combinedLiveClass = within(yourRing).getByText(/Container Novice A & B/);
    const setupClass = within(yourRing).getByText(/Interior Excellent/);
    expect(combinedLiveClass.compareDocumentPosition(setupClass)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('shows a clear no-assignment state without unrelated classes', async () => {
    authState.hasRole = role => role === UserRole.JUDGE;
    authState.userWithRoles = { databaseUserId: 'judge-without-assignments' } as UserWithRoles;
    authState.user = { is_anonymous: false };

    renderPage();

    expect(await screen.findByText('No classes assigned yet')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Your ring' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Container Novice/)).not.toBeInTheDocument();
  });

  it('does not guess a judge identity for an anonymous passcode session', async () => {
    authState.hasRole = role => role === UserRole.JUDGE;
    authState.userWithRoles = { databaseUserId: 'should-not-be-used' } as UserWithRoles;
    authState.user = { is_anonymous: true };

    renderPage();

    expect(await screen.findByText(/Container Novice/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Your ring' })).not.toBeInTheDocument();
    expect(judgeAssignmentData.getActive).not.toHaveBeenCalled();
  });

  it('refreshes Your ring when replicated judge assignments change', async () => {
    authState.hasRole = role => role === UserRole.JUDGE;
    authState.userWithRoles = { databaseUserId: 'judge-1' } as UserWithRoles;
    authState.user = { is_anonymous: false };
    judgeAssignmentData.getActive.mockResolvedValueOnce([] as never).mockResolvedValue([
      {
        id: 'assignment-live',
        personId: 'judge-1',
        classId: 'class-a',
        status: 'confirmed',
      },
    ] as never);

    renderPage();

    expect(await screen.findByText('No classes assigned yet')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Your ring' })).not.toBeInTheDocument();
    act(() => judgeAssignmentSubscription.onChange?.());

    const yourRing = await screen.findByRole('region', { name: 'Your ring' });
    expect(within(yourRing).getByText(/Container Novice/)).toBeInTheDocument();
  });

  it('blocks unrelated classes and offers a retry when assignments fail to load', async () => {
    authState.hasRole = role => role === UserRole.JUDGE;
    authState.userWithRoles = { databaseUserId: 'judge-1' } as UserWithRoles;
    authState.user = { is_anonymous: false };
    judgeAssignmentData.getActive.mockRejectedValueOnce(new Error('IndexedDB unavailable'));

    const { user } = renderPage();

    expect(await screen.findByText("We couldn't load your judge assignments")).toBeInTheDocument();
    expect(screen.queryByText(/Container Novice/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(syncJudgeAssignments).toHaveBeenCalledWith('judge_assignments');
  });
});
