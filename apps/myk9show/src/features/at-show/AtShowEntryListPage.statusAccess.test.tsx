/**
 * MYK9-1807 + MYK9-1809 through the at-show shim: who gets a check-in control on which row, what the
 * picker offers, and what the list claims while the show's entries have not all arrived.
 */
import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@/test/utils/testUtils';
import { ReplicationSyncTestProvider } from '@/test/utils/ReplicationSyncTestProvider';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';
import { AtShowEntryListPage } from './AtShowEntryListPage';
import {
  replicatedShowsTable,
  replicatedClassesTable,
  replicatedEntriesTable,
  replicatedTrialsTable,
} from '@/services/replication';

const viewer = vi.hoisted(() => ({
  role: 'SITE_ADMIN' as string,
  ownIds: [] as string[],
  hydration: 'arrived' as 'arrived' | 'not-arrived' | 'pending',
  selfCheckin: true,
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
  replicatedTrialsTable: {
    getTrialById: vi.fn(),
    getTrialsByShow: vi.fn(),
    sync: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuthContext', async importOriginal => {
  const actual = await importOriginal<typeof import('@/hooks/useAuthContext')>();
  const { UserRole: Roles } = await import('@/types/auth-types');
  return {
    ...actual,
    useAuthContext: () => ({
      getUserRoles: () => [Roles[viewer.role as keyof typeof Roles]],
      hasRole: () => false,
      userWithRoles: null,
      user: null,
    }),
  };
});

vi.mock('./useMyAtShowEntries', () => ({
  useMyAtShowEntries: () => ({
    ownEntryIds: new Set(viewer.ownIds),
    ownClassIds: new Set<string>(),
    isLoading: false,
    isUnknown: false,
  }),
}));

vi.mock('./useAtShowShowHydration', () => ({
  useAtShowShowHydration: () => viewer.hydration,
}));

const row = (id: string, order: number, overrides: Record<string, unknown> = {}) => ({
  id,
  classId: 'class-1',
  armband: String(100 + order),
  dogCallName: `Dog ${id}`,
  dogBreed: 'Border Collie',
  handler: 'Jane Handler',
  entryStatus: 'confirmed',
  checkInStatus: 'no-status',
  isScored: false,
  runOrder: order,
  ...overrides,
});

function seed(rows: ReturnType<typeof row>[]) {
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
    selfCheckinEnabled: viewer.selfCheckin,
  } as never);
  vi.mocked(replicatedTrialsTable.getTrialById).mockResolvedValue({
    id: 'trial-1',
    trialNumber: 1,
    date: '2026-06-01',
  } as never);
  vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([
    { id: 'trial-1', showId: 'show-1' },
  ] as never);
  vi.mocked(replicatedEntriesTable.getEntriesByClass).mockResolvedValue(rows as never);
}

const settledSyncStatus: ReplicationSyncContextValue['status'] = {
  isSyncing: false,
  lastSyncAt: new Date('2026-06-01T12:00:00Z'),
  error: null,
  tablesStatus: { shows: 'success', trials: 'success', classes: 'success', entries: 'success' },
};

const renderPage = () =>
  render(
    <ReplicationSyncTestProvider
      value={{ status: settledSyncStatus, triggerSync: vi.fn(), syncTable: vi.fn() }}
    >
      <Routes>
        <Route path="/at-show/:showId/class/:classId" element={<AtShowEntryListPage />} />
      </Routes>
    </ReplicationSyncTestProvider>,
    { initialRoute: '/at-show/show-1/class/class-1' }
  );

const cardFor = (name: string) =>
  screen.getByText(name).closest('[data-testid="dog-card"]') as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  viewer.role = 'SITE_ADMIN';
  viewer.ownIds = [];
  viewer.hydration = 'arrived';
  viewer.selfCheckin = true;
});

describe('MYK9-1809 item 1: nothing about the line while entries are missing', () => {
  const rows = [row('a', 1), row('b', 2), row('c', 3)];

  beforeEach(() => {
    viewer.role = 'EXHIBITOR';
    viewer.ownIds = ['c'];
  });

  it('shows the ring, up next and place in line once the show has arrived', async () => {
    seed(rows);
    renderPage();

    expect(await screen.findByText('Ring is clear')).toBeInTheDocument();
    expect(screen.getByText('Up next')).toBeInTheDocument();
    expect(screen.getByTestId('own-dog-queue-pill')).toHaveTextContent('2 dogs ahead');
  });

  it('shows no place in line, no "Ring is clear" and no "Up next" while entries are missing', async () => {
    viewer.hydration = 'not-arrived';
    seed(rows);
    renderPage();

    expect(await screen.findByText('Dog c')).toBeInTheDocument();
    expect(screen.getByText(/some dogs or classes may be missing/i)).toBeInTheDocument();
    expect(screen.queryByText('Ring is clear')).not.toBeInTheDocument();
    expect(screen.queryByText('Up next')).not.toBeInTheDocument();
    expect(screen.queryByTestId('own-dog-queue-pill')).not.toBeInTheDocument();
    // The dog is still the exhibitor's own.
    expect(screen.getByText('Your dog')).toBeInTheDocument();
  });
});

