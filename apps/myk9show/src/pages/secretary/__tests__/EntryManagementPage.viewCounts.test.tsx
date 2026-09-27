/**
 * MYK9-810 rule, applied to the unified `ListViewTabs` row (MYK9-795): "View
 * counts match the rows each view actually shows (tested)." Real entries with
 * distinct attention reasons go through the same `useEntryManagementCockpit`
 * the page renders from, so this proves the number on each button is the
 * number of registrations that view would list — not a hand-picked mock.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import EntryManagementPage from '../EntryManagementPage';

function entry(overrides: Partial<EntryManagementEntry>): EntryManagementEntry {
  return {
    id: overrides.id as string,
    registrationId: overrides.id as string,
    entryNumber: '#1',
    showId: 'show-1',
    dogId: overrides.id as string,
    dogName: 'Dog',
    ownerName: 'Owner',
    ownerEmail: 'owner@example.com',
    handlerName: 'Handler',
    classes: [{ id: 'class-1', name: 'Novice A', number: '1', fee: 25, status: 'entered' }],
    totalFee: 25,
    paidAmount: 0,
    entryStatus: EntryStatus.PENDING,
    paymentStatus: PaymentStatus.PENDING,
    submittedAt: new Date(2026, 6, 1, 9),
    lastUpdated: new Date(2026, 6, 1, 9),
    ...overrides,
  };
}

// One entry in each of the three registration-status queues, plus every one
// of them counted under "All" — three registrations that never overlap.
const ENTRIES: EntryManagementEntry[] = [
  entry({ id: 'needs-review-1', entryStatus: EntryStatus.PENDING }),
  entry({ id: 'missing-info-1', entryStatus: EntryStatus.MISSING_INFO }),
  entry({
    id: 'payment-due-1',
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PENDING,
  }),
];

vi.mock('../WaitlistManagementPage/index', () => ({ default: () => null }));
vi.mock('@/components/entries/MoveUpRequestsTab', () => ({ MoveUpRequestsTab: () => null }));
vi.mock('@/components/entries/PullManagementTab', () => ({ PullManagementTab: () => null }));
vi.mock('@/features/registration/SecretaryAddEntriesDecision', () => ({
  SecretaryAddEntriesDecision: () => null,
}));
vi.mock('@/services/AuditService', () => ({ auditService: { log: vi.fn() } }));

vi.mock('@/hooks/useEntryManagementData', () => ({
  useEntryManagementData: () => ({
    user: null,
    hasRole: () => true,
    shows: [{ id: 'show-1', name: 'Test Show', start_date: null, end_date: null }],
    selectedShowId: 'show-1',
    setSelectedShowId: vi.fn(),
    isLoadingShows: false,
    didResolveShow: true,
    showError: null,
    loadShows: vi.fn(),
    retryShowResolution: vi.fn(),
    loadedEntriesShowId: 'show-1',
    entries: ENTRIES,
    setEntries: vi.fn(),
    isLoading: false,
    error: null,
    setError: vi.fn(),
    loadError: null,
    loadEntries: vi.fn(),
    lastEmailedMap: {},
    refreshEmailLog: vi.fn(),
  }),
}));

// A distinct, non-zero value proves the page surfaces THIS hook's count on
// the Move-ups view tab, rather than a coincidental 0 both would report.
vi.mock('@/hooks/useMoveUpRequestsCount', () => ({
  useMoveUpRequestsCount: () => ({ count: 5, isLoading: false }),
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
    handleCheckInStatusChange: vi.fn(),
    handleExportCSV: vi.fn(),
    handleCompEntry: vi.fn(),
    handleUncompEntry: vi.fn(),
    handleRemoveEntry: vi.fn(),
    handleSendDecisionEmail: vi.fn(),
  }),
}));

vi.mock('@/hooks/useEntryManagementTrialScope', () => ({
  useEntryManagementTrialClasses: () => ({
    trialClasses: [],
    trialClassIds: [],
    isLoadingClasses: false,
    trialClassesUnknown: false,
    refetchTrialClasses: vi.fn(),
  }),
  useEntryManagementTrialScope: () => ({ trials: [], isLoadingTrials: false }),
}));

describe('EntryManagementPage view-tab counts (MYK9-810)', () => {
  it('shows one registration in Needs review, Missing info, and Payment due, and all three under All', async () => {
    render(<EntryManagementPage />, { initialRoute: '/secretary/entries' });

    const views = await screen.findByRole('navigation', { name: 'Entry views' });
    expect(within(views).getByRole('button', { name: /Needs review/ })).toHaveTextContent('1');
    expect(within(views).getByRole('button', { name: /Missing info/ })).toHaveTextContent('1');
    expect(within(views).getByRole('button', { name: /Payment due/ })).toHaveTextContent('1');
    expect(within(views).getByRole('button', { name: /^All/ })).toHaveTextContent('3');
    expect(within(views).getByRole('button', { name: /Move-ups/ })).toHaveTextContent('5');
  });
});
