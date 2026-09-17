/**
 * MYK9-645 — the at-show class page's tab badges, asserted through the SHIM.
 *
 * `EntryListPage` reads its badge pair from `classInfo.statusCounts` and groups
 * its rows by `classInfo.entryClassification`, both built in `buildClassInfo`.
 * That seam is a last hop: deleting the `classInfo?.statusCounts` argument at
 * the `buildStatusTabs` call site left every at-show unit test green while the
 * badge silently went back to counting raw rows (LESSONS `last-hop-drop`).
 * This renders the real shim on the real replicated row shape and asserts the
 * numbers a judge reads.
 */
import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@/test/utils/testUtils';
import { ReplicationSyncContext } from '@/context/ReplicationSyncContext';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';
import { AtShowEntryListPage } from './AtShowEntryListPage';
import {
  replicatedShowsTable,
  replicatedClassesTable,
  replicatedEntriesTable,
  replicatedTrialsTable,
} from '@/services/replication';

vi.mock('@/services/replication', () => ({
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

/**
 * Six replicated rows in the shape the database actually stores: four plain
 * runners, one withdrawn, one unscored carrying an `absent` RESULT.
 *
 * Server rule: expected 5, accounted 1 → Pending 4, Completed 1, and one row
 * in neither badge. Raw rows would say Pending 6.
 */
function entryRows() {
  const runners = [1, 2, 3, 4].map(n => ({
    id: `run-${n}`,
    classId: 'class-1',
    armband: String(100 + n),
    dogCallName: `Runner ${n}`,
    dogBreed: 'Border Collie',
    handler: 'Jane Handler',
    entryStatus: 'confirmed',
    checkInStatus: 'no-status',
    isScored: false,
    runOrder: n,
  }));
  return [
    ...runners,
    {
      id: 'withdrawn-1',
      classId: 'class-1',
      armband: '900',
      dogCallName: 'Withdrawn Dog',
      dogBreed: 'Beagle',
      handler: 'Jane Handler',
      entryStatus: 'withdrawn',
      checkInStatus: 'no-status',
      isScored: false,
      runOrder: 5,
    },
    {
      id: 'absent-1',
      classId: 'class-1',
      armband: '901',
      dogCallName: 'Absent Dog',
      dogBreed: 'Beagle',
      handler: 'Jane Handler',
      entryStatus: 'confirmed',
      checkInStatus: 'no-status',
      isScored: false,
      resultStatus: 'absent',
      runOrder: 6,
    },
  ];
}

function seedReplication() {
  vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue({
    name: 'Spring Trial',
    organization: 'AKC Scent Work',
    startDate: '2026-06-01',
  } as never);
  vi.mocked(replicatedClassesTable.getClassById).mockResolvedValue({
    id: 'class-1',
    element: 'Interior',
    level: 'Advanced',
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

const renderPage = () =>
  render(
    <ReplicationSyncContext.Provider
      value={{ status: settledSyncStatus, triggerSync: vi.fn(), syncTable: vi.fn() }}
    >
      <Routes>
        <Route path="/at-show/:showId/class/:classId" element={<AtShowEntryListPage />} />
      </Routes>
    </ReplicationSyncContext.Provider>,
    { initialRoute: '/at-show/show-1/class/class-1' }
  );

describe('AtShowEntryListPage — tab badges follow the canonical rule (MYK9-645)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    seedReplication();
  });

  it('reads Pending 4 / Completed 1 for 4 runners, 1 withdrawn and 1 absent result', async () => {
    renderPage();

    const pendingTab = (await screen.findByText('Pending')).closest('button');
    expect(pendingTab).toHaveTextContent('4');
    expect(screen.getByText('Completed').closest('button')).toHaveTextContent('1');
    // Six rows exist; the Pending badge must not be one of the raw totals.
    expect(pendingTab).not.toHaveTextContent('6');
    expect(pendingTab).not.toHaveTextContent('5');
  });

  it('keeps the withdrawn dog visible under its own labelled group', async () => {
    renderPage();

    expect(await screen.findByText('Not running (1)')).toBeInTheDocument();
    expect(screen.getByText('Withdrawn Dog')).toBeInTheDocument();
  });

  it('does not render the withdrawn or absent dog among the pending runners', async () => {
    renderPage();

    const pendingGrid = (await screen.findByText('Runner 1')).closest('div.grid') as HTMLElement;

    // The withdrawn dog IS on the page -- under the Not running group, not in
    // the pending grid. Asserting only that the group exists would pass with
    // the dog ALSO rendered among the runners.
    expect(within(pendingGrid).queryByText('Withdrawn Dog')).not.toBeInTheDocument();
    expect(screen.getByText('Withdrawn Dog')).toBeInTheDocument();

    // The absent-result dog is accounted for, so it belongs to Completed.
    expect(screen.queryByText('Absent Dog')).not.toBeInTheDocument();
  });

  it('offers no Score control inside the Not running group', async () => {
    renderPage();
    await screen.findByText('Not running (1)');

    const withdrawnCard = screen.getByText('Withdrawn Dog').closest('div.grid') as HTMLElement;
    expect(
      within(withdrawnCard).queryByRole('button', { name: /^Score /i })
    ).not.toBeInTheDocument();

    // ...while a pending runner still has one.
    const pendingGrid = screen.getByText('Runner 1').closest('div.grid') as HTMLElement;
    expect(within(pendingGrid).getByRole('button', { name: 'Score Runner 1' })).toBeInTheDocument();
  });
});