describe('MYK9-1809 item 2: a scratched or withdrawn row has no status control', () => {
  const rows = [
    row('a', 1),
    row('gone', 2, { entryStatus: 'withdrawn', checkInStatus: 'checked-in' }),
    row('pulled', 3, { checkInStatus: 'pulled' }),
  ];

  it('says the secretary must reinstate the entry, for staff too', async () => {
    seed(rows);
    renderPage();
    await screen.findByText('Dog gone');

    const gone = cardFor('Dog gone');
    expect(within(gone).queryByTestId('check-in-button')).not.toBeInTheDocument();
    expect(within(gone).getByText(/secretary must reinstate this entry/i)).toBeInTheDocument();
  });

  it('keeps the control on a dog pulled through check-in, and the picker marks Pulled as current', async () => {
    seed(rows);
    const { user } = renderPage();
    await screen.findByText('Dog pulled');

    await user.click(within(cardFor('Dog pulled')).getByTestId('check-in-button'));

    const current = await screen.findByRole('button', { name: /Pulled/, current: true });
    expect(current).toBeInTheDocument();
  });

  it('feeds the picker the status the card shows, not the raw check-in column', async () => {
    // Checked in on the column, but the in-ring flag puts it in the ring: the card says In ring.
    seed([row('ring', 1, { checkInStatus: 'checked-in', isInRing: true })]);
    const { user } = renderPage();
    await screen.findByText('Dog ring');

    await user.click(within(cardFor('Dog ring')).getByTestId('check-in-button'));

    expect(
      await screen.findByRole('button', { name: /In Ring/i, current: true })
    ).toBeInTheDocument();
  });
});

describe('MYK9-1807: the exhibitor check-in control', () => {
  const rows = [row('mine', 1), row('theirs', 2)];

  beforeEach(() => {
    viewer.role = 'EXHIBITOR';
    viewer.ownIds = ['mine'];
  });

  it("is on the exhibitor's own dog and not on anyone else's", async () => {
    seed(rows);
    renderPage();
    await screen.findByText('Dog mine');

    expect(within(cardFor('Dog mine')).getByTestId('check-in-button')).toBeInTheDocument();
    const theirs = cardFor('Dog theirs');
    expect(within(theirs).queryByTestId('check-in-button')).not.toBeInTheDocument();
    // The status is still readable on their row.
    expect(within(theirs).getByTestId('check-in-status')).toBeInTheDocument();
  });

  it('lists only the self check-in statuses', async () => {
    seed(rows);
    const { user } = renderPage();
    await screen.findByText('Dog mine');

    await user.click(within(cardFor('Dog mine')).getByTestId('check-in-button'));

    const picker = await screen.findByRole('group', { name: 'Status options' });
    expect(picker.querySelectorAll('[data-family="entry"]')).toHaveLength(5);
    expect(within(picker).queryByRole('button', { name: /Come to Gate/i })).not.toBeInTheDocument();
  });

  it('has no control at all for a passcode exhibitor with no person record', async () => {
    viewer.ownIds = [];
    seed(rows);
    renderPage();
    await screen.findByText('Dog mine');

    expect(screen.queryByTestId('check-in-button')).not.toBeInTheDocument();
  });

  it('opens the "self check-in is off" dialog when the class turned it off', async () => {
    viewer.selfCheckin = false;
    seed(rows);
    const { user } = renderPage();
    await screen.findByText('Dog mine');

    await user.click(within(cardFor('Dog mine')).getByTestId('check-in-button'));

    expect(await screen.findByText('Self check-in is off for this class')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Status options' })).not.toBeInTheDocument();
  });
});

describe('MYK9-1807: staff keep every control', () => {
  it.each(['SITE_ADMIN', 'JUDGE'])(
    '%s sees the control on every runner, even with self check-in off',
    async role => {
      viewer.role = role;
      viewer.selfCheckin = false;
      seed([row('a', 1), row('b', 2)]);
      renderPage();
      await screen.findByText('Dog a');

      expect(within(cardFor('Dog a')).getByTestId('check-in-button')).toBeInTheDocument();
      expect(within(cardFor('Dog b')).getByTestId('check-in-button')).toBeInTheDocument();
    }
  );

  it('lists the staff statuses, Come to gate included', async () => {
    seed([row('a', 1)]);
    const { user } = renderPage();
    await screen.findByText('Dog a');

    await user.click(within(cardFor('Dog a')).getByTestId('check-in-button'));

    expect(await screen.findByRole('button', { name: /Come to Gate/i })).toBeInTheDocument();
  });
});
