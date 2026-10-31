/**
 * MYK9-810 rule, applied to the unified `ListViewTabs` row (MYK9-795): "View
 * counts match the rows each view actually shows (tested)." Real entries with
 * distinct attention reasons go through the same `useEntryManagementCockpit`
 * the page renders from, so this proves the number on each button is the
 * number of registrations that view would list — not a hand-picked mock.
 */
import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import { mockViewportWidth } from '@/test/utils/mockViewportWidth';
import { render, screen, within } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { usePageEditTargetStore } from '@/features/actions/pageEditTarget';
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
vi.mock('@/services/database/day-of-operations', () => ({
  getClassesWithCapacity: vi.fn(async () => ({ data: [{ available_spots: 2 }], error: null })),
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
vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({
    status: 'resolved',
    canManage: true,
    canOperate: true,
    hasOperationalStaffRole: true,
    clubId: 'club-1',
  }),
}));
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
    classesLoaded: true,
    classTrialById: new Map(),
    knownClassIds: undefined,
    trialClassIds: undefined,
    isLoadingClasses: false,
    trialClassesUnknown: false,
    refetchTrialClasses: vi.fn(),
  }),
  useEntryManagementTrialScope: () => ({ trials: [], isLoadingTrials: false, trialsLoaded: false }),
}));

describe('EntryManagementPage view-tab counts (MYK9-810)', () => {
  // cmdk scrolls the highlighted row into view; jsdom has no layout, so no scrollIntoView.
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterAll(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  it('counts one registration in Needs review, Missing info and Payment due in the Filter menu', async () => {
    const { user } = render(<EntryManagementPage />, { initialRoute: '/secretary/entries' });

    await user.click(await screen.findByRole('button', { name: /^Filter/ }));
    const optionText = (name: RegExp) => screen.getByRole('option', { name }).textContent;
    expect(await screen.findByRole('option', { name: /Needs review/ })).toBeInTheDocument();
    expect(optionText(/Needs review/)).toBe('Needs review1');
    expect(optionText(/Missing info/)).toBe('Missing info1');
    expect(optionText(/Payment due/)).toBe('Payment due1');
    // The list opens on all three forms.
    const queue = await screen.findByRole('list', { name: 'Entry form work queue' });
    expect(within(queue).getAllByRole('listitem')).toHaveLength(3);
  });

  it('carries the Move-ups count on its Entry lists row in the header Actions menu', async () => {
    render(<EntryManagementPage />, { initialRoute: '/secretary/entries' });

    await screen.findByRole('list', { name: 'Entry form work queue' });
    const tools = usePageEditTargetStore.getState().showTools?.tools ?? [];
    expect(tools.find(tool => tool.id === 'entry-list-move-ups')?.attentionLabel).toBe('5');
    expect(usePageEditTargetStore.getState().showTools?.attention.count).toBe(5);
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

    await screen.findByRole('button', { name: /^Filter/ });
    expect(sentence()).toMatch(/^Showing 0 of 3 forms/);
  });

  it('keeps the same denominator when a search is added to the scope', async () => {
    render(<EntryManagementPage />, {
      initialRoute: '/secretary/entries?queue=all&class=class-9&search=nomatch',
    });

    await screen.findByRole('button', { name: /^Filter/ });
    expect(sentence()).toMatch(/^Showing 0 of 3 forms/);
  });

  it('ignores the retired paymentStatus param: a stale link shows the unfiltered list', async () => {
    mockViewportWidth(1440);
    render(<EntryManagementPage />, {
      initialRoute: '/secretary/entries?queue=all&paymentStatus=paid_online',
    });

    await screen.findByRole('button', { name: /^Filter/ });
    // Unfiltered, the toolbar's result line says nothing (the view select carries the totals): no
    // "Showing all 3 registrations." and no narrowed "Showing 1 of 3 registrations." The pager's own
    // "Showing 1–3 of 3 registrations" is a different status.
    const toolbarSentences = screen
      .getAllByRole('status')
      .map(el => el.textContent ?? '')
      .filter(text => /^Showing (all )?\d+( of \d+)? forms?\.$/.test(text));
    expect(toolbarSentences).toEqual([]);
    const queue = await screen.findByRole('list', { name: 'Entry form work queue' });
    expect(within(queue).getAllByRole('listitem')).toHaveLength(3);
  });
});
