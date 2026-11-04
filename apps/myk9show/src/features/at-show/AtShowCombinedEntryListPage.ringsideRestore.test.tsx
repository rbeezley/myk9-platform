/**
 * MYK9-1551 (finding of MYK9-1508): coming back from the Ringside menu must
 * restore the combined Section A/B entry list's tab, sort and search. The menu stashes
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
import { AtShowCombinedEntryListPage } from './AtShowCombinedEntryListPage';
import type { RingsideReturnLocationState } from './menu/ringsideReturnStore';
import {
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

const CLASS_A = {
  id: 'class-a',
  element: 'Container',
  level: 'Novice',
  section: 'A',
  classStatus: 'in_progress',
  trialId: 'trial-1',
  judgeName: 'Judge Judy',
};
const CLASS_B = { ...CLASS_A, id: 'class-b', section: 'B' };
const BASE_ENTRY = { dogBreed: 'Border Collie', handler: 'Jane', checkInStatus: 'no-status' };
const ENTRIES_BY_CLASS: Record<string, object[]> = {
  'class-a': [
    {
      ...BASE_ENTRY,
      id: 'a1',
      classId: 'class-a',
      armband: 105,
      dogCallName: 'Rex',
      isScored: false,
    },
  ],
  'class-b': [
    {
      ...BASE_ENTRY,
      id: 'b1',
      classId: 'class-b',
      armband: 206,
      dogCallName: 'Bella',
      isScored: false,
    },
    {
      ...BASE_ENTRY,
      id: 'b2',
      classId: 'class-b',
      armband: 209,
      dogCallName: 'Maple',
      isScored: true,
      resultStatus: 'qualified',
    },
  ],
};

function seedReplication() {
  vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue({
    name: 'Spring Trial',
    organization: 'AKC Scent Work',
    startDate: '2026-06-01',
  } as never);
  vi.mocked(replicatedClassesTable.getClassById).mockImplementation(
    async (id: string) => (id === 'class-a' ? CLASS_A : id === 'class-b' ? CLASS_B : null) as never
  );
  vi.mocked(replicatedTrialsTable.getTrialById).mockResolvedValue({
    id: 'trial-1',
    trialNumber: 1,
    date: '2026-06-01',
  } as never);
  vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([
    { id: 'trial-1', showId: 'show-1' },
  ] as never);
  vi.mocked(replicatedEntriesTable.getEntriesByClass).mockImplementation(
    async (id: string) => (ENTRIES_BY_CLASS[id] ?? []) as never
  );
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
          element={<Navigate to="/at-show/show-1/class/class-a/class-b" state={state} replace />}
        />
        <Route
          path="/at-show/:showId/class/:classIdA/:classIdB"
          element={<AtShowCombinedEntryListPage />}
        />
      </Routes>
    </ReplicationSyncTestProvider>,
    { initialRoute: '/seed' }
  );

const openSearchAndSort = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Search & sort' }));

describe('AtShowCombinedEntryListPage restores the Ringside list snapshot (MYK9-1551)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    seedReplication();
  });

  it('control: with no snapshot it opens on Pending, All Sections, no search', async () => {
    renderReturningFromMenu();
    expect(await screen.findByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('Bella')).toBeInTheDocument();
    expect(screen.queryByText('Maple')).not.toBeInTheDocument();
    openSearchAndSort();
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('restores the Section B filter, search term and sort from the snapshot', async () => {
    renderReturningFromMenu({
      ringsideList: {
        kind: 'entries',
        filters: {
          activeTab: 'pending',
          sortBy: 'armband',
          searchTerm: 'bel',
          sectionFilter: 'B',
        },
      },
    });

    expect(await screen.findByText('Bella')).toBeInTheDocument();
    expect(screen.queryByText('Rex')).not.toBeInTheDocument();

    openSearchAndSort();
    expect(screen.getByRole('searchbox')).toHaveValue('bel');
    expect(screen.getByRole('radio', { name: 'Armband' })).toBeChecked();
  });

  it('restores the Completed tab from the snapshot', async () => {
    renderReturningFromMenu({
      ringsideList: {
        kind: 'entries',
        filters: {
          activeTab: 'completed',
          sortBy: 'placement',
          searchTerm: '',
          sectionFilter: 'all',
        },
      },
    });

    expect(await screen.findByText('Maple')).toBeInTheDocument();
    expect(screen.queryByText('Rex')).not.toBeInTheDocument();
    expect(screen.queryByText('Bella')).not.toBeInTheDocument();
    openSearchAndSort();
    expect(screen.getByRole('radio', { name: 'Placement' })).toBeChecked();
  });
});
