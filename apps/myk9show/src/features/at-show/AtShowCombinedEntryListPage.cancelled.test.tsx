/**
 * MYK9-1847 — page wiring on the combined A/B list: each dog is judged by its OWN section's
 * status. Cancelling only B blocks B's dogs and leaves A's scoreable; cancelling only A does
 * the reverse.
 */
import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/test/utils/testUtils';
import { ReplicationSyncTestProvider } from '@/test/utils/ReplicationSyncTestProvider';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';
import { AtShowCombinedEntryListPage } from './AtShowCombinedEntryListPage';
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

const settledSyncStatus: ReplicationSyncContextValue['status'] = {
  isSyncing: false,
  lastSyncAt: new Date('2026-06-01T12:00:00Z'),
  error: null,
  tablesStatus: { shows: 'success', trials: 'success', classes: 'success', entries: 'success' },
};

function baseClass(id: string, section: string, classStatus: string) {
  return {
    id,
    element: 'Container',
    level: 'Novice',
    section,
    classStatus,
    trialId: 'trial-1',
    judgeName: 'Judge Judy',
  };
}

function entry(id: string, classId: string, armband: number, name: string) {
  return {
    id,
    classId,
    armband,
    dogCallName: name,
    dogBreed: 'Border Collie',
    handler: 'Jane',
    isScored: false,
    checkInStatus: 'no-status',
  };
}

function renderPage(statusA: string, statusB: string) {
  const classes: Record<string, ReturnType<typeof baseClass>> = {
    'class-a': baseClass('class-a', 'A', statusA),
    'class-b': baseClass('class-b', 'B', statusB),
  };
  vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue({
    name: 'Spring Trial',
    organization: 'AKC Scent Work',
    startDate: '2026-06-01',
  } as never);
  vi.mocked(replicatedClassesTable.subscribe).mockImplementation(listener => {
    listener(Object.values(classes) as never);
    return () => undefined;
  });
  vi.mocked(replicatedClassesTable.getClassById).mockImplementation(
    async (id: string) => (classes[id] ?? null) as never
  );
  vi.mocked(replicatedEntriesTable.getEntriesByClass).mockImplementation(
    async (id: string) =>
      (id === 'class-a'
        ? [entry('a1', 'class-a', 105, 'Rex')]
        : id === 'class-b'
          ? [entry('b1', 'class-b', 206, 'Bella')]
          : []) as never
  );
  vi.mocked(replicatedTrialsTable.getTrialById).mockResolvedValue({
    id: 'trial-1',
    trialNumber: 1,
    date: '2026-06-01',
  } as never);
  vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([
    { id: 'trial-1', showId: 'show-1' },
  ] as never);

  return render(
    <ReplicationSyncTestProvider
      value={{ status: settledSyncStatus, triggerSync: vi.fn(), syncTable: vi.fn() }}
    >
      <Routes>
        <Route
          path="/at-show/:showId/class/:classIdA/:classIdB"
          element={<AtShowCombinedEntryListPage />}
        />
        <Route
          path="/at-show/:showId/class/:classId/score/:entryId"
          element={<div data-testid="scoresheet-route" />}
        />
      </Routes>
    </ReplicationSyncTestProvider>,
    { initialRoute: '/at-show/show-1/class/class-a/class-b' }
  );
}

describe('AtShowCombinedEntryListPage with one section cancelled (MYK9-1847)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('blocks only the cancelled section B; section A dogs still open their scoresheet', async () => {
    renderPage('in_progress', 'cancelled');
    fireEvent.click(await screen.findByText('Bella'));
    await waitFor(() => expect(toastInfo).toHaveBeenCalledWith(CANCELLED_CLASS_MESSAGE));
    expect(screen.queryByTestId('scoresheet-route')).not.toBeInTheDocument();

    toastInfo.mockClear();
    fireEvent.click(screen.getByText('Rex'));
    expect(await screen.findByTestId('scoresheet-route')).toBeInTheDocument();
    expect(toastInfo).not.toHaveBeenCalledWith(CANCELLED_CLASS_MESSAGE);
  });

  it('blocks only the cancelled section A; section B dogs still open their scoresheet', async () => {
    renderPage('cancelled', 'in_progress');
    fireEvent.click(await screen.findByText('Rex'));
    await waitFor(() => expect(toastInfo).toHaveBeenCalledWith(CANCELLED_CLASS_MESSAGE));
    expect(screen.queryByTestId('scoresheet-route')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Bella'));
    expect(await screen.findByTestId('scoresheet-route')).toBeInTheDocument();
  });

  // The header's status shows in the class details popover the class name opens.
  async function openClassDetails() {
    await screen.findByText('Rex');
    fireEvent.click(document.querySelector('[data-class-info-trigger]') as HTMLElement);
    await screen.findByText('Class Details');
  }

  it('shows no pair Cancelled status when only section A is cancelled, and B is still scoreable', async () => {
    renderPage('cancelled', 'in_progress');
    await openClassDetails();
    expect(screen.queryByText('Cancelled')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Bella'));
    expect(await screen.findByTestId('scoresheet-route')).toBeInTheDocument();
  });

  it('shows no pair Cancelled status when only section B is cancelled', async () => {
    renderPage('in_progress', 'cancelled');
    await openClassDetails();
    expect(screen.queryByText('Cancelled')).not.toBeInTheDocument();
  });

  it('shows the pair Cancelled status when every section is cancelled', async () => {
    renderPage('cancelled', 'cancelled');
    await openClassDetails();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });
});
