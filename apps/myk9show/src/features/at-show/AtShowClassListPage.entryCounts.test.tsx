/**
 * MYK9-637: the per-class entry counter on the judge's landing screen.
 *
 * Three properties, all of which were free to break silently before this file
 * existed:
 *
 *  1. A cold entries replica renders `—`, never `0 / 0`. `0 of 0 scored` on a
 *     66-entry class tells a judge there is nothing to run.
 *  2. A synced replica renders the real numbers. This is the mutation guard on
 *     the LAST HOP: the counter is computed in the hook and handed to
 *     `AtShowClassRow` through a prop, and deleting that prop wiring used to
 *     compile, stay green, and quietly reinstate the bug (LESSONS
 *     last-hop-drop).
 *  3. A signed-in judge whose assignments are UNKNOWN (offline cold boot:
 *     roles are cached, identity is not) sees `—`, not a count. The picker
 *     deliberately fails open to every class there, but a non-manager judge's
 *     entry visibility is per class -- so the rows for a class that is not
 *     theirs are absent for a reason that has nothing to do with its size.
 */

import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ReplicationSyncContext } from '@/context/ReplicationSyncContext';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';
import { UserRole, type UserWithRoles } from '@/types/auth-types';

vi.mock('@/services/replication', () => ({
  replicatedShowsTable: { getShowById: vi.fn() },
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
  replicatedDogsTable: { getAllDogs: vi.fn().mockResolvedValue([]) },
}));

const mockJudgeAssignmentData = vi.hoisted(() => ({
  getActive: vi.fn(),
  subscribe: vi.fn(() => vi.fn()),
}));

vi.mock('@/services/database/judges', () => ({
  getActiveJudgeAssignmentsForShow: mockJudgeAssignmentData.getActive,
  subscribeToJudgeAssignmentChanges: mockJudgeAssignmentData.subscribe,
}));

const mockAuthState = vi.hoisted(() => ({
  hasRole: (_role: unknown): boolean => false,
  userWithRoles: null as UserWithRoles | null,
  user: null as { is_anonymous?: boolean } | null,
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => mockAuthState,
}));

import { AtShowClassListPage } from './AtShowClassListPage';
import {
  replicatedShowsTable,
  replicatedTrialsTable,
  replicatedClassesTable,
  replicatedEntriesTable,
} from '@/services/replication';

const INTERIOR_ADVANCED = {
  id: 'class-interior-advanced',
  element: 'Interior',
  level: 'Advanced',
  section: '-',
  classStatus: 'setup',
  classOrder: 1,
  judgeName: 'Test Judge',
};
const BURIED_MASTER = {
  id: 'class-buried-master',
  element: 'Buried',
  level: 'Master',
  section: '-',
  classStatus: 'setup',
  classOrder: 2,
  judgeName: 'Test Judge',
};

/** Three entries in Interior Advanced, one of them scored; none in Buried Master. */
const ENTRIES = [
  { id: 'e1', showId: 'show-1', classId: INTERIOR_ADVANCED.id, isScored: true },
  { id: 'e2', showId: 'show-1', classId: INTERIOR_ADVANCED.id, isScored: false },
  { id: 'e3', showId: 'show-1', classId: INTERIOR_ADVANCED.id, isScored: false },
];

function seed({ synced }: { synced: boolean }) {
  vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue({
    name: 'Heartland Scent Work Classic',
    organization: 'AKC Scent Work',
  } as never);
  vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([
    { id: 'trial-1', trialNumber: 1, date: '2026-06-01' },
  ] as never);
  vi.mocked(replicatedClassesTable.getClassesByTrial).mockResolvedValue([
    INTERIOR_ADVANCED,
    BURIED_MASTER,
  ] as never);
  // A cold replica holds no rows AND no scope metadata; both are what "never
  // synced" looks like, and they must be seeded together or the test proves
  // nothing about the discriminator.
  vi.mocked(replicatedEntriesTable.getEntriesByShow).mockResolvedValue(
    (synced ? ENTRIES : []) as never
  );
  vi.mocked(replicatedEntriesTable.getSyncMetadata).mockResolvedValue(
    (synced ? { totalRows: ENTRIES.length } : null) as never
  );
  vi.mocked(replicatedEntriesTable.sync).mockResolvedValue({ success: true } as never);
  vi.mocked(replicatedTrialsTable.sync).mockResolvedValue({ success: true } as never);
  vi.mocked(replicatedClassesTable.sync).mockResolvedValue({ success: true } as never);
  mockJudgeAssignmentData.getActive.mockResolvedValue([]);
}

const settledSyncStatus: ReplicationSyncContextValue['status'] = {
  isSyncing: false,
  lastSyncAt: new Date('2026-06-01T12:00:00Z'),
  error: null,
  tablesStatus: {
    shows: 'success',
    trials: 'success',
    classes: 'success',
    entries: 'success',
    judge_assignments: 'success',
  },
};

const renderPage = () =>
  render(
    <ReplicationSyncContext.Provider
      value={{ status: settledSyncStatus, triggerSync: vi.fn(), syncTable: vi.fn() }}
    >
      <Routes>
        <Route path="/at-show/:showId" element={<AtShowClassListPage />} />
      </Routes>
    </ReplicationSyncContext.Provider>,
    { initialRoute: '/at-show/show-1' }
  );

describe('AtShowClassListPage entry counters (MYK9-637)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockAuthState.hasRole = () => false;
    mockAuthState.userWithRoles = null;
    mockAuthState.user = null;
  });

  it('never spells a cold, never-synced replica as 0 / 0', async () => {
    seed({ synced: false });

    renderPage();

    expect(await screen.findByText(/Interior Advanced/)).toBeInTheDocument();
    expect(screen.queryByText('0 / 0')).not.toBeInTheDocument();
    expect(screen.queryByText('0 of 0 scored')).not.toBeInTheDocument();
    expect(screen.getAllByText('Entry count not loaded yet')).toHaveLength(2);
  });

  it('renders the real counts once the show scope has synced', async () => {
    seed({ synced: true });

    renderPage();

    expect(await screen.findByText('1 / 3')).toBeInTheDocument();
    expect(screen.getByText('1 of 3 scored')).toBeInTheDocument();
    // A genuinely empty class is allowed to say zero once the read is trusted.
    expect(screen.getByText('0 / 0')).toBeInTheDocument();
    expect(screen.queryByText('Entry count not loaded yet')).not.toBeInTheDocument();
  });

  it('withholds counts from a judge whose assignments are unknown', async () => {
    seed({ synced: true });
    mockAuthState.hasRole = role => role === UserRole.JUDGE;
    mockAuthState.user = { is_anonymous: false };
    // No `databaseUserId`: the offline cold boot where roles are cached but
    // identity is not. The picker fails open to every class; the counts must
    // not follow it, because this judge's replica holds only assigned rows.
    mockAuthState.userWithRoles = {} as UserWithRoles;

    renderPage();

    expect(await screen.findByText(/Interior Advanced/)).toBeInTheDocument();
    expect(screen.getAllByText('Entry count not loaded yet')).toHaveLength(2);
    expect(screen.queryByText('1 / 3')).not.toBeInTheDocument();
  });
});
