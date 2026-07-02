import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { RegistrationView } from '../RegistrationView';
import type { EnrollmentGroup } from '@/utils/enrollmentGrouping';
import type { EntryStats } from '@/types/entry-management-types';
import type { EntryWorkMode } from '../entryManagementFilters';

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
vi.mock('@/hooks/useEmailStatus', () => ({
  useEmailStatus: () => ({ data: {} }),
}));

const enrollmentGroups = [
  { groupKey: 'g1', enrollmentId: 'e1', entries: [] },
] as unknown as EnrollmentGroup[];

function mockViewport(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function renderView(
  attentionFilter: 'all' | 'pending' | 'accepted' | 'waitlist' | 'issues',
  entryViewMode: 'table' | 'cards' = 'table',
  overrides: Partial<{
    workMode: EntryWorkMode;
    setWorkMode: (mode: EntryWorkMode) => void;
  }> = {}
) {
  const props = {
    stats: {} as EntryStats,
    searchTerm: '',
    setSearchTerm: vi.fn(),
    paymentFilter: 'all',
    setPaymentFilter: vi.fn(),
    attentionFilter,
    setAttentionFilter: vi.fn(),
    workMode: 'review' as EntryWorkMode,
    setWorkMode: vi.fn(),
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
    onRefresh: vi.fn(),
    enrollmentGroups,
    onSendDecisionEmail: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return render(<RegistrationView {...props} />);
}

describe('RegistrationView filter content routing', () => {
  beforeEach(() => {
    mockViewport(false);
  });

  it('renders shared list controls with desktop table in table mode', () => {
    renderView('all');

    expect(screen.getByPlaceholderText('Search entries...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /day-of/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByRole('button', { name: /table view/i })).toBeInTheDocument();
    expect(screen.getByTestId('entries-table')).toBeInTheDocument();
    expect(screen.queryByTestId('enrollment-card')).not.toBeInTheDocument();
  });

  it('renders mobile cards instead of the table in table mode on mobile viewports', () => {
    mockViewport(true);

    renderView('all');

    expect(screen.getByTestId('enrollment-card')).toBeInTheDocument();
    expect(screen.queryByTestId('entries-table')).not.toBeInTheDocument();
  });

  it('lets the secretary switch to Day-of mode', async () => {
    const setWorkMode = vi.fn();
    const { user } = renderView('all', 'table', { setWorkMode });

    await user.click(screen.getByRole('button', { name: /day-of/i }));

    expect(setWorkMode).toHaveBeenCalledWith('day-of');
  });

  it('does not reapply the active matching work mode preset', async () => {
    const setWorkMode = vi.fn();
    const { user } = renderView('pending', 'table', {
      workMode: 'review',
      setWorkMode,
    });

    await user.click(screen.getByRole('button', { name: 'Review' }));

    expect(setWorkMode).not.toHaveBeenCalled();
  });

  it('does not render the old entry status tab row', () => {
    renderView('all');

    expect(screen.queryByRole('tab', { name: /pending/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /accepted/i })).not.toBeInTheDocument();
  });

  it('shows enrollment cards in card view', () => {
    renderView('all', 'cards');
    expect(screen.getByTestId('enrollment-card')).toBeInTheDocument();
  });

  // Move-ups / pulled are no longer rendered here. EntryManagementPage promotes
  // those queues to dedicated top-level tabs, so RegistrationView only ever
  // renders the entry list (table or cards).
});
