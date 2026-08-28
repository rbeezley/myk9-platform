/**
 * Regression tests for the impeccable p3 audit findings A2 and C1.
 *
 * A2 — a blank page. Every render branch on the Registrations tab required
 * `selectedShowId` (or `isLoadingShows`). When show resolution FAILED --
 * `loadShows` swallowed its error into the logger, or a deep-linked id could
 * not be fetched -- the page settled at `shows: []`, `selectedShowId: ''`,
 * `isLoadingShows: false`, and no branch matched. The tab rendered nothing at
 * all: no error, no empty state, no retry, beneath a header whose actions were
 * disabled. A secretary reads that as "this show has no entries".
 *
 * C1 — the page never named the show it was editing. Every accept, reject,
 * refund and exhibitor email here is scoped to one show, and the secretary can
 * arrive from a bare `/secretary/entries` link that resolves the show from
 * localStorage, so the show could be one they never chose and could not see.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import EntryManagementPage from '../EntryManagementPage';

vi.mock('../WaitlistManagementPage/index', () => ({
  default: () => <div>Waitlist Content</div>,
}));

const mockLoadShows = vi.fn();

const dataState = {
  shows: [] as unknown[],
  selectedShowId: '',
  isLoadingShows: false,
  // Show resolution has SETTLED. `isLoadingShows` is not this: it goes false
  // while the deep-link `getShowById` fallback is still in flight, so the page
  // gates its "no show selected" branch on `didResolveShow` instead. See
  // useEntryManagementShowResolution.test.tsx for the hook-level coverage.
  didResolveShow: true,
  showError: null as string | null,
};

vi.mock('@/hooks/useEntryManagementData', () => ({
  useEntryManagementData: () => ({
    user: null,
    hasRole: () => true,
    shows: dataState.shows,
    selectedShowId: dataState.selectedShowId,
    setSelectedShowId: vi.fn(),
    isLoadingShows: dataState.isLoadingShows,
    didResolveShow: dataState.didResolveShow,
    showError: dataState.showError,
    loadShows: vi.fn(),
    retryShowResolution: mockLoadShows,
    entries: [],
    setEntries: vi.fn(),
    isLoading: false,
    loadedEntriesShowId: null,
    error: null,
    setError: vi.fn(),
    loadError: null,
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
    armbandDialog: { open: false, entry: null, value: '' },
    setArmbandDialog: vi.fn(),
    handleStatusChange: vi.fn(),
    handleAssignArmband: vi.fn(),
    handleNextArmband: vi.fn(),
    handleEnrollmentBulkStatusChange: vi.fn(),
    handleEnrollmentPaymentChange: vi.fn(),
    handleCheckInStatusChange: vi.fn(),
    handleExportCSV: vi.fn(),
    handleCompEntry: vi.fn(),
    handleUncompEntry: vi.fn(),
    handleRemoveEntry: vi.fn(),
    handleSendDecisionEmail: vi.fn(),
  }),
}));

vi.mock('@/hooks/queries/useShowTrials', () => ({
  useShowTrials: () => ({ data: [], isLoading: false, isSuccess: true }),
}));

vi.mock('@/hooks/queries/useClassesDatabase', () => ({
  useClassesByTrialQuery: () => ({
    data: [],
    isLoading: false,
    isSuccess: true,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/queries/useTrialEntries', () => ({
  useTrialEntries: () => ({ data: [], isLoading: false, isSuccess: true }),
}));

vi.mock('@/services/AuditService', () => ({
  auditService: { log: vi.fn() },
}));

beforeEach(() => {
  mockLoadShows.mockClear();
  dataState.shows = [];
  dataState.selectedShowId = '';
  dataState.isLoadingShows = false;
  dataState.didResolveShow = true;
  dataState.showError = null;
});

describe('EntryManagementPage — unresolved show (audit A2)', () => {
  it('renders an error card with retry when show resolution failed', () => {
    dataState.showError = "We couldn't open this show. Please retry.";
    render(<EntryManagementPage />, { initialRoute: '/shows/show-1/entry-management' });

    expect(screen.getByText(/couldn't open this show/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('never claims the show is empty when the show itself could not be read', () => {
    dataState.showError = "We couldn't open this show. Please retry.";
    render(<EntryManagementPage />, { initialRoute: '/shows/show-1/entry-management' });

    // The failure mode this replaces: silence, which reads as "no entries".
    expect(screen.queryByText(/no entries/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no matching registrations/i)).not.toBeInTheDocument();
  });

  it('retry re-runs the FULL resolution, including the deep-link lookup', async () => {
    dataState.showError = "We couldn't open this show. Please retry.";
    const { user } = render(<EntryManagementPage />, {
      initialRoute: '/shows/show-1/entry-management',
    });

    await user.click(screen.getByRole('button', { name: /retry/i }));
    // Wired to `retryShowResolution`, not `loadShows`: the deep-link lookup is
    // latched behind `didApplyInitial`, so `loadShows` alone cleared the error
    // without re-attempting the read that failed.
    expect(mockLoadShows).toHaveBeenCalled();
  });

  it('shows pending, not a verdict, while resolution is still running', () => {
    dataState.didResolveShow = false;
    render(<EntryManagementPage />, { initialRoute: '/shows/show-1/entry-management' });

    // The regression this replaces: "No show selected" rendered confidently
    // during the deep-link await, for a show that was about to resolve.
    expect(screen.queryByText(/no show selected/i)).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: /opening show/i })).toBeInTheDocument();
  });

  it('offers a way forward, not a blank tab, when no show was ever selected', () => {
    render(<EntryManagementPage />, { initialRoute: '/shows//entry-management' });

    expect(screen.getByText(/no show selected/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to your shows/i })).toBeInTheDocument();
    // A missing show is not a failed read; it must not be dressed as an error.
    expect(screen.queryByText(/couldn't open this show/i)).not.toBeInTheDocument();
  });
});

describe('EntryManagementPage — every tab, not just Registrations', () => {
  // The first fix put the unresolved-show state inside the Registrations tab.
  // The Exceptions tab then rendered its three filter buttons over empty space
  // -- the same silent blank surface, one tab across. The state now sits above
  // the tabs, because without a show neither tab means anything.
  it('does not render the tab bar at all when there is no show', () => {
    dataState.showError = "We couldn't open this show. Please retry.";
    render(<EntryManagementPage />, { initialRoute: '/shows/show-1/entry-management' });

    expect(screen.queryByRole('tab', { name: /exceptions/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /registrations/i })).not.toBeInTheDocument();
  });

  it('states the problem once, wherever the secretary was headed', () => {
    dataState.showError = "We couldn't open this show. Please retry.";
    render(<EntryManagementPage />, {
      initialRoute: '/shows/show-1/entry-management?tab=exceptions&exception=pulls',
    });

    // Deep-linked straight at the Pulls exception, which previously rendered
    // three buttons and nothing else.
    expect(screen.getByText(/couldn't open this show/i)).toBeInTheDocument();
    expect(screen.queryByText(/no pulled entries/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pulls \/ scratches/i })).not.toBeInTheDocument();
  });
});

describe('EntryManagementPage — names the show it edits (audit C1)', () => {
  it('renders the selected show name in the header', () => {
    dataState.shows = [
      { id: 'show-1', name: 'Cascade Cluster Trial', start_date: null, end_date: null },
    ];
    dataState.selectedShowId = 'show-1';
    render(<EntryManagementPage />, { initialRoute: '/shows/show-1/entry-management' });

    expect(screen.getByText('Cascade Cluster Trial')).toBeInTheDocument();
  });

  it('does not describe an unresolved show as if it were a named one', () => {
    render(<EntryManagementPage />, { initialRoute: '/shows//entry-management' });

    expect(
      screen.getByText(/manage entries, payments, and exhibitor email for one show/i)
    ).toBeInTheDocument();
  });
});
