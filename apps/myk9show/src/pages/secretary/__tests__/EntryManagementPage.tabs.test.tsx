import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import EntryManagementPage from '../EntryManagementPage';

vi.mock('../WaitlistManagementPage/index', () => ({ default: () => <div>Waitlist Content</div> }));

vi.mock('@/hooks/useEntryManagementData', () => ({
  useEntryManagementData: () => ({
    user: null,
    hasRole: () => true,
    shows: [],
    selectedShowId: '',
    setSelectedShowId: vi.fn(),
    isLoadingShows: false,
    loadShows: vi.fn(),
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

vi.mock('@/hooks/useEntryManagementFilters', () => ({
  useEntryManagementFilters: () => ({
    searchTerm: '',
    setSearchTerm: vi.fn(),
    statusFilter: 'all',
    setStatusFilter: vi.fn(),
    paymentFilter: 'all',
    setPaymentFilter: vi.fn(),
    selectedTab: 'all',
    setSelectedTab: vi.fn(),
    trialFilter: null,
    setTrialFilter: vi.fn(),
    classFilter: null,
    setClassFilter: vi.fn(),
    viewMode: 'registration',
    selectedEntries: new Set<string>(),
    setSelectedEntries: vi.fn(),
    handleSelectEntry: vi.fn(),
    handleSelectAll: vi.fn(),
    filteredEntries: [],
    clearFilters: vi.fn(),
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
  it('shows Entries tab by default', () => {
    render(<EntryManagementPage />, { initialRoute: '/secretary/entries' });
    expect(screen.getByRole('tab', { name: 'Entries' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Waitlist' })).toBeInTheDocument();
  });

  it('shows Waitlist content when ?tab=waitlist', () => {
    render(<EntryManagementPage />, { initialRoute: '/secretary/entries?tab=waitlist' });
    expect(screen.getByText('Waitlist Content')).toBeInTheDocument();
  });
});
