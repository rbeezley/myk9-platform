/**
 * MYK9-1551 (finding of MYK9-1508): coming back from the Ringside menu must
 * restore the single-class entry list's tab, sort and search. The menu stashes
 * a `ringsideList` snapshot in the return location's state; the page reads it
 * through `useRingsideListSnapshot` and seeds `useEntryListFilters`.
 *
 * Without the snapshot wiring the list resets to Pending / default sort / no
 * search, which hides a completed dog the exhibitor was just looking at.
 */

import { Navigate, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@/test/utils/testUtils';
import { ReplicationSyncTestProvider } from '@/test/utils/ReplicationSyncTestProvider';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';
import { AtShowEntryListPage } from './AtShowEntryListPage';
import type { RingsideReturnLocationState } from './menu/ringsideReturnStore';
import {
  replicatedArmbandsTable,
  replicatedShowsTable,
  replicatedClassesTable,
  replicatedEntriesTable,
  replicatedTrialsTable,
} from '@/services/replication';

vi.mock('@/services/replication', () => ({
  replicatedArmbandsTable: {
    getByShow: vi.fn(async () => []),
    sync: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  },
  replicatedShowsTable: { getShowById: vi.fn() },
  replicatedClassesTable: {
    batchDelete: vi.fn(),
    getClassById: vi.fn(),
    sync: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
    updateClass: vi.fn(),
  },
  replicatedEntriesTable: {
    getEntriesByClass: vi.fn(),
    sync: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
    updateCheckInStatus: vi.fn(),
    updateEntry: vi.fn(),
  },
  replicatedTrialsTable: {
    getTrialById: vi.fn(),
    getTrialsByShow: vi.fn(),
    sync: vi.fn(),
  },
}));

vi.mock('./atShowClassListAdapter', async importOriginal => ({
  ...(await importOriginal<typeof import('./atShowClassListAdapter')>()),
  isAtShowStructureOnDevice: async () => true,
}));
vi.mock('@/services/replication/entriesShowSyncState', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/replication/entriesShowSyncState')>()),
  hasShowEntriesSynced: vi.fn(async () => true),
}));
vi.mock('@/features/offline-readiness/OfflineReadyBadge', () => ({
  OfflineReadyBadge: () => <button type="button">Save for show day</button>,
}));
vi.mock('@/hooks/useAuthContext', async importOriginal => {
  const actual = await importOriginal<typeof import('@/hooks/useAuthContext')>();
  const { UserRole } = await import('@/types/auth-types');
  return {
    ...actual,
    useAuthContext: () => ({
      getUserRoles: () => [UserRole.SITE_ADMIN],
      hasRole: () => false,
      userWithRoles: null,
      user: null,
    }),
  };
});
vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({ status: 'resolved', canManage: true }),
}));

const BASE_ENTRY = {
  classId: 'class-1',
  dogBreed: 'Border Collie',
  handler: 'Jane Handler',
  checkInStatus: 'no-status',
};
const PENDING_ENTRY = {
  ...BASE_ENTRY,
  id: 'entry-1',
  armband: 5,
  dogCallName: 'Rex',
  isScored: false,
};
const COMPLETED_ENTRY = {
  ...BASE_ENTRY,
  id: 'entry-2',
  armband: 9,
  dogCallName: 'Maple',
  isScored: true,
  resultStatus: 'qualified',
};

function seedReplication() {
  vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue({
    name: 'Spring Trial',
    organization: 'AKC Scent Work',
    startDate: '2026-06-01',
  } as never);
  vi.mocked(replicatedClassesTable.getClassById).mockResolvedValue({
    id: 'class-1',
    element: 'Container',
    level: 'Novice',
    section: '-',
    classStatus: 'in_progress',
    trialId: 'trial-1',
    judgeName: 'Judge Judy',
  } as never);
  vi.mocked(replicatedTrialsTable.getTrialById).mockResolvedValue({
    id: 'trial-1',
    trialNumber: 1,
    date: '2026-06-01',
  } as never);
  vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([
    { id: 'trial-1', showId: 'show-1' },
  ] as never);
  vi.mocked(replicatedEntriesTable.getEntriesByClass).mockResolvedValue([
    PENDING_ENTRY,
    COMPLETED_ENTRY,
  ] as never);
}

const settledSyncStatus: ReplicationSyncContextValue['status'] = {
  isSyncing: false,
  lastSyncAt: new Date('2026-06-01T12:00:00Z'),
  error: null,
  tablesStatus: { shows: 'success', trials: 'success', classes: 'success', entries: 'success' },
};

/** Lands on the list the way the return bar does: a navigation carrying `ringsideList` state. */
const renderReturningFromMenu = (state?: RingsideReturnLocationState) =>
  render(
    <ReplicationSyncTestProvider
      value={{ status: settledSyncStatus, triggerSync: vi.fn(), syncTable: vi.fn() }}
    >
      <Routes>
        <Route
          path="/seed"
          element={<Navigate to="/at-show/show-1/class/class-1" state={state} replace />}
        />
        <Route path="/at-show/:showId/class/:classId" element={<AtShowEntryListPage />} />
      </Routes>
    </ReplicationSyncTestProvider>,
    { initialRoute: '/seed' }
  );

const openSearchAndSort = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Search & sort' }));

describe('AtShowEntryListPage restores the Ringside list snapshot (MYK9-1551)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    seedReplication();
  });

  it('control: with no snapshot it opens on Pending with no search', async () => {
    renderReturningFromMenu();
    expect(await screen.findByText('Rex')).toBeInTheDocument();
    expect(screen.queryByText('Maple')).not.toBeInTheDocument();
    openSearchAndSort();
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('restores the Completed tab, search term and sort from the snapshot', async () => {
    renderReturningFromMenu({
      ringsideList: {
        kind: 'entries',
        filters: {
          activeTab: 'completed',
          sortBy: 'placement',
          searchTerm: 'map',
          sectionFilter: 'all',
        },
      },
    });

    expect(await screen.findByText('Maple')).toBeInTheDocument();
    expect(screen.queryByText('Rex')).not.toBeInTheDocument();

    openSearchAndSort();
    expect(screen.getByRole('searchbox')).toHaveValue('map');
    expect(screen.getByRole('radio', { name: 'Placement' })).toBeChecked();
  });

  it('ignores a class-list snapshot left in location state', async () => {
    renderReturningFromMenu({
      ringsideList: { kind: 'classes', tab: 'all', search: 'map', sort: 'class' },
    } as unknown as RingsideReturnLocationState);

    expect(await screen.findByText('Rex')).toBeInTheDocument();
    expect(screen.queryByText('Maple')).not.toBeInTheDocument();
    openSearchAndSort();
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });
});
