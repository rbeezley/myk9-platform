/**
 * Integration test for the combined Novice Section A/B entry list.
 *
 * Exercises the combined shim end-to-end against mocked replication:
 * fetchCombinedClasses merges A + B entries, both render under "All Sections",
 * and the section-filter tabs narrow to only A / only B. Section comes from
 * each entry's class row (A's class.section = 'A', B's = 'B').
 */

import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/test/utils/testUtils';
import { ReplicationSyncTestProvider } from '@/test/utils/ReplicationSyncTestProvider';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';
import { AtShowCombinedEntryListPage } from './AtShowCombinedEntryListPage';

vi.mock('@/services/replication', () => ({
  replicatedArmbandsTable: {
    getByShow: vi.fn(async () => []),
    sync: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  },
  replicatedShowsTable: { getShowById: vi.fn() },
  replicatedClassesTable: {
    getClassById: vi.fn(),
    sync: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
    updateClass: vi.fn(),
  },
  replicatedEntriesTable: {
    getEntriesByClass: vi.fn(),
    sync: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
    updateEntry: vi.fn(),
  },
  replicatedTrialsTable: { getTrialById: vi.fn(), getTrialsByShow: vi.fn(), sync: vi.fn() },
}));

// The show's entries scope: synced by default so a genuinely empty list still
// reads "No Entries Yet"; the not-on-device test flips it (MYK9-1520).
const entriesScope = vi.hoisted(() => ({ synced: true }));
const structureState = vi.hoisted(() => ({ onDevice: true }));
vi.mock('./atShowClassListAdapter', async importOriginal => ({
  ...(await importOriginal<typeof import('./atShowClassListAdapter')>()),
  isAtShowStructureOnDevice: async () => structureState.onDevice,
}));
vi.mock('@/services/replication/entriesShowSyncState', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/replication/entriesShowSyncState')>()),
  hasShowEntriesSynced: vi.fn(async () => entriesScope.synced),
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
      // The ringside menu (MYK9-1508) reads these to route Stats and Results.
      hasRole: () => false,
      userWithRoles: null,
      user: null,
    }),
  };
});

import {
  replicatedShowsTable,
  replicatedClassesTable,
  replicatedEntriesTable,
  replicatedTrialsTable,
} from '@/services/replication';

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

const ENTRY_A = {
  id: 'a1',
  classId: 'class-a',
  armband: 105,
  dogCallName: 'Rex',
  dogBreed: 'Australian Shepherd',
  handler: 'Jane',
  isScored: false,
  checkInStatus: 'no-status',
};
const ENTRY_B = {
  id: 'b1',
  classId: 'class-b',
  armband: 206,
  dogCallName: 'Bella',
  dogBreed: 'Border Collie',
  handler: 'Sam',
  isScored: false,
  checkInStatus: 'no-status',
};

function seed() {
  vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue({
    name: 'Spring Trial',
    organization: 'AKC Scent Work',
    startDate: '2026-06-01',
  } as never);
  vi.mocked(replicatedClassesTable.getClassById).mockImplementation(
    async (id: string) => (id === 'class-a' ? CLASS_A : id === 'class-b' ? CLASS_B : null) as never
  );
  vi.mocked(replicatedEntriesTable.getEntriesByClass).mockImplementation(
    async (id: string) =>
      (id === 'class-a' ? [ENTRY_A] : id === 'class-b' ? [ENTRY_B] : []) as never
  );
  vi.mocked(replicatedTrialsTable.getTrialById).mockResolvedValue({
    id: 'trial-1',
    trialNumber: 1,
    date: '2026-06-01',
  } as never);
  vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([
    { id: 'trial-1', showId: 'show-1' },
  ] as never);
  vi.mocked(replicatedEntriesTable.updateEntry).mockResolvedValue('a1');
}

// Mirrors AtShowEntryListPage.test.tsx. The combined route now consults
// replication sync for its first-load gate -- previously it derived "loaded"
// from `isRefreshing` alone and presented an empty ring as settled truth while
// the first sync was still running.
const settledSyncStatus = {
  isSyncing: false,
  lastSyncAt: new Date('2026-06-01T12:00:00Z'),
  error: null,
  tablesStatus: {
    shows: 'success',
    trials: 'success',
    classes: 'success',
    entries: 'success',
  },
} as ReplicationSyncContextValue['status'];

const renderPage = (syncStatus: ReplicationSyncContextValue['status'] = settledSyncStatus) =>
  render(
    <ReplicationSyncTestProvider
      value={{ status: syncStatus, triggerSync: vi.fn(), syncTable: vi.fn() }}
    >
      <Routes>
        <Route
          path="/at-show/:showId/class/:classIdA/:classIdB"
          element={<AtShowCombinedEntryListPage />}
        />
        <Route path="/at-show/:showId" element={<div data-testid="class-list-page" />} />
      </Routes>
    </ReplicationSyncTestProvider>,
    { initialRoute: '/at-show/show-1/class/class-a/class-b' }
  );

