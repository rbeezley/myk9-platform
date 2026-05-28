/**
 * Regression test for the 2026-05-26 secretary launch-readiness audit
 * (PR #418) finding:
 *
 *   "Entry Management renders a false zero-entry state after entry
 *    query failure."
 *
 * Before the fix, `loadEntries` correctly set `error` when Supabase
 * returned 500, but the page render path showed a thin destructive
 * Alert above an "0 entries" main view — visually the secretary read
 * "no work to do" rather than "couldn't load entries." This test
 * locks in the new behavior: when `error` is set, the main content
 * does NOT render, and an explicit error state with a Retry button
 * is shown instead.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import EntryManagementPage from '../EntryManagementPage';

vi.mock('../WaitlistManagementPage/index', () => ({
  default: () => <div>Waitlist Content</div>,
}));

const mockLoadEntries = vi.fn();

vi.mock('@/hooks/useEntryManagementData', () => ({
  useEntryManagementData: () => ({
    user: null,
    hasRole: () => true,
    shows: [{ id: 'show-1', name: 'Test Show', start_date: '2026-06-01', end_date: '2026-06-02' }],
    selectedShowId: 'show-1',
    setSelectedShowId: vi.fn(),
    isLoadingShows: false,
    loadShows: vi.fn(),
    entries: [],
    setEntries: vi.fn(),
    isLoading: false,
    error: 'Failed to load entries',
    setError: vi.fn(),
    loadEntries: mockLoadEntries,
    stats: { total: 0, pending: 0, accepted: 0, waitlist: 0, issues: 0 },
    tabCounts: { all: 0, pending: 0, accepted: 0, waitlist: 0, issues: 0 },
    lastEmailedMap: {},
    refreshEmailLog: vi.fn(),
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

describe('EntryManagementPage — error state (PR #418, audit finding P1)', () => {
  it('renders the "Couldn\'t load entries" error card when loadEntries fails', () => {
    render(<EntryManagementPage />, { initialRoute: '/secretary/entries/show-1' });

    expect(screen.getByText(/couldn't load entries/i)).toBeInTheDocument();
    expect(screen.getByText('Failed to load entries')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('does NOT render the misleading zero-entry main content when error is set', () => {
    // The bug: main content rendered with empty `entries`, showing
    // stats cards reading "0 pending / 0 accepted / 0 waitlist" — the
    // user would interpret this as "no work to do" rather than
    // "couldn't load."
    //
    // Stats cards have headings like "Pending", "Accepted", "Waitlist".
    // When the error branch is active, NONE of those stat headings
    // should render.
    render(<EntryManagementPage />, { initialRoute: '/secretary/entries/show-1' });

    // The stats card headings only render inside RegistrationView, which
    // is gated on `!error`. If any of these appear, the error gate
    // failed and the misleading zero-state UX is back.
    expect(screen.queryByText('Pending', { selector: 'p' })).not.toBeInTheDocument();
    expect(screen.queryByText('Accepted', { selector: 'p' })).not.toBeInTheDocument();
  });

  it('the Retry button calls loadEntries with the selected show id', async () => {
    const { user } = render(<EntryManagementPage />, {
      initialRoute: '/secretary/entries/show-1',
    });

    mockLoadEntries.mockClear();
    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(mockLoadEntries).toHaveBeenCalledWith('show-1');
  });
});
