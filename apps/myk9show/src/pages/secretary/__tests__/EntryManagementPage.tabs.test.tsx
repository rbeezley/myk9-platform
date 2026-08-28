import { describe, it, expect, vi } from 'vitest';
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

vi.mock('@/hooks/useEntryManagementActions', () => ({
  useEntryManagementActions: () => ({
    isProcessing: false,
    checkInDialog: { open: false, entry: null, classEntry: null },
    setCheckInDialog: vi.fn(),
    armbandDialog: { open: false, entry: null, value: '' },
    setArmbandDialog: vi.fn(),
    autoArmbandDialog: { open: false, startNumber: '1' },
    setAutoArmbandDialog: vi.fn(),
    bulkActionDialog: { open: false, action: null },
    setBulkActionDialog: vi.fn(),
    handleStatusChange: vi.fn(),
    handleAssignArmband: vi.fn(),
    handleAutoAssignArmbands: vi.fn(),
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
  useClassesByTrialQuery: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/hooks/queries/useTrialEntries', () => ({
  useTrialEntries: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/services/AuditService', () => ({
  auditService: { log: vi.fn() },
}));

describe('EntryManagementPage tab consolidation', () => {
  it('shows Registrations and Exceptions as the only primary tabs', () => {
    render(<EntryManagementPage />, { initialRoute: '/secretary/entries' });
    expect(screen.getByRole('tab', { name: 'Registrations' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Exceptions' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });

  it('shows Waitlist content when ?tab=waitlist', () => {
    render(<EntryManagementPage />, { initialRoute: '/secretary/entries?tab=waitlist' });
    expect(screen.getByText('Waitlist Content')).toBeInTheDocument();
  });

  it('normalizes a legacy Move-ups tab to the Exceptions workspace', () => {
    render(<EntryManagementPage />, { initialRoute: '/secretary/entries?tab=move-ups' });
    expect(screen.getByRole('tab', { name: 'Exceptions' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Move-ups' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('normalizes legacy pulled exception links to Pulls / scratches', async () => {
    render(<EntryManagementPage />, {
      initialRoute: '/secretary/entries?tab=exceptions&queue=pulled',
    });
    expect(await screen.findByRole('button', { name: 'Pulls / scratches' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
