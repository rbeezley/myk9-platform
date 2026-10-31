import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import EntryManagementPage from '../EntryManagementPage';

vi.mock('../WaitlistManagementPage/index', () => ({ default: () => <div>Waitlist Content</div> }));
vi.mock('@/components/entries/MoveUpRequestsTab', () => ({
  MoveUpRequestsTab: () => <div>Move-ups Content</div>,
}));
vi.mock('@/components/entries/PullManagementTab', () => ({
  PullManagementTab: () => <div>Pulls Content</div>,
}));

vi.mock('@/hooks/useEntryManagementData', () => ({
  useEntryManagementData: () => ({
    user: null,
    hasRole: () => true,
    // A resolved show. These tests are about which TABS exist and how legacy
    // links normalize onto them; the tabs only render once there is a show to
    // tab between, since without one neither tab means anything.
    shows: [{ id: 'show-1', name: 'Test Show', start_date: null, end_date: null }],
    selectedShowId: 'show-1',
    setSelectedShowId: vi.fn(),
    isLoadingShows: false,
    didResolveShow: true,
    showError: null,
    loadShows: vi.fn(),
    retryShowResolution: vi.fn(),
    loadedEntriesShowId: 'show-1',
    entries: [],
    setEntries: vi.fn(),
    isLoading: false,
    error: null,
    setError: vi.fn(),
    loadError: null,
    loadEntries: vi.fn(),
    stats: { total: 0, pending: 0, accepted: 0, waitlist: 0, issues: 0 },
    tabCounts: { all: 0, pending: 0, accepted: 0, waitlist: 0, issues: 0 },
  }),
}));

vi.mock('@/hooks/useMoveUpRequestsCount', () => ({
  useMoveUpRequestsCount: () => ({ count: 0, isLoading: false }),
}));

vi.mock('@/hooks/useEntryManagementActions', () => ({
  useEntryManagementActions: () => ({
    isProcessing: false,
    checkInDialog: { open: false, entry: null, classEntry: null },
    setCheckInDialog: vi.fn(),
    armbandDialog: { open: false, entry: null, value: '' },
    setArmbandDialog: vi.fn(),
    bulkActionDialog: { open: false, action: null },
    setBulkActionDialog: vi.fn(),
    handleStatusChange: vi.fn(),
    handleAssignArmband: vi.fn(),
    handleBulkCheckIn: vi.fn(),
    handleCheckInStatusUpdate: vi.fn(),
    handleBulkAction: vi.fn(),
    handleExportCSV: vi.fn(),
    handleCompEntry: vi.fn(),
    handleUncompEntry: vi.fn(),
  }),
}));

vi.mock('@/hooks/queries/useShowTrials', () => ({
  useShowTrials: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/hooks/queries/useClassesDatabase', () => ({
  classesByTrialQueryOptions: (trialId: string) => ({
    queryKey: ['classes', 'trial', trialId],
    queryFn: async () => [],
  }),
}));

vi.mock('@/hooks/queries/useTrialEntries', () => ({
  useTrialEntries: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/services/database/day-of-operations', () => ({
  getClassesWithCapacity: vi.fn(async () => ({ data: [{ available_spots: 2 }], error: null })),
}));
vi.mock('@/services/AuditService', () => ({
  auditService: { log: vi.fn() },
}));

describe('EntryManagementPage tab consolidation', () => {
  // cmdk scrolls the highlighted row into view; jsdom has no layout, so no scrollIntoView.
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterAll(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  // MYK9-795 unified the tabs into one view row; MYK9-1594 folded that row into the Filter menu's
  // Status field and the header Actions menu's Entry lists, leaving Search and Filter.
  it('has no tabs and no Show: select; the toolbar is Search and Filter', async () => {
    const { user } = render(<EntryManagementPage />, { initialRoute: '/secretary/entries' });

    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Show:/ })).toBeNull();
    expect(screen.getByRole('textbox', { name: /Search exhibitor, dog/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    for (const label of ['Needs review', 'Missing info', 'Payment due']) {
      expect(await screen.findByRole('option', { name: new RegExp(label) })).toBeInTheDocument();
    }
    // All is "no status filter", not a choice.
    expect(screen.queryByRole('option', { name: /^All/ })).toBeNull();
  });

  it('shows Waitlist content, with its title and a way back, when ?tab=waitlist', () => {
    render(<EntryManagementPage />, { initialRoute: '/secretary/entries?tab=waitlist' });
    expect(screen.getByText('Waitlist Content')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Waitlist' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to entry forms' })).toBeInTheDocument();
  });

  it('normalizes a legacy Move-ups tab to the Exceptions workspace, with a way back', () => {
    render(<EntryManagementPage />, { initialRoute: '/secretary/entries?tab=move-ups' });
    // The pane carries its own heading, so the header adds only the way back.
    expect(screen.queryByRole('heading', { name: 'Move-ups' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to entry forms' })).toBeInTheDocument();
    expect(screen.getByText('Move-ups Content')).toBeInTheDocument();
  });

  it('normalizes legacy pulled exception links to the Pulls queue, with a way back', async () => {
    render(<EntryManagementPage />, {
      initialRoute: '/secretary/entries?tab=exceptions&queue=pulled',
    });
    expect(await screen.findByRole('link', { name: 'Back to entry forms' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pulls' })).toBeNull();
    expect(screen.getByText('Pulls Content')).toBeInTheDocument();
  });

  it('Back to entry forms returns to the form list, and the exception list is gone', async () => {
    const { user } = render(<EntryManagementPage />, {
      initialRoute: '/secretary/entries?tab=exceptions&exception=pulls',
    });

    await user.click(await screen.findByRole('link', { name: 'Back to entry forms' }));

    expect(screen.queryByText('Pulls Content')).toBeNull();
    expect(await screen.findByRole('button', { name: /^Filter/ })).toBeInTheDocument();
  });
});
