import '@/test/utils/pageRenderWait';
/**
 * MYK9-1970: the class list's next-up line follows the one paper claim end to end
 * (`useAtShowClassCards` -> `AtShowClassRow`), with only the replicated rows mocked.
 */

import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ReplicationSyncTestProvider } from '@/test/utils/ReplicationSyncTestProvider';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';
import type { UserWithRoles } from '@/types/auth-types';

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

// The picker resolves the ringside role (for Class Options gating) the way the
// entry list does; this suite holds no RBAC role, so no one may manage classes.
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    ...mockAuthState,
    personId: mockAuthState.userWithRoles?.databaseUserId ?? null,
    getUserRoles: () => [],
  }),
  getPrimaryRole: () => null,
}));

import { AtShowClassListPage } from './AtShowClassListPage';
import {
  replicatedShowsTable,
  replicatedTrialsTable,
  replicatedClassesTable,
  replicatedEntriesTable,
} from '@/services/replication';

const LIVE_CLASS = {
  id: 'class-live',
  element: 'Interior',
  level: 'Advanced',
  section: '-',
  classStatus: 'in_progress',
  classOrder: 1,
  judgeName: 'Test Judge',
  scoresOnPaper: null as boolean | null,
};

const ENTRIES = [
  { id: 'e1', showId: 'show-1', classId: LIVE_CLASS.id, armband: '12', checkInStatus: 'in-ring' },
  {
    id: 'e2',
    showId: 'show-1',
    classId: LIVE_CLASS.id,
    armband: '13',
    checkInStatus: 'checked-in',
  },
  {
    id: 'e3',
    showId: 'show-1',
    classId: LIVE_CLASS.id,
    armband: '14',
    checkInStatus: 'checked-in',
  },
];

function seed(usesDeviceScoring: boolean) {
  vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue({
    name: 'Heartland Scent Work Classic',
    organization: 'AKC Scent Work',
    usesDeviceScoring,
  } as never);
  vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([
    { id: 'trial-1', trialNumber: 1, date: '2026-06-01' },
  ] as never);
  vi.mocked(replicatedClassesTable.getClassesByTrial).mockResolvedValue([LIVE_CLASS] as never);
  vi.mocked(replicatedEntriesTable.getEntriesByShow).mockResolvedValue(ENTRIES as never);
  vi.mocked(replicatedEntriesTable.getSyncMetadata).mockResolvedValue({
    totalRows: ENTRIES.length,
  } as never);
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
    <ReplicationSyncTestProvider
      value={{ status: settledSyncStatus, triggerSync: vi.fn(), syncTable: vi.fn() }}
    >
      <Routes>
        <Route path="/at-show/:showId" element={<AtShowClassListPage />} />
      </Routes>
    </ReplicationSyncTestProvider>,
    { initialRoute: '/at-show/show-1' }
  );

describe('AtShowClassListPage next-up follows the paper claim (MYK9-1970)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockAuthState.hasRole = () => false;
    mockAuthState.userWithRoles = null;
    mockAuthState.user = null;
  });

  it('shows next-up for a class that follows a device-scored show', async () => {
    seed(true);
    renderPage();
    expect(await screen.findByText(/\d of \d remaining/)).toBeInTheDocument();
  });

  it('hides next-up for a class that follows a paper show', async () => {
    seed(false);
    renderPage();
    expect(await screen.findByText(/Interior Advanced/)).toBeInTheDocument();
    // Give the claim read time to land: a late answer must not bring the line back.
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(screen.queryByText(/remaining/)).not.toBeInTheDocument();
  });
});
