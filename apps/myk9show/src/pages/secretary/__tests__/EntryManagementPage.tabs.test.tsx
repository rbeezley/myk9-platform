import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@/test/utils/testUtils';
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

vi.mock('@/services/AuditService', () => ({
  auditService: { log: vi.fn() },
}));

describe('EntryManagementPage tab consolidation', () => {
  // MYK9-795: the Registrations/Exceptions `PrimaryTabs`, the queue
  // buttons-with-counts, and the Exceptions sub-tab buttons are unified into
  // one `ListViewTabs` row with seven entries.
  it('shows the seven unified views and no separate Registrations/Exceptions tabs', async () => {
    const { user } = render(<EntryManagementPage />, { initialRoute: '/secretary/entries' });
    await user.click(screen.getByRole('button', { name: /^Show:/ }));
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    const menu = await screen.findByRole('menu');
    for (const label of [
      'Needs review',
      'Missing info',
      'Payment due',
      'All',
      'Waitlist',
      'Pulls',
      'Move-ups',
    ]) {
      const items = [
        ...within(menu).queryAllByRole('menuitemcheckbox'),
        ...within(menu).queryAllByRole('menuitemradio'),
      ];
      expect(items.some(item => item.textContent?.startsWith(label))).toBe(true);
    }
  });

  it('shows Waitlist content when ?tab=waitlist', () => {
    render(<EntryManagementPage />, { initialRoute: '/secretary/entries?tab=waitlist' });
    expect(screen.getByText('Waitlist Content')).toBeInTheDocument();
  });

  it('normalizes a legacy Move-ups tab to the Exceptions workspace', () => {
    render(<EntryManagementPage />, { initialRoute: '/secretary/entries?tab=move-ups' });
    expect(screen.getByRole('button', { name: /^Show:/ })).toHaveTextContent(/Move-ups/);
  });

  it('normalizes legacy pulled exception links to the Pulls queue', async () => {
    render(<EntryManagementPage />, {
      initialRoute: '/secretary/entries?tab=exceptions&queue=pulled',
    });
    expect(await screen.findByRole('button', { name: /^Show:/ })).toHaveTextContent(/Pulls/);
  });
});
