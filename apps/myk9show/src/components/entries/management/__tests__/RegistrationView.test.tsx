import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { RegistrationView } from '../RegistrationView';
import type { EnrollmentGroup } from '@/utils/enrollmentGrouping';
import type { EntryStats } from '@/types/entry-management-types';

// Mock the heavy children down to markers so the test isolates RegistrationView's
// own tab-content routing (the F6b fix) rather than their data-fetching.
vi.mock('../EntryStatsCards', () => ({
  EntryStatsCards: () => <div data-testid="entry-stats" />,
}));
vi.mock('../EntryFiltersCard', () => ({
  EntryFiltersCard: () => <div data-testid="entry-filters" />,
}));
vi.mock('../EntriesTableView', () => ({
  EntriesTableView: () => <div data-testid="entries-table" />,
}));
vi.mock('../EnrollmentCard', () => ({
  EnrollmentCard: () => <div data-testid="enrollment-card" />,
}));
vi.mock('@/components/entries/MoveUpRequestsTab', () => ({
  MoveUpRequestsTab: () => <div data-testid="move-up-requests" />,
}));
vi.mock('@/components/entries/PullManagementTab', () => ({
  PullManagementTab: () => <div data-testid="pull-management" />,
}));
vi.mock('@/hooks/useEmailStatus', () => ({
  useEmailStatus: () => ({ data: {} }),
}));

const enrollmentGroups = [
  { groupKey: 'g1', enrollmentId: 'e1', entries: [] },
] as unknown as EnrollmentGroup[];

function renderView(selectedTab: string) {
  const props = {
    stats: {} as EntryStats,
    searchTerm: '',
    setSearchTerm: vi.fn(),
    paymentFilter: 'all',
    setPaymentFilter: vi.fn(),
    selectedTab,
    setSelectedTab: vi.fn(),
    tabCounts: { all: 9, pending: 3, accepted: 4, waitlist: 1, issues: 1 },
    filteredEntries: [],
    entries: [],
    onBulkStatusChange: vi.fn(),
    onBulkCheckIn: vi.fn(),
    onPaymentStatusChange: vi.fn(),
    onStatusChange: vi.fn(),
    onCheckInStatusChange: vi.fn(),
    onOpenArmbandDialog: vi.fn(),
    onOpenCompDialog: vi.fn(),
    onUncompEntry: vi.fn(),
    onRemoveEntry: vi.fn(),
    showId: 'show-1',
    onRefresh: vi.fn(),
    enrollmentGroups,
    onSendDecisionEmail: vi.fn().mockResolvedValue(undefined),
  };
  return render(<RegistrationView {...props} />);
}

describe('RegistrationView tab content routing (F6b)', () => {
  it('shows the full entry list on a list tab (all)', () => {
    renderView('all');
    expect(screen.getByTestId('enrollment-card')).toBeInTheDocument();
    expect(screen.queryByTestId('move-up-requests')).not.toBeInTheDocument();
  });

  it('shows ONLY the focused queue on the Move-Ups tab — not the full list above it', () => {
    // Before the fix, the catch-all TabsContent (value={selectedTab}) also matched
    // the move-ups tab, rendering the 9-entry list ABOVE the Move-Up Requests card
    // and burying the decision.
    renderView('move-ups');
    expect(screen.getByTestId('move-up-requests')).toBeInTheDocument();
    expect(screen.queryByTestId('enrollment-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('entries-table')).not.toBeInTheDocument();
  });

  it('shows ONLY the focused queue on the Pulled (scratches) tab', () => {
    renderView('scratches');
    expect(screen.getByTestId('pull-management')).toBeInTheDocument();
    expect(screen.queryByTestId('enrollment-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('entries-table')).not.toBeInTheDocument();
  });
});
