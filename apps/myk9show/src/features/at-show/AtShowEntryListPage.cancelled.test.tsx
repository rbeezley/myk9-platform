/**
 * MYK9-1847 — page wiring: tapping a dog in a cancelled class does not open the scoresheet and
 * says why; with the class running the same tap opens it.
 */
import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/test/utils/testUtils';
import { ReplicationSyncTestProvider } from '@/test/utils/ReplicationSyncTestProvider';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';
import { AtShowEntryListPage } from './AtShowEntryListPage';
import { CANCELLED_CLASS_MESSAGE } from './cancelledClassGuard';
import {
  replicatedShowsTable,
  replicatedClassesTable,
  replicatedEntriesTable,
  replicatedTrialsTable,
} from '@/services/replication';

const { toastInfo } = vi.hoisted(() => ({ toastInfo: vi.fn() }));
vi.mock('sonner', async importOriginal => ({
  ...(await importOriginal<typeof import('sonner')>()),
  toast: Object.assign(vi.fn(), {
    info: toastInfo,
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

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
  replicatedTrialsTable: { getTrialById: vi.fn(), getTrialsByShow: vi.fn(), sync: vi.fn() },
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

// The page is a large tree: under the CPU load of a sharded CI run, the first paint and the route
// swap after a tap can each pass testing-library's 1 s default, so the waits say how long they allow.
const WAIT_MS = 5000;

const settledSyncStatus: ReplicationSyncContextValue['status'] = {
  isSyncing: false,
  lastSyncAt: new Date('2026-06-01T12:00:00Z'),
  error: null,
  tablesStatus: { shows: 'success', trials: 'success', classes: 'success', entries: 'success' },
};

function renderPage(classStatus: string, replicaAnswers = true) {
  vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue({
    name: 'Spring Trial',
    organization: 'AKC Scent Work',
    startDate: '2026-06-01',
  } as never);
  const classRow = {
    id: 'class-1',
    element: 'Exterior',
    level: 'Excellent',
    section: '-',
    classStatus,
    trialId: 'trial-1',
    judgeName: 'Judge Judy',
  };
  vi.mocked(replicatedClassesTable.getClassById).mockResolvedValue(classRow as never);
  // The guard reads the class replica live: emit the row the way the real table does.
  vi.mocked(replicatedClassesTable.subscribe).mockImplementation(listener => {
    if (replicaAnswers) listener([classRow] as never);
    return () => undefined;
  });
  vi.mocked(replicatedTrialsTable.getTrialById).mockResolvedValue({
    id: 'trial-1',
    trialNumber: 1,
    date: '2026-06-01',
  } as never);
  vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([
    { id: 'trial-1', showId: 'show-1' },
  ] as never);
  vi.mocked(replicatedEntriesTable.getEntriesByClass).mockResolvedValue([
    {
      id: 'run-1',
      classId: 'class-1',
      armband: '101',
      dogCallName: 'Runner',
      dogBreed: 'Beagle',
      handler: 'Jane Handler',
      entryStatus: 'confirmed',
      checkInStatus: 'no-status',
      isScored: false,
      runOrder: 1,
    },
  ] as never);

  return render(
    <ReplicationSyncTestProvider
      value={{ status: settledSyncStatus, triggerSync: vi.fn(), syncTable: vi.fn() }}
    >
      <Routes>
        <Route path="/at-show/:showId/class/:classId" element={<AtShowEntryListPage />} />
        <Route
          path="/at-show/:showId/class/:classId/score/:entryId"
          element={<div data-testid="scoresheet-route" />}
        />
      </Routes>
    </ReplicationSyncTestProvider>,
    { initialRoute: '/at-show/show-1/class/class-1' }
  );
}

describe('AtShowEntryListPage with a cancelled class (MYK9-1847)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  // A tap made before the class replica has answered is held (MYK9-1911), and the replica answers
  // from its own read, so a tap can land first under load. The test taps again until the page has
  // the class's status; every attempt is a real tap on the dog.
  const tapRunner = () => fireEvent.click(screen.getByText('Runner'));

  it('does not open the scoresheet when a dog is tapped, and says why', async () => {
    renderPage('cancelled');
    await screen.findByText('Runner', {}, { timeout: WAIT_MS });

    await waitFor(
      () => {
        tapRunner();
        expect(toastInfo).toHaveBeenCalledWith(CANCELLED_CLASS_MESSAGE);
      },
      { timeout: WAIT_MS }
    );
    expect(screen.queryByTestId('scoresheet-route')).not.toBeInTheDocument();
  });

  it('opens the scoresheet for the same dog once the class is running', async () => {
    renderPage('in_progress');
    await screen.findByText('Runner', {}, { timeout: WAIT_MS });

    await waitFor(
      () => {
        tapRunner();
        expect(screen.getByTestId('scoresheet-route')).toBeInTheDocument();
      },
      { timeout: WAIT_MS }
    );
    expect(toastInfo).not.toHaveBeenCalledWith(CANCELLED_CLASS_MESSAGE);
  });

  it('does not open the scoresheet while the class replica has not answered yet', async () => {
    renderPage('cancelled', false);
    await screen.findByText('Runner', {}, { timeout: WAIT_MS });

    tapRunner();
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(screen.queryByTestId('scoresheet-route')).not.toBeInTheDocument();
  });
});
