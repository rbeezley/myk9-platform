/**
 * MYK9-1743: the class card's entry count follows entries added elsewhere,
 * after the refresh tap and, with no tap at all, on a show-change signal.
 */

import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@/test/utils/testUtils';
import { ReplicationSyncTestProvider } from '@/test/utils/ReplicationSyncTestProvider';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';
import type { UserWithRoles } from '@/types/auth-types';
import type { ShowChangeSignal } from '@/features/show-live-sync/showChangeSignal';

vi.mock('@/services/replication', () => ({
  replicatedArmbandsTable: {
    getByShow: vi.fn(async () => []),
    sync: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  },
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
}));

const mockJudgeAssignmentData = vi.hoisted(() => ({
  getActive: vi.fn(),
  subscribe: vi.fn(() => vi.fn()),
}));

vi.mock('@/services/database/judges', () => ({
  getActiveJudgeAssignmentsForShow: mockJudgeAssignmentData.getActive,
  subscribeToJudgeAssignmentChanges: mockJudgeAssignmentData.subscribe,
}));

const showChange = vi.hoisted(() => ({
  listener: null as ((signal: ShowChangeSignal) => void) | null,
}));
vi.mock('@/features/show-live-sync/showChangeSignal', () => ({
  subscribeToShowChanges: (_showId: string, listener: (signal: ShowChangeSignal) => void) => {
    showChange.listener = listener;
    return () => {
      showChange.listener = null;
    };
  },
}));

const mockAuthState = vi.hoisted(() => ({
  hasRole: (_role: unknown): boolean => false,
  userWithRoles: null as UserWithRoles | null,
  user: null as { is_anonymous?: boolean } | null,
}));

// The picker resolves the ringside role (for Class Options gating) the way the
// entry list does; this suite holds no RBAC role, so no one may manage classes.
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ ...mockAuthState, getUserRoles: () => [] }),
  getPrimaryRole: () => null,
}));

import { AtShowClassListPage } from './AtShowClassListPage';
import {
  replicatedShowsTable,
  replicatedTrialsTable,
  replicatedClassesTable,
  replicatedEntriesTable,
} from '@/services/replication';

const CLASS = {
  id: 'class-1',
  element: 'Interior',
  level: 'Advanced',
  section: '-',
  classStatus: 'setup',
  classOrder: 1,
  judgeName: 'Test Judge',
};
const entriesFor = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    showId: 'show-1',
    classId: CLASS.id,
    isScored: false,
  }));

const settled: ReplicationSyncContextValue['status'] = {
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
      value={{ status: settled, triggerSync: vi.fn(), syncTable: vi.fn() }}
    >
      <Routes>
        <Route path="/at-show/:showId" element={<AtShowClassListPage />} />
      </Routes>
    </ReplicationSyncTestProvider>,
    { initialRoute: '/at-show/show-1' }
  );

describe('AtShowClassListPage entry count freshness (MYK9-1743)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    showChange.listener = null;
    vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue({
      name: 'Show',
      organization: 'AKC Scent Work',
    } as never);
    vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([
      { id: 'trial-1', trialNumber: 1, date: '2026-06-01' },
    ] as never);
    vi.mocked(replicatedClassesTable.getClassesByTrial).mockResolvedValue([CLASS] as never);
    vi.mocked(replicatedEntriesTable.getEntriesByShow).mockResolvedValue(entriesFor(1) as never);
    vi.mocked(replicatedEntriesTable.getSyncMetadata).mockResolvedValue({ totalRows: 1 } as never);
    vi.mocked(replicatedEntriesTable.sync).mockResolvedValue({ success: true } as never);
    vi.mocked(replicatedTrialsTable.sync).mockResolvedValue({ success: true } as never);
    vi.mocked(replicatedClassesTable.sync).mockResolvedValue({ success: true } as never);
    mockJudgeAssignmentData.getActive.mockResolvedValue([]);
  });

  it('updates the card count after Refresh without a remount', async () => {
    renderPage();
    expect(await screen.findByText('0 / 1')).toBeInTheDocument();

    // The forced sync lands two more rows in the replica.
    vi.mocked(replicatedEntriesTable.getEntriesByShow).mockResolvedValue(entriesFor(3) as never);
    await userEvent.click(screen.getByRole('button', { name: 'Refresh classes' }));

    expect(await screen.findByText('0 / 3')).toBeInTheDocument();
  });

  it('updates the card count on a show-change signal with no tap', async () => {
    renderPage();
    expect(await screen.findByText('0 / 1')).toBeInTheDocument();
    await waitFor(() => expect(showChange.listener).not.toBeNull());

    vi.mocked(replicatedEntriesTable.getEntriesByShow).mockResolvedValue(entriesFor(4) as never);
    act(() => showChange.listener?.({ table: 'entries', classIds: [CLASS.id] } as never));

    expect(await screen.findByText('0 / 4', undefined, { timeout: 4000 })).toBeInTheDocument();
  });
});
