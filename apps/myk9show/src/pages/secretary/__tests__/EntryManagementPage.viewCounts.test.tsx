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
    const view = render(<EntryManagementPage />, { initialRoute: '/secretary/entries' });

    const { user } = view;
    const select = await screen.findByRole('combobox', { name: 'Show: Entry views' });
    await user.click(select);
    const listbox = await screen.findByRole('listbox');
    const optionText = (name: RegExp) => within(listbox).getByRole('option', { name }).textContent;
    expect(optionText(/Needs review/)).toBe('Needs review (1)');
    expect(optionText(/Missing info/)).toBe('Missing info (1)');
    expect(optionText(/Payment due/)).toBe('Payment due (1)');
    expect(optionText(/^All/)).toBe('All (3)');
    expect(optionText(/Move-ups/)).toBe('Move-ups (5)');
  });
});

describe('EntryManagementPage status sentence (MYK9-906)', () => {
  const sentence = () =>
    screen
      .getAllByRole('status')
      .map(el => el.textContent)
      .find(text => text?.startsWith('Showing'));

  it('keeps the whole-show total as the denominator while a class scope narrows the list', async () => {
    render(<EntryManagementPage />, { initialRoute: '/secretary/entries?queue=all&class=class-9' });

    await screen.findByRole('combobox', { name: 'Show: Entry views' });
    expect(sentence()).toMatch(/^Showing 0 of 3 registrations/);
  });

  it('keeps the same denominator when a search is added to the scope', async () => {
    render(<EntryManagementPage />, {
      initialRoute: '/secretary/entries?queue=all&class=class-9&search=nomatch',
    });

    await screen.findByRole('combobox', { name: 'Show: Entry views' });
    expect(sentence()).toMatch(/^Showing 0 of 3 registrations/);
  });

  it('ignores the retired paymentStatus param: a stale link shows the unfiltered list', async () => {
    render(<EntryManagementPage />, {
      initialRoute: '/secretary/entries?queue=all&paymentStatus=paid_online',
    });

    await screen.findByRole('combobox', { name: 'Show: Entry views' });
    // Unfiltered, the toolbar's result line says nothing (the view select carries the totals): no
    // "Showing all 3 registrations." and no narrowed "Showing 1 of 3 registrations." The pager's own
    // "Showing 1–3 of 3 registrations" is a different status.
    const toolbarSentences = screen
      .getAllByRole('status')
      .map(el => el.textContent ?? '')
      .filter(text => /^Showing (all )?\d+( of \d+)? registrations?\.$/.test(text));
    expect(toolbarSentences).toEqual([]);
    const queue = await screen.findByRole('list', { name: 'Registration work queue' });
    expect(within(queue).getAllByRole('listitem')).toHaveLength(3);
  });
});
