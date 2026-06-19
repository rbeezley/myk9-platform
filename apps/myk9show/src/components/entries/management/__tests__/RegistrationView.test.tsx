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

function renderView(
  attentionFilter: 'all' | 'pending' | 'accepted' | 'waitlist' | 'move-ups' | 'pulled' | 'issues',
  entryViewMode: 'table' | 'cards' = 'table'
) {
  const props = {
    stats: {} as EntryStats,
    searchTerm: '',
    setSearchTerm: vi.fn(),
    paymentFilter: 'all',
    setPaymentFilter: vi.fn(),
    attentionFilter,
    setAttentionFilter: vi.fn(),
    entryViewMode,
    setEntryViewMode: vi.fn(),
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

describe('RegistrationView filter content routing', () => {
  it('renders shared list controls and defaults to table view', () => {
    renderView('all');

    expect(screen.getByPlaceholderText('Search entries...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /table view/i })).toBeInTheDocument();
    expect(screen.getByTestId('entries-table')).toBeInTheDocument();
  });

  it('does not render the old entry status tab row', () => {
    renderView('all');

    expect(screen.queryByRole('tab', { name: /pending/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /accepted/i })).not.toBeInTheDocument();
  });

  it('shows enrollment cards in card view', () => {
    renderView('all', 'cards');
    expect(screen.getByTestId('enrollment-card')).toBeInTheDocument();
    expect(screen.queryByTestId('move-up-requests')).not.toBeInTheDocument();
  });

  it('shows ONLY the focused queue for the Move-Up Requested filter', () => {
    renderView('move-ups');
    expect(screen.getByTestId('move-up-requests')).toBeInTheDocument();
    expect(screen.queryByTestId('enrollment-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('entries-table')).not.toBeInTheDocument();
  });

  it('shows ONLY the focused queue for the Pulled filter', () => {
    renderView('pulled');
    expect(screen.getByTestId('pull-management')).toBeInTheDocument();
    expect(screen.queryByTestId('enrollment-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('entries-table')).not.toBeInTheDocument();
  });
});
