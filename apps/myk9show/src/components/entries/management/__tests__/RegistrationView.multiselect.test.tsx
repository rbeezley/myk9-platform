import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@/test/utils/testUtils';
import { RegistrationView } from '../RegistrationView';
import { EntryStatus } from '@/types/show-registration-types';
import type { EnrollmentGroup } from '@/utils/enrollmentGrouping';
import type { EntryStats, EntryManagementEntry, EntryClass } from '@/types/entry-management-types';

// Keep the real EntriesTableView + EntryBulkActionsBar (this test is about their
// wiring through RegistrationView); mock only the unrelated heavy children.
vi.mock('../EntryStatsCards', () => ({ EntryStatsCards: () => <div data-testid="entry-stats" /> }));
vi.mock('../EnrollmentCard', () => ({
  EnrollmentCard: () => <div data-testid="enrollment-card" />,
}));
vi.mock('@/hooks/useEmailStatus', () => ({ useEmailStatus: () => ({ data: {} }) }));

const aClass: EntryClass = { id: 'c1', name: 'Novice A', number: '1', fee: 25, status: 'entered' };

function entry(id: string, dogName: string): EntryManagementEntry {
  return {
    id,
    registrationId: `reg-${id}`,
    entryNumber: id,
    showId: 'show-1',
    dogId: `dog-${id}`,
    dogName,
    ownerName: 'Owner',
    ownerEmail: 'o@example.com',
    handlerName: 'Handler',
    classes: [aClass],
    totalFee: 25,
    paidAmount: 0,
    entryStatus: EntryStatus.PENDING,
    paymentStatus: 'pending' as EntryManagementEntry['paymentStatus'],
    submittedAt: new Date('2026-06-01'),
    lastUpdated: new Date('2026-06-01'),
  };
}

const enrollmentGroups = [
  { groupKey: 'g1', enrollmentId: 'e1', entries: [] },
] as unknown as EnrollmentGroup[];

function renderView(overrides: Record<string, unknown> = {}) {
  const onBulkStatusChange = vi.fn();
  const setAttentionFilter = vi.fn();
  const filteredEntries = [entry('e1', 'Willow'), entry('e2', 'Ranger')];
  const props = {
    stats: {} as EntryStats,
    searchTerm: '',
    setSearchTerm: vi.fn(),
    paymentFilter: 'all',
    setPaymentFilter: vi.fn(),
    attentionFilter: 'pending' as const,
    setAttentionFilter,
    workMode: 'review' as const,
    setWorkMode: vi.fn(),
    entryViewMode: 'table' as const,
    setEntryViewMode: vi.fn(),
    filteredEntries,
    entries: filteredEntries,
    onBulkStatusChange,
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
  const utils = render(<RegistrationView {...props} />);
  return { ...utils, onBulkStatusChange, setAttentionFilter };
}

describe('RegistrationView multi-select wiring', () => {
  it('select-all reveals the bulk bar and Approve fires onBulkStatusChange with the selected ids', async () => {
    const { user, onBulkStatusChange } = renderView();

    // No bar until something is selected.
    expect(screen.queryByText(/entries selected/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /select all entries/i }));

    const bar = screen.getByRole('region', { name: /bulk entry actions/i });
    expect(within(bar).getByText('2 entries selected')).toBeInTheDocument();

    await user.click(within(bar).getByRole('button', { name: /bulk actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /accept selected/i }));

    expect(onBulkStatusChange).toHaveBeenCalledWith(['e1', 'e2'], EntryStatus.ACCEPTED);
    // Selection clears after the action — bar goes away.
    expect(screen.queryByRole('region', { name: /bulk entry actions/i })).not.toBeInTheDocument();
  });

  it('switching attention filters clears the selection (and the bar)', async () => {
    const { user, setAttentionFilter } = renderView();
    await user.click(screen.getByRole('checkbox', { name: /select willow/i }));

    expect(screen.getByRole('region', { name: /bulk entry actions/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /pending review/i }));
    await user.click(screen.getByRole('button', { name: /accepted/i }));

    expect(setAttentionFilter).toHaveBeenCalledWith('accepted');
    expect(screen.queryByRole('region', { name: /bulk entry actions/i })).not.toBeInTheDocument();
  });
});
