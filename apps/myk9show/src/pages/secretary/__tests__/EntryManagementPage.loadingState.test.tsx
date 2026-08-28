/**
 * Motion-language Phase 4 (loading-state convergence) regression test.
 *
 * Policy: page/section loads render a Skeleton (previewing the content
 * layout), NOT a bare centered spinner; `animate-spin` is reserved for inline
 * button/pending states. Crucially, the skeleton replaces the PENDING state
 * ONLY — the error and loaded/empty states stay distinct (a skeleton must
 * never shimmer forever in place of a real error or empty view).
 *
 * These tests lock in that the entries section renders the table skeleton while
 * the load is pending, and does NOT render it once the load resolves.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import EntryManagementPage from '../EntryManagementPage';

vi.mock('../WaitlistManagementPage/index', () => ({
  default: () => <div>Waitlist Content</div>,
}));

// Mutable mock state so each test can flip the pending flag before render().
const dataState = {
  isLoading: false,
  error: null as string | null,
  loadError: null as string | null,
  entries: [] as unknown[],
};

vi.mock('@/hooks/useEntryManagementData', () => ({
  useEntryManagementData: () => ({
    user: null,
    hasRole: () => true,
    shows: [{ id: 'show-1', name: 'Test Show', start_date: '2026-06-01', end_date: '2026-06-02' }],
    selectedShowId: 'show-1',
    setSelectedShowId: vi.fn(),
    isLoadingShows: false,
    didResolveShow: true,
    showError: null,
    retryShowResolution: vi.fn(),
    loadShows: vi.fn(),
    entries: dataState.entries,
    setEntries: vi.fn(),
    isLoading: dataState.isLoading,
    error: dataState.error,
    setError: vi.fn(),
    loadError: dataState.loadError,
    loadEntries: vi.fn(),
    stats: { total: 0, pending: 0, accepted: 0, waitlist: 0, issues: 0 },
    tabCounts: { all: 0, pending: 0, accepted: 0, waitlist: 0, issues: 0 },
    lastEmailedMap: {},
    refreshEmailLog: vi.fn(),
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

beforeEach(() => {
  dataState.isLoading = false;
  dataState.error = null;
  dataState.loadError = null;
  dataState.entries = [];
});

describe('EntryManagementPage — loading state (Phase 4 skeleton convergence)', () => {
  it('renders the table skeleton (not a spinner) while the entries load is pending', () => {
    dataState.isLoading = true;
    render(<EntryManagementPage />, { initialRoute: '/secretary/entries/show-1' });

    // The pending region is a labelled status skeleton.
    expect(
      screen.getByRole('status', { name: /loading entries/i })
    ).toBeInTheDocument();
    // And it is NOT the old bare spinner.
    expect(document.querySelector('.animate-spin')).toBeNull();
  });

  it('does NOT render the loading skeleton once the load has resolved', () => {
    dataState.isLoading = false;
    render(<EntryManagementPage />, { initialRoute: '/secretary/entries/show-1' });

    // Pending skeleton gone — the loaded/empty state renders instead
    // (proving the skeleton replaces the pending state only).
    expect(
      screen.queryByRole('status', { name: /loading entries/i })
    ).not.toBeInTheDocument();
  });

  it('does NOT render the loading skeleton when the load errored (error state stays distinct)', () => {
    dataState.loadError = 'Failed to load entries';
    render(<EntryManagementPage />, { initialRoute: '/secretary/entries/show-1' });

    expect(
      screen.queryByRole('status', { name: /loading entries/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/couldn't load entries/i)).toBeInTheDocument();
  });
});
