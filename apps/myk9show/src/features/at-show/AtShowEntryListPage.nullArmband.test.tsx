/**
 * MYK9-977 — a withdrawn dog with NO armband under "Not running" rendered a
 * "0" badge: `atShowDataAdapter` turned a missing armband into the number 0.
 * Asserted through the real shim on the real replicated row shape, so a drop
 * at any hop (adapter -> Entry -> DogCard) turns this red.
 */
import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@/test/utils/testUtils';
import { ReplicationSyncContext } from '@/context/ReplicationSyncContext';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';
import { AtShowEntryListPage } from './AtShowEntryListPage';
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

vi.mock('@/hooks/useAuthContext', async importOriginal => {
  const actual = await importOriginal<typeof import('@/hooks/useAuthContext')>();
  const { UserRole } = await import('@/types/auth-types');
  return {
    ...actual,
    useAuthContext: () => ({ getUserRoles: () => [UserRole.SITE_ADMIN] }),
  };
});

const baseRow = {
  classId: 'class-1',
  dogBreed: 'Beagle',
  handler: 'Jane Handler',
  checkInStatus: 'no-status',
  isScored: false,
};

function entryRows() {
  return [
    {
      ...baseRow,
      id: 'run-1',
      armband: '101',
      dogCallName: 'Runner',
      entryStatus: 'confirmed',
      runOrder: 1,
    },
    // Withdrawn dogs may retain their number only in the show armband replica.
    {
      ...baseRow,
      id: 'wd-null',
      dogId: 'dog-maple',
      armband: null,
      dogCallName: 'Maple',
      entryStatus: 'withdrawn',
      runOrder: 2,
    },
    { ...baseRow, id: 'wd-missing', dogCallName: 'Ranger', entryStatus: 'withdrawn', runOrder: 3 },
  ];
}

const settledSyncStatus: ReplicationSyncContextValue['status'] = {
  isSyncing: false,
  lastSyncAt: new Date('2026-06-01T12:00:00Z'),
  error: null,
  tablesStatus: { shows: 'success', trials: 'success', classes: 'success', entries: 'success' },
};

function renderPage() {
  vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue({
    name: 'Spring Trial',
    organization: 'AKC Scent Work',
    startDate: '2026-06-01',
  } as never);
  vi.mocked(replicatedClassesTable.getClassById).mockResolvedValue({
    id: 'class-1',
    element: 'Exterior',
    level: 'Excellent',
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
  vi.mocked(replicatedEntriesTable.getEntriesByClass).mockResolvedValue(entryRows() as never);

  return render(
    <ReplicationSyncContext.Provider
      value={{ status: settledSyncStatus, triggerSync: vi.fn(), syncTable: vi.fn() }}
    >
      <Routes>
        <Route path="/at-show/:showId/class/:classId" element={<AtShowEntryListPage />} />
      </Routes>
    </ReplicationSyncContext.Provider>,
    { initialRoute: '/at-show/show-1/class/class-1' }
  );
}

describe('AtShowEntryListPage — a missing armband is never shown as 0 (MYK9-977)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(replicatedArmbandsTable.getByShow).mockResolvedValue([]);
  });

  it.each(['Maple', 'Ranger'])('shows an em dash, not 0, for %s under Not running', async name => {
    renderPage();
    await screen.findByText('Not running (2)');

    const card = screen.getByText(name).closest('[data-testid="dog-card"]') as HTMLElement;
    expect(within(card).getByTestId('dog-card-armband')).toHaveTextContent(/^—$/);
  });

  it('shows the cached assignment on a withdrawn dog while sync is offline', async () => {
    vi.mocked(replicatedArmbandsTable.sync).mockRejectedValueOnce(new Error('offline'));
    vi.mocked(replicatedArmbandsTable.getByShow).mockResolvedValue([
      {
        id: 'armband-maple',
        showId: 'show-1',
        dogId: 'dog-maple',
        armbandNumber: '142',
        isAvailable: false,
      },
    ] as never);
    renderPage();
    await screen.findByText('Not running (2)');
    const card = screen.getByText('Maple').closest('[data-testid="dog-card"]') as HTMLElement;
    expect(within(card).getByTestId('dog-card-armband')).toHaveTextContent(/^142$/);
  });

  it('still shows the real armband on a numbered runner', async () => {
    renderPage();
    await screen.findByText('Not running (2)');

    const card = screen.getByText('Runner').closest('[data-testid="dog-card"]') as HTMLElement;
    expect(within(card).getByTestId('dog-card-armband')).toHaveTextContent(/^101$/);
  });
});
