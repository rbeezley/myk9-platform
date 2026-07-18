import { beforeEach, describe, it, expect, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { render, screen } from '@/test/utils/testUtils';
import { RegistrationView } from '../RegistrationView';
import type { EnrollmentGroup } from '@/utils/enrollmentGrouping';
import type { EntryManagementEntry, EntryStats } from '@/types/entry-management-types';
import type { EntryWorkMode } from '../entryManagementFilters';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { createChainableQuery, mockSupabase } from '@/test/mocks/supabase';

// Mock the heavy children down to markers so the test isolates RegistrationView's
// own tab-content routing (the F6b fix) rather than their data-fetching.
vi.mock('../EntryStatsCards', () => ({
  EntryStatsCards: () => <div data-testid="entry-stats" />,
}));
vi.mock('../EntriesTableView', () => ({
  EntriesTableView: () => <div data-testid="entries-table" />,
}));
vi.mock('../EnrollmentCard', () => ({
  EnrollmentCard: ({
    group,
    onStatusChange,
  }: {
    group: EnrollmentGroup;
    onStatusChange: (entryId: string, status: EntryStatus) => void;
  }) => (
    <div data-testid="enrollment-card" data-group-key={group.groupKey}>
      {group.entries[0] ? (
        <>
          <button
            type="button"
            onClick={() => onStatusChange(group.entries[0].id, EntryStatus.ACCEPTED)}
          >
            Accept mocked entry
          </button>
          <button
            type="button"
            onClick={() => onStatusChange(group.entries[0].id, EntryStatus.WAITLIST)}
          >
            Waitlist mocked entry
          </button>
        </>
      ) : null}
    </div>
  ),
}));
vi.mock('@/hooks/useEmailStatus', () => ({
  useEmailStatus: () => ({ data: {} }),
}));

const enrollmentGroups = [
  { groupKey: 'g1', enrollmentId: 'e1', entries: [] },
] as unknown as EnrollmentGroup[];

const reviewedEntry: EntryManagementEntry = {
  id: 'entry-1',
  registrationId: 'reg-1',
  entryNumber: '#1',
  showId: 'show-1',
  dogId: 'dog-1',
  dogName: 'Willow',
  ownerName: 'Jamie Handler',
  ownerEmail: 'jamie@example.com',
  handlerName: 'Jamie Handler',
  classes: [
    { id: 'class-1', name: 'Advanced Interior', number: '101', fee: 25, status: 'entered' },
  ],
  totalFee: 25,
  paidAmount: 10,
  entryStatus: EntryStatus.PENDING,
  paymentStatus: PaymentStatus.PENDING,
  submittedAt: new Date('2026-07-08T12:00:00Z'),
  lastUpdated: new Date('2026-07-08T12:00:00Z'),
};

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

type RegistrationViewOverrides = Partial<{
  workMode: EntryWorkMode;
  setWorkMode: (mode: EntryWorkMode) => void;
  enrollmentGroups: EnrollmentGroup[];
  entries: EntryManagementEntry[];
  filteredEntries: EntryManagementEntry[];
  showId: string;
  showName: string;
  onStatusChange: (
    entryId: string,
    status: EntryStatus
  ) => boolean | void | Promise<boolean | void>;
}>;

function renderView(
  attentionFilter: 'all' | 'pending' | 'accepted' | 'waitlist' | 'issues',
  entryViewMode: 'table' | 'cards' = 'table',
  overrides: RegistrationViewOverrides = {}
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
    applyPreset: vi.fn(),
    applyView: vi.fn(),
    density: 'comfortable' as const,
    setDensity: vi.fn(),
    displayPreset: 'standard' as const,
    setDisplayPreset: vi.fn(),
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
    onResetFilters: vi.fn(),
    hasActiveScopeFilters: false,
    onSendDecisionEmail: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const result = render(<RegistrationView {...props} />);
  return {
    ...result,
    rerenderView: (nextOverrides: RegistrationViewOverrides) =>
      result.rerender(<RegistrationView {...props} {...nextOverrides} />),
  };
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

  it('paginates enrollment cards at 25 groups per page', async () => {
    const groups = Array.from({ length: 26 }, (_, index) => ({
      groupKey: `group-${index + 1}`,
      enrollmentId: `enrollment-${index + 1}`,
      entries: [],
    })) as unknown as EnrollmentGroup[];
    const { user } = renderView('all', 'cards', { enrollmentGroups: groups });

    expect(screen.getAllByTestId('enrollment-card')).toHaveLength(25);
    expect(screen.getByText('Showing 1–25 of 26 enrollments')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Go to next enrollment page' }));

    const secondPageCards = screen.getAllByTestId('enrollment-card');
    expect(secondPageCards).toHaveLength(1);
    expect(secondPageCards[0]).toHaveAttribute('data-group-key', 'group-26');
    expect(screen.getByText('Showing 26–26 of 26 enrollments')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to previous enrollment page' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Go to next enrollment page' })).toBeDisabled();
  });

  it('returns to the first page when parent filters replace the enrollment groups', async () => {
    const groups = Array.from({ length: 75 }, (_, index) => ({
      groupKey: `group-${index + 1}`,
      enrollmentId: `enrollment-${index + 1}`,
      entries: [],
    })) as unknown as EnrollmentGroup[];
    const { user, rerenderView } = renderView('all', 'cards', {
      enrollmentGroups: groups,
    });

    await user.click(screen.getByRole('button', { name: 'Go to next enrollment page' }));
    await user.click(screen.getByRole('button', { name: 'Go to next enrollment page' }));
    expect(screen.getAllByTestId('enrollment-card')[0]).toHaveAttribute(
      'data-group-key',
      'group-51'
    );

    rerenderView({ enrollmentGroups: groups.slice(25, 55) });

    expect(screen.getAllByTestId('enrollment-card')).toHaveLength(25);
    expect(screen.getAllByTestId('enrollment-card')[0]).toHaveAttribute(
      'data-group-key',
      'group-26'
    );
    expect(screen.getByText('Showing 1–25 of 30 enrollments')).toBeInTheDocument();
  });

  it('links truly empty Entry Management to the existing mail-in entry flow', () => {
    renderView('all', 'cards', {
      enrollmentGroups: [],
      showId: 'show/a',
    });

    const link = screen.getByRole('link', { name: 'Add mail-in entry' });
    expect(link).toHaveAttribute('href', '/secretary/register/show%2Fa');
  });

  it('opens acceptance email review after the accept action resolves', async () => {
    const onStatusChange = vi.fn().mockResolvedValue(undefined);
    const { user } = renderView('all', 'cards', {
      entries: [reviewedEntry],
      filteredEntries: [reviewedEntry],
      enrollmentGroups: [
        { groupKey: 'g1', enrollmentId: 'reg-1', entries: [reviewedEntry] },
      ] as unknown as EnrollmentGroup[],
      showName: 'Heartland Trial',
      onStatusChange,
    });

    await user.click(screen.getByRole('button', { name: /accept mocked entry/i }));

    expect(onStatusChange).toHaveBeenCalledWith('entry-1', EntryStatus.ACCEPTED);
    expect(await screen.findByRole('dialog')).toHaveTextContent('Review acceptance email');
    expect(screen.getByDisplayValue(/Entry accepted - Heartland Trial/i)).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(/Your entry for Willow has been accepted/i)
    ).toBeInTheDocument();
  });

  it('does not open decision email review when the entry decision fails to save', async () => {
    const onStatusChange = vi.fn().mockResolvedValue(false);
    const { user } = renderView('all', 'cards', {
      entries: [reviewedEntry],
      filteredEntries: [reviewedEntry],
      enrollmentGroups: [
        { groupKey: 'g1', enrollmentId: 'reg-1', entries: [reviewedEntry] },
      ] as unknown as EnrollmentGroup[],
      showName: 'Heartland Trial',
      onStatusChange,
    });

    await user.click(screen.getByRole('button', { name: /accept mocked entry/i }));

    expect(onStatusChange).toHaveBeenCalledWith('entry-1', EntryStatus.ACCEPTED);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('does not open automatic decision email review when that lifecycle step is disabled', async () => {
    mockSupabase.from.mockImplementation((table: string) =>
      createChainableQuery({
        data:
          table === 'show_lifecycle_email_steps'
            ? [{ show_id: 'show-1', step_type: 'accepted', is_enabled: false }]
            : [],
        error: null,
      })
    );
    const onStatusChange = vi.fn().mockResolvedValue(undefined);
    const { user } = renderView('all', 'cards', {
      entries: [reviewedEntry],
      filteredEntries: [reviewedEntry],
      enrollmentGroups: [
        { groupKey: 'g1', enrollmentId: 'reg-1', entries: [reviewedEntry] },
      ] as unknown as EnrollmentGroup[],
      showName: 'Heartland Trial',
      showId: 'show-1',
      onStatusChange,
    });

    await waitFor(() => {
      expect(mockSupabase.from).toHaveBeenCalledWith('show_lifecycle_email_steps');
    });
    await user.click(screen.getByRole('button', { name: /accept mocked entry/i }));

    expect(onStatusChange).toHaveBeenCalledWith('entry-1', EntryStatus.ACCEPTED);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('opens waitlist email review after the waitlist action resolves', async () => {
    const onStatusChange = vi.fn().mockResolvedValue(undefined);
    const { user } = renderView('all', 'cards', {
      entries: [reviewedEntry],
      filteredEntries: [reviewedEntry],
      enrollmentGroups: [
        { groupKey: 'g1', enrollmentId: 'reg-1', entries: [reviewedEntry] },
      ] as unknown as EnrollmentGroup[],
      showName: 'Heartland Trial',
      onStatusChange,
    });

    await user.click(screen.getByRole('button', { name: /waitlist mocked entry/i }));

    expect(onStatusChange).toHaveBeenCalledWith('entry-1', EntryStatus.WAITLIST);
    expect(await screen.findByRole('dialog')).toHaveTextContent('Review waitlist email');
    expect(screen.getByDisplayValue(/Entry waitlisted - Heartland Trial/i)).toBeInTheDocument();
  });

  // Move-ups / pulled are no longer rendered here. EntryManagementPage promotes
  // those queues to dedicated top-level tabs, so RegistrationView only ever
  // renders the entry list (table or cards).
});
