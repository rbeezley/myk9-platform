import '@/test/utils/pageRenderWait';
/**
 * MYK9-2012 — the "Saved:" line is the last row INSIDE the list header's sticky block, so it stays
 * in view on a scrolled list and never sits over the header's own controls.
 */
import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@/test/utils/testUtils';
import { ReplicationSyncTestProvider } from '@/test/utils/ReplicationSyncTestProvider';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';
import { AtShowEntryListPage } from './AtShowEntryListPage';
import { useSavedScoreStore } from './savedScore';
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
  replicatedShowsTable: { getShowById: vi.fn(), subscribe: vi.fn(() => vi.fn()) },
  replicatedClassesTable: {
    batchDelete: vi.fn(),
    getClassById: vi.fn(),
    sync: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
    updateClass: vi.fn(),
  },
  replicatedEntriesTable: {
    getEntriesByClass: vi.fn(),
    getEntryById: vi.fn(async () => null),
    getScoreUploadState: vi.fn(async () => 'pending'),
    readScoreFromServer: vi.fn(async () => null),
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
    useAuthContext: () => ({
      getUserRoles: () => [UserRole.SITE_ADMIN],
      // The ringside menu (MYK9-1508) reads these to route Stats and Results.
      hasRole: () => false,
      userWithRoles: null,
      user: null,
    }),
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
    <ReplicationSyncTestProvider
      value={{ status: settledSyncStatus, triggerSync: vi.fn(), syncTable: vi.fn() }}
    >
      <Routes>
        <Route path="/at-show/:showId/class/:classId" element={<AtShowEntryListPage />} />
      </Routes>
    </ReplicationSyncTestProvider>,
    { initialRoute: '/at-show/show-1/class/class-1' }
  );
}

const LIST = '/at-show/show-1/class/class-1';

function save(listPath: string) {
  useSavedScoreStore.getState().set({
    entryId: 'run-1',
    dogLabel: '101 Runner',
    resultLabel: 'Qualified',
    timeLabel: '0:04.35',
    listPath,
    scoreRoute: `${LIST}/score/run-1`,
  });
}

describe('AtShowEntryListPage — the Saved line rides in the sticky header (MYK9-2012)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(replicatedArmbandsTable.getByShow).mockResolvedValue([]);
    useSavedScoreStore.getState().clear();
  });

  it('renders the line inside the header element, beside its still-reachable controls', async () => {
    save(LIST);
    renderPage();

    const line = await screen.findByTestId('saved-score-line');
    const header = line.closest('header') as HTMLElement;
    expect(header).not.toBeNull();
    expect(header.className).toContain('sticky');
    expect(within(header).getByRole('button', { name: 'Refresh entries' })).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: 'Search & sort' })).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: 'Correct' })).toBeInTheDocument();
    // The line has no sticky element of its own to cover the header.
    expect(line.className).not.toContain('sticky');
  });

  it('shows no line for a score saved on another list', async () => {
    save('/at-show/show-1/class/class-9');
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Refresh entries' })).toBeTruthy()
    );
    expect(screen.queryByTestId('saved-score-line')).toBeNull();
  });
});
