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

// Mock state is mutated per-test to exercise the different error
// surfaces. The factory closure reads the live values so each test
// can flip them before calling render().
const dataState = {
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
    loadShows: vi.fn(),
    entries: dataState.entries,
    setEntries: vi.fn(),
    isLoading: false,
    error: dataState.error,
    setError: vi.fn(),
    loadError: dataState.loadError,
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

function setDataState(overrides: Partial<typeof dataState>) {
  dataState.error = null;
  dataState.loadError = null;
  dataState.entries = [];
  Object.assign(dataState, overrides);
}

describe('EntryManagementPage — error state (PR #418, audit finding P1)', () => {
  it('renders the "Couldn\'t load entries" error card when loadEntries fails', () => {
    setDataState({ loadError: 'Failed to load entries' });
    render(<EntryManagementPage />, { initialRoute: '/secretary/entries/show-1' });

    expect(screen.getByText(/couldn't load entries/i)).toBeInTheDocument();
    expect(screen.getByText('Failed to load entries')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('does NOT render the misleading zero-entry main content when loadError is set', () => {
    // The bug: main content rendered with empty `entries`, showing
    // stats cards reading "0 pending / 0 accepted / 0 waitlist" — the
    // user would interpret this as "no work to do" rather than
    // "couldn't load."
    setDataState({ loadError: 'Failed to load entries' });
    render(<EntryManagementPage />, { initialRoute: '/secretary/entries/show-1' });

    // The stats card headings only render inside RegistrationView, which
    // is gated on `!loadError`. If any of these appear, the gate failed
    // and the misleading zero-state UX is back.
    expect(screen.queryByText('Pending', { selector: 'p' })).not.toBeInTheDocument();
    expect(screen.queryByText('Accepted', { selector: 'p' })).not.toBeInTheDocument();
  });

  it('the Retry button calls loadEntries with the selected show id', async () => {
    setDataState({ loadError: 'Failed to load entries' });
    const { user } = render(<EntryManagementPage />, {
      initialRoute: '/secretary/entries/show-1',
    });

    mockLoadEntries.mockClear();
    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(mockLoadEntries).toHaveBeenCalledWith('show-1');
  });

  /*
    Codex review on PR #418 caught that the single `error` state
    is multiplexed across load failures AND action failures (export,
    bulk status, comp/uncomp, remove-entry, armband). A naive gate
    would hide a successfully-loaded entries table the moment any
    action errored. These two tests lock in the separation: action
    errors get the inline top-of-page alert and DO NOT hide main
    content.
  */
  it('renders the inline action-error alert without hiding the entries table', () => {
    setDataState({ error: 'Failed to export CSV' });
    render(<EntryManagementPage />, { initialRoute: '/secretary/entries/show-1' });

    // Action error visible inline at top.
    expect(screen.getByText('Failed to export CSV')).toBeInTheDocument();
    // Load-error card MUST NOT appear when only `error` (action) is set.
    expect(screen.queryByText(/couldn't load entries/i)).not.toBeInTheDocument();
  });

  it('shows BOTH the action-error alert AND the load-error card when both are set', () => {
    // Edge case: a load succeeded, then an action errored, then the
    // user clicked Retry and the next load also failed. `error` and
    // `loadError` can both be set briefly. The user should see both
    // signals — the load-error card replaces main content, the
    // action-error alert sits above it as a separate concern.
    setDataState({
      error: 'Failed to export CSV',
      loadError: 'Failed to load entries',
    });
    render(<EntryManagementPage />, { initialRoute: '/secretary/entries/show-1' });

    expect(screen.getByText('Failed to export CSV')).toBeInTheDocument();
    expect(screen.getByText(/couldn't load entries/i)).toBeInTheDocument();
  });
});
