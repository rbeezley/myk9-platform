/**
 * Integration test for the Phase 1a `/at-show` ringside mount.
 *
 * Exercises the full shim wiring end-to-end against a mocked replication
 * layer: data adapter → useEntryListData → filters → ringside EntryListPage
 * render, and the card-click path. Assertion-first on the value-sensitive bit:
 * a view-intent card tap must not enqueue an in-ring write.
 *
 * Also pins that `AtShowRoutes()` registers its routes unconditionally. The
 * surface is available for every show — the old `unified_ringside_enabled`
 * feature flag was removed pre-launch; only `RingsideShowBoundary` (loading /
 * retry / missing-show) and `AtShowAccessGate` (access) wrap the pages now.
 */

import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/test/utils/testUtils';
import { ReplicationSyncTestProvider } from '@/test/utils/ReplicationSyncTestProvider';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';
import { AtShowEntryListPage } from './AtShowEntryListPage';
import { createAtShowDataDependencies, syncAtShowChangeSignals } from './atShowDataAdapter';
import { AtShowRoutes } from '@/routes/atShowRoutes';
import {
  replicatedArmbandsTable,
  replicatedShowsTable,
  replicatedClassesTable,
  replicatedEntriesTable,
  replicatedTrialsTable,
} from '@/services/replication';

// Replication is the single host singleton the shim + adapters + actions all
// reach for. Mock the whole module so every table is a vi.fn() bag.
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

// The show's entries scope: synced by default so a genuinely empty class still
// reads "No Entries Yet"; the not-on-device test flips it (MYK9-1520).
const entriesScope = vi.hoisted(() => ({
  synced: true,
  gate: null as Promise<void> | null,
  anonymous: false,
}));
vi.mock('@/services/replication/entriesShowSyncState', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/replication/entriesShowSyncState')>()),
  hasShowEntriesSynced: vi.fn(async () => {
    await entriesScope.gate;
    return entriesScope.synced;
  }),
}));
vi.mock('@/features/offline-readiness/OfflineReadyBadge', () => ({
  OfflineReadyBadge: ({ showId }: { showId: string | undefined }) => (
    <button type="button" data-show-id={showId}>
      Save for show day
    </button>
  ),
}));

// Auth: force a SITE_ADMIN primary role (→ ringside 'admin', canScore = true)
// so the pending card is clickable. Real getPrimaryRole is preserved so the
// role→permission mapping under test stays genuine.
// Role override for the one test that needs a non-scorer; reset in beforeEach.
const authRoles = vi.hoisted(() => ({ current: null as string[] | null }));

vi.mock('@/hooks/useAuthContext', async importOriginal => {
  const actual = await importOriginal<typeof import('@/hooks/useAuthContext')>();
  const { UserRole } = await import('@/types/auth-types');
  return {
    ...actual,
    useAuthContext: () => ({
      getUserRoles: () => authRoles.current ?? [UserRole.SITE_ADMIN],
      user: entriesScope.anonymous ? { is_anonymous: true } : null,
    }),
  };
});

const PENDING_ENTRY = {
  id: 'entry-1',
  classId: 'class-1',
  armband: 5,
  dogCallName: 'Rex',
  dogBreed: 'Border Collie',
  handler: 'Jane Handler',
  isScored: false,
  checkInStatus: 'no-status',
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
    classStatus: 'pending',
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
    { id: 'trial-2', showId: 'show-1' },
  ] as never);
  vi.mocked(replicatedEntriesTable.getEntriesByClass).mockResolvedValue([PENDING_ENTRY] as never);
  vi.mocked(replicatedEntriesTable.updateCheckInStatus).mockResolvedValue('entry-1');
  vi.mocked(replicatedEntriesTable.updateEntry).mockResolvedValue('entry-1');
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
  },
};

const renderPage = (syncStatus: ReplicationSyncContextValue['status'] = settledSyncStatus) =>
  render(
    <ReplicationSyncTestProvider
      value={{ status: syncStatus, triggerSync: vi.fn(), syncTable: vi.fn() }}
    >
      <Routes>
        <Route path="/at-show/:showId/class/:classId" element={<AtShowEntryListPage />} />
        <Route path="/at-show/:showId" element={<div data-testid="class-list-page" />} />
      </Routes>
    </ReplicationSyncTestProvider>,
    { initialRoute: '/at-show/show-1/class/class-1' }
  );