describe('AtShowCombinedEntryListPage (Phase 1h combined Section A/B)', () => {
  beforeEach(() => {
    entriesScope.synced = true;
    vi.clearAllMocks();
    vi.mocked(replicatedTrialsTable.sync).mockReset();
    seed();
  });

  it('shows a skeleton instead of a spinner while combined entries load', async () => {
    vi.mocked(replicatedEntriesTable.getEntriesByClass).mockImplementation(
      () => new Promise(() => {})
    );

    renderPage();

    expect(
      await screen.findByRole('status', { name: 'Loading combined entries' })
    ).toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeNull();
    expect(screen.queryByText('Loading combined entries...')).not.toBeInTheDocument();
  });

  it('renders merged A + B entries under All Sections', async () => {
    renderPage();
    expect(await screen.findByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('Bella')).toBeInTheDocument();
  });

  it('filters to only Section A when the Section A tab is selected', async () => {
    renderPage();
    await screen.findByText('Rex');

    fireEvent.click(screen.getByText('Section A'));

    await waitFor(() => expect(screen.queryByText('Bella')).not.toBeInTheDocument());
    expect(screen.getByText('Rex')).toBeInTheDocument();
  });

  it('filters to only Section B when the Section B tab is selected', async () => {
    renderPage();
    await screen.findByText('Bella');

    fireEvent.click(screen.getByText('Section B'));

    await waitFor(() => expect(screen.queryByText('Rex')).not.toBeInTheDocument());
    expect(screen.getByText('Bella')).toBeInTheDocument();
  });

  // MYK9-1347: the combined list used to wait for a realtime signal or a visit
  // to the single-class page, since the app-wide pass never downloads entries.
  it('hydrates the show and renders cards while the app-wide first sync is still running', async () => {
    vi.mocked(replicatedEntriesTable.getEntriesByClass).mockResolvedValue([] as never);
    // A real sync is network-bound, so it lands after the page's first local read.
    vi.mocked(replicatedEntriesTable.sync).mockImplementationOnce(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      vi.mocked(replicatedEntriesTable.getEntriesByClass).mockImplementation(
        async (id: string) =>
          (id === 'class-a' ? [ENTRY_A] : id === 'class-b' ? [ENTRY_B] : []) as never
      );
      return { success: true } as never;
    });

    renderPage({
      isSyncing: true,
      lastSyncAt: null,
      error: null,
      tablesStatus: { shows: 'syncing', trials: 'idle', classes: 'syncing', entries: 'idle' },
    });

    expect(await screen.findByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('Bella')).toBeInTheDocument();
    expect(replicatedEntriesTable.sync).toHaveBeenCalledWith(
      'show-1',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('shows the loading skeleton, not No Entries Yet, while the first show hydration runs', async () => {
    vi.mocked(replicatedEntriesTable.getEntriesByClass).mockResolvedValue([] as never);
    let releaseSync: () => void = () => {};
    vi.mocked(replicatedEntriesTable.sync).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          releaseSync = () => resolve({ success: true } as never);
        })
    );

    renderPage();

    try {
      await waitFor(() =>
        expect(replicatedEntriesTable.sync).toHaveBeenCalledWith(
          'show-1',
          expect.objectContaining({ signal: expect.any(AbortSignal) })
        )
      );
      expect(screen.getByRole('status', { name: 'Loading combined entries' })).toBeInTheDocument();
      expect(screen.queryByText('No Entries Yet')).not.toBeInTheDocument();
    } finally {
      // Settle the shared per-show operation so it cannot leak into later tests.
      releaseSync();
    }
    expect(await screen.findByText('No Entries Yet')).toBeInTheDocument();
  });

  it('says the entries are not on this device, never No Entries Yet, when the show was never saved', async () => {
    entriesScope.synced = false;
    vi.mocked(replicatedTrialsTable.sync).mockResolvedValue({ success: false } as never);
    vi.mocked(replicatedEntriesTable.getEntriesByClass).mockResolvedValue([] as never);

    renderPage();

    expect(await screen.findByText('Entries are not on this device')).toBeInTheDocument();
    expect(screen.queryByText('No Entries Yet')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save for show day' })).toBeInTheDocument();
  });

  // MYK9-1500: a combined list's Up is the same fixed route as a single list's.
  it('Up goes to the show class list, and there is no "Back to main app" exit', async () => {
    renderPage();
    await screen.findByText('Rex');
    fireEvent.click(screen.getByRole('button', { name: 'Actions menu' }));
    expect(screen.queryByText('Back to main app')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Classes' }));

    expect(await screen.findByTestId('class-list-page')).toBeInTheDocument();
  });

  // MYK9-1509: an app-wide pass stuck on a dead connection leaves `isSyncing`
  // true (cleanup is MYK9-1550). Offline it must not hold the skeleton.
  describe('offline with the app-wide pass stuck syncing', () => {
    const stuckSyncStatus: ReplicationSyncContextValue['status'] = {
      isSyncing: true,
      lastSyncAt: null,
      error: null,
      tablesStatus: { shows: 'syncing', trials: 'syncing', classes: 'syncing', entries: 'syncing' },
    };

    it('says the entries are not on this device, not the skeleton, for a never-saved show', async () => {
      const offline = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      try {
        entriesScope.synced = false;
        vi.mocked(replicatedTrialsTable.sync).mockResolvedValue({ success: false } as never);
        vi.mocked(replicatedEntriesTable.getEntriesByClass).mockResolvedValue([] as never);

        renderPage(stuckSyncStatus);

        expect(await screen.findByText('Entries are not on this device')).toBeInTheDocument();
        expect(screen.queryByRole('status', { name: /Loading/ })).not.toBeInTheDocument();
      } finally {
        offline.mockRestore();
      }
    });

    it('shows the saved empty class, not the skeleton, for a previously saved show', async () => {
      const offline = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      try {
        vi.mocked(replicatedTrialsTable.sync).mockResolvedValue({ success: false } as never);
        vi.mocked(replicatedEntriesTable.getEntriesByClass).mockResolvedValue([] as never);

        renderPage(stuckSyncStatus);

        expect(await screen.findByText('No Entries Yet')).toBeInTheDocument();
        expect(screen.queryByRole('status', { name: /Loading/ })).not.toBeInTheDocument();
      } finally {
        offline.mockRestore();
      }
    });
  });
});