describe('AtShowEntryListPage (Phase 1a shim)', () => {
  beforeEach(() => {
    authRoles.current = null;
    entriesScope.synced = true;
    entriesScope.gate = null;
    entriesScope.anonymous = false;
    vi.clearAllMocks();
    vi.mocked(replicatedTrialsTable.sync).mockReset();
    localStorage.clear();
    vi.mocked(replicatedEntriesTable.subscribe)
      .mockReset()
      .mockImplementation(() => vi.fn());
    vi.mocked(replicatedClassesTable.subscribe)
      .mockReset()
      .mockImplementation(() => vi.fn());
    vi.mocked(replicatedArmbandsTable.subscribe)
      .mockReset()
      .mockImplementation(() => vi.fn());
    vi.mocked(replicatedArmbandsTable.getByShow).mockResolvedValue([]);
    seedReplication();
  });

  it('renders the ringside entry list from the mocked replication layer', async () => {
    renderPage();
    expect(await screen.findByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('Border Collie')).toBeInTheDocument();
    expect(screen.getByText('Jane Handler')).toBeInTheDocument();
  });

  it('reads a withdrawn dog armband from the cached show assignment without a network fetch', async () => {
    vi.mocked(replicatedEntriesTable.getEntriesByClass).mockResolvedValue([
      { ...PENDING_ENTRY, armband: null, dogId: 'dog-1', entryStatus: 'withdrawn' },
    ] as never);
    vi.mocked(replicatedArmbandsTable.getByShow).mockResolvedValue([
      {
        id: 'armband-1',
        showId: 'show-1',
        dogId: 'dog-1',
        armbandNumber: '101',
        isAvailable: false,
      },
    ] as never);
    const data = await createAtShowDataDependencies().fetchSingleClass(
      'class-1',
      'show-1',
      'judge'
    );
    expect(data.entries[0]).toMatchObject({ armband: 101, status: 'pulled' });
    expect(replicatedArmbandsTable.getByShow).toHaveBeenCalledWith('show-1');
    expect(replicatedArmbandsTable.sync).not.toHaveBeenCalled();
  });

  it('invalidates on an armband replica change and unsubscribes on teardown', () => {
    const callback = vi.fn();
    const unsubscribe = vi.fn();
    vi.mocked(replicatedArmbandsTable.subscribe).mockImplementationOnce(listener => {
      listener([]);
      return unsubscribe;
    });
    const stop = createAtShowDataDependencies().subscribeToReplicationChanges(callback);
    expect(callback).toHaveBeenCalledTimes(1);
    stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('keeps showing the loading skeleton instead of No Entries Yet while first sync is pending', async () => {
    vi.mocked(replicatedEntriesTable.getEntriesByClass).mockResolvedValue([] as never);

    renderPage({
      ...settledSyncStatus,
      isSyncing: true,
      tablesStatus: { shows: 'success', trials: 'success', classes: 'success', entries: 'syncing' },
    });

    expect(await screen.findByRole('status', { name: 'Loading entries' })).toBeInTheDocument();
    expect(screen.queryByText('No Entries Yet')).not.toBeInTheDocument();
  });

  // MYK9-1520: offline on a device that never saved this show, "not loaded" must
  // not read as "none". The class card already says "Entry count not loaded yet".
  // Replication reports a failed sync as `{ success: false }`, not a rejection.
  const failShowSync = () =>
    vi.mocked(replicatedTrialsTable.sync).mockResolvedValue({ success: false } as never);

  it('says the entries are not on this device, never No Entries Yet, when the show was never saved', async () => {
    entriesScope.synced = false;
    failShowSync();
    vi.mocked(replicatedEntriesTable.getEntriesByClass).mockResolvedValue([] as never);

    renderPage();

    expect(await screen.findByText('Entries are not on this device')).toBeInTheDocument();
    expect(screen.queryByText('No Entries Yet')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save for show day' })).toHaveAttribute(
      'data-show-id',
      'show-1'
    );
    // The badge renders nothing when its readiness probe fails, so a retry is always there.
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('still says No Entries Yet when the sync failed but this device saved the show earlier', async () => {
    entriesScope.synced = true;
    failShowSync();
    vi.mocked(replicatedEntriesTable.getEntriesByClass).mockResolvedValue([] as never);

    renderPage();

    expect(await screen.findByText('No Entries Yet')).toBeInTheDocument();
    expect(screen.queryByText('Entries are not on this device')).not.toBeInTheDocument();
  });

  it('says No Entries Yet for a genuinely empty class once the hydration arrived', async () => {
    entriesScope.synced = false; // irrelevant: the hydration itself succeeded
    vi.mocked(replicatedEntriesTable.getEntriesByClass).mockResolvedValue([] as never);

    renderPage();

    expect(await screen.findByText('No Entries Yet')).toBeInTheDocument();
    expect(screen.queryByText('Entries are not on this device')).not.toBeInTheDocument();
  });

  it('Go Back from the not-on-device state goes to the show class list, not history', async () => {
    entriesScope.synced = false;
    failShowSync();
    vi.mocked(replicatedEntriesTable.getEntriesByClass).mockResolvedValue([] as never);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /go back/i }));

    expect(await screen.findByTestId('class-list-page')).toBeInTheDocument();
  });

  it('holds the skeleton, not No Entries Yet, until the entries marker is read', async () => {
    entriesScope.synced = false;
    failShowSync();
    let release: () => void = () => {};
    entriesScope.gate = new Promise<void>(resolve => {
      release = resolve;
    });
    vi.mocked(replicatedEntriesTable.getEntriesByClass).mockResolvedValue([] as never);

    renderPage();

    try {
      await waitFor(() => expect(replicatedTrialsTable.sync).toHaveBeenCalledWith('show-1'));
      expect(await screen.findByRole('status', { name: 'Loading entries' })).toBeInTheDocument();
      expect(screen.queryByText('No Entries Yet')).not.toBeInTheDocument();
    } finally {
      release();
    }
    expect(await screen.findByText('Entries are not on this device')).toBeInTheDocument();
  });

  it('never shows No Entries Yet first on a return visit after the cache was cleared', async () => {
    entriesScope.synced = true;
    failShowSync();
    vi.mocked(replicatedEntriesTable.getEntriesByClass).mockResolvedValue([] as never);
    const first = renderPage();
    expect(await screen.findByText('No Entries Yet')).toBeInTheDocument();
    first.unmount();

    entriesScope.synced = false;
    let release: () => void = () => {};
    entriesScope.gate = new Promise<void>(resolve => {
      release = resolve;
    });
    renderPage();

    try {
      expect(await screen.findByRole('status', { name: 'Loading entries' })).toBeInTheDocument();
      expect(screen.queryByText('No Entries Yet')).not.toBeInTheDocument();
    } finally {
      release();
    }
    expect(await screen.findByText('Entries are not on this device')).toBeInTheDocument();
  });

  it('drops the not-on-device state once a later sync of the show lands the entries', async () => {
    entriesScope.synced = false;
    failShowSync();
    vi.mocked(replicatedEntriesTable.getEntriesByClass).mockResolvedValue([] as never);
    renderPage();
    expect(await screen.findByText('Entries are not on this device')).toBeInTheDocument();

    entriesScope.synced = true;
    await createAtShowDataDependencies().forceSyncEntriesAndClasses('show-1');

    expect(await screen.findByText('No Entries Yet')).toBeInTheDocument();
    expect(screen.queryByText('Entries are not on this device')).not.toBeInTheDocument();
  });

  it('offers a retry instead of the badge to an anonymous passcode session', async () => {
    entriesScope.synced = false;
    entriesScope.anonymous = true;
    failShowSync();
    vi.mocked(replicatedEntriesTable.getEntriesByClass).mockResolvedValue([] as never);
    renderPage();

    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.queryByRole('button', { name: 'Save for show day' })).not.toBeInTheDocument();
    const syncsBefore = vi.mocked(replicatedEntriesTable.sync).mock.calls.length;
    fireEvent.click(retry);
    await waitFor(() =>
      expect(vi.mocked(replicatedEntriesTable.sync).mock.calls.length).toBeGreaterThan(syncsBefore)
    );
  });

  it('refreshes an initially empty query from the replicated subscription snapshot', async () => {
    vi.mocked(replicatedEntriesTable.getEntriesByClass)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValue([PENDING_ENTRY] as never);
    vi.mocked(replicatedEntriesTable.subscribe).mockImplementation(callback => {
      callback([PENDING_ENTRY] as never);
      return vi.fn();
    });

    renderPage();
    expect(await screen.findByText('No Entries Yet')).toBeInTheDocument();

    expect(await screen.findByText('Rex')).toBeInTheDocument();
  });

  // MYK9-1333: a cold device opened this class while the app-wide sync of every
  // replicated table was still running (G9: a third of run-order readers never
  // saw a card in 20 s). The class's own show must hydrate now, not after that
  // pass, which never downloads entries itself.
  it('hydrates the show and renders cards while the app-wide first sync is still running', async () => {
    vi.mocked(replicatedEntriesTable.getEntriesByClass).mockResolvedValue([] as never);
    // A real sync is network-bound, so it lands after the page's first local read.
    vi.mocked(replicatedEntriesTable.sync).mockImplementationOnce(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      vi.mocked(replicatedEntriesTable.getEntriesByClass).mockResolvedValue([
        PENDING_ENTRY,
      ] as never);
      return { success: true } as never;
    });

    renderPage({
      isSyncing: true,
      lastSyncAt: null,
      error: null,
      tablesStatus: { shows: 'syncing', trials: 'idle', classes: 'syncing', entries: 'idle' },
    });

    expect(await screen.findByText('Rex')).toBeInTheDocument();
    expect(replicatedEntriesTable.sync).toHaveBeenCalledWith('show-1');
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
      await waitFor(() => expect(replicatedEntriesTable.sync).toHaveBeenCalledWith('show-1'));
      expect(screen.getByRole('status', { name: 'Loading entries' })).toBeInTheDocument();
      expect(screen.queryByText('No Entries Yet')).not.toBeInTheDocument();
    } finally {
      // Settle the shared per-show operation so it cannot leak into later tests.
      releaseSync();
    }
    expect(await screen.findByText('No Entries Yet')).toBeInTheDocument();
  });

  it('hydrates show-scoped replicas on the first at-show mount', async () => {
    renderPage();

    await waitFor(() => {
      expect(replicatedTrialsTable.sync).toHaveBeenCalledWith('show-1');
      expect(replicatedClassesTable.sync).toHaveBeenCalledWith('trial-1');
      expect(replicatedClassesTable.sync).toHaveBeenCalledWith('trial-2');
      expect(replicatedClassesTable.sync).not.toHaveBeenCalledWith('');
      expect(replicatedEntriesTable.sync).toHaveBeenCalledWith('show-1');
      expect(replicatedArmbandsTable.sync).toHaveBeenCalledWith('');
    });
  });

  it('deduplicates concurrent show-scoped hydration requests', async () => {
    const dependencies = createAtShowDataDependencies();

    const first = dependencies.forceSyncEntriesAndClasses('show-1');
    const second = dependencies.forceSyncEntriesAndClasses('show-1');
    await Promise.all([first, second]);

    expect(replicatedEntriesTable.sync).toHaveBeenCalledTimes(1);
    expect(replicatedEntriesTable.sync).toHaveBeenCalledWith('show-1');
  });

  it('keeps cached classes available when show-scoped trial hydration is empty', async () => {
    vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([]);
    const dependencies = createAtShowDataDependencies();

    await dependencies.forceSyncEntriesAndClasses('empty-show');

    expect(replicatedTrialsTable.sync).toHaveBeenCalledWith('empty-show');
    expect(replicatedClassesTable.sync).not.toHaveBeenCalled();
    expect(replicatedEntriesTable.sync).toHaveBeenCalledWith('empty-show');
  });

  it('syncs entries and their armband assignments for a scoped entry signal', async () => {
    await syncAtShowChangeSignals('show-1', [{ table: 'entries', classIds: ['class-1'] }]);

    expect(replicatedEntriesTable.sync).toHaveBeenCalledWith('show-1');
    expect(replicatedArmbandsTable.sync).toHaveBeenCalledWith();
    expect(replicatedTrialsTable.sync).not.toHaveBeenCalled();
    expect(replicatedClassesTable.sync).not.toHaveBeenCalled();
  });

  it('syncs only the known trial for a scoped class signal', async () => {
    await syncAtShowChangeSignals('show-1', [{ table: 'classes', classIds: ['class-1'] }]);

    expect(replicatedClassesTable.getClassById).toHaveBeenCalledWith('class-1');
    expect(replicatedClassesTable.sync).toHaveBeenCalledWith('trial-1');
    expect(replicatedEntriesTable.sync).not.toHaveBeenCalled();
    expect(replicatedTrialsTable.sync).not.toHaveBeenCalled();
  });

  it('falls back to complete show sync for an unscoped signal', async () => {
    await syncAtShowChangeSignals('show-1', [{ table: 'entries' }]);

    expect(replicatedTrialsTable.sync).toHaveBeenCalledWith('show-1');
    expect(replicatedClassesTable.sync).toHaveBeenCalledWith('trial-1');
    expect(replicatedClassesTable.sync).toHaveBeenCalledWith('trial-2');
    expect(replicatedEntriesTable.sync).toHaveBeenCalledWith('show-1');
  });

  it('resets a moved or deleted class locally before complete reconciliation', async () => {
    await syncAtShowChangeSignals('show-1', [{ table: 'classes', id: 'class-1' }]);

    expect(replicatedClassesTable.batchDelete).toHaveBeenCalledWith(['class-1']);
    expect(replicatedTrialsTable.sync).toHaveBeenCalledWith('show-1');
    expect(replicatedEntriesTable.sync).toHaveBeenCalledWith('show-1');
  });

  it('falls back to complete show sync when a signaled class is not local yet', async () => {
    vi.mocked(replicatedClassesTable.getClassById).mockResolvedValueOnce(null);

    await syncAtShowChangeSignals('show-1', [{ table: 'classes', classIds: ['new-class'] }]);

    expect(replicatedTrialsTable.sync).toHaveBeenCalledWith('show-1');
    expect(replicatedEntriesTable.sync).toHaveBeenCalledWith('show-1');
  });

  it('does not write in-ring status when a pending card is tapped for viewing', async () => {
    renderPage();
    const card = await screen.findByText('Rex');

    fireEvent.click(card);

    expect(replicatedEntriesTable.updateCheckInStatus).not.toHaveBeenCalled();
  });

  it('favorites a dog by armband without opening the scoresheet flow', async () => {
    // The heart is an exhibitor control; a scorer's row tap opens the scoresheet
    // and the heart is hidden from them (MYK9-1086).
    authRoles.current = ['exhibitor'];
    renderPage();
    const favoriteButton = await screen.findByRole('button', { name: 'Favorite Rex' });

    fireEvent.click(favoriteButton);

    expect(JSON.parse(localStorage.getItem('dog_favorites_show-1') ?? '[]')).toEqual([5]);
    expect(replicatedEntriesTable.updateEntry).not.toHaveBeenCalled();

    fireEvent.click(favoriteButton);

    expect(JSON.parse(localStorage.getItem('dog_favorites_show-1') ?? '[]')).toEqual([]);
  });

  // MYK9-1500: Up is a fixed route, so a deep link (history holds only this
  // page) still goes to the show's class list, and there is no second exit.
  it('Up goes to the show class list from a deep link, with no history to go back to', async () => {
    renderPage();
    await screen.findByText('Rex');
    expect(window.history.length).toBeLessThanOrEqual(2);

    fireEvent.click(screen.getByRole('button', { name: 'Classes' }));

    expect(await screen.findByTestId('class-list-page')).toBeInTheDocument();
  });

  it('offers no "Back to main app" exit in the header or the actions menu', async () => {
    renderPage();
    await screen.findByText('Rex');
    fireEvent.click(screen.getByRole('button', { name: 'Actions menu' }));

    expect(screen.queryByText('Back to main app')).toBeNull();
    expect(screen.queryByRole('button', { name: /main app/i })).toBeNull();
  });

  it('registers the /at-show routes unconditionally (no feature-flag gate)', () => {
    // Route registration depends on no flag, and the per-show
    // `unified_ringside_enabled` gate was removed pre-launch; resilience now
    // lives in RingsideShowBoundary (tested in RingsideShowBoundary.test.tsx).
    expect(AtShowRoutes()).not.toBeNull();
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
