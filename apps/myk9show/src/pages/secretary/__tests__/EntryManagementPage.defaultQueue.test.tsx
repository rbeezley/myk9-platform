/**
 * MYK9-1594: with no queue in the URL, Entry Forms opens on every form (no status filter, nothing
 * written to the URL), forms needing attention first; a queue the URL names or the secretary picks
 * in the Filter menu always wins. This replaces MYK9-1276's Needs review landing.
 */
import { useLocation } from 'react-router-dom';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import EntryManagementPage from '../EntryManagementPage';

function entry(id: string, overrides: Partial<EntryManagementEntry> = {}): EntryManagementEntry {
  return {
    id,
    registrationId: id,
    entryNumber: `#${id}`,
    showId: 'show-1',
    dogId: id,
    dogName: `Dog ${id}`,
    ownerName: 'Owner',
    ownerEmail: 'owner@example.com',
    handlerName: 'Handler',
    classes: [
      { id, classId: 'class-1', name: 'Novice A', number: '1', fee: 25, status: 'entered' },
    ],
    totalFee: 25,
    paidAmount: 25,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date(2026, 6, 1, 9),
    lastUpdated: new Date(2026, 6, 1, 9),
    ...overrides,
  };
}

const data = vi.hoisted(() => ({ entries: [] as EntryManagementEntry[] }));

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
    entries: data.entries,
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
vi.mock('../WaitlistManagementPage/index', () => ({ default: () => null }));
vi.mock('@/components/entries/MoveUpRequestsTab', () => ({ MoveUpRequestsTab: () => null }));
vi.mock('@/components/entries/PullManagementTab', () => ({ PullManagementTab: () => null }));
vi.mock('@/services/database/day-of-operations', () => ({
  getClassesWithCapacity: vi.fn(async () => ({ data: [{ available_spots: 2 }], error: null })),
}));
vi.mock('@/services/AuditService', () => ({ auditService: { log: vi.fn() } }));
vi.mock('@/hooks/useMoveUpRequestsCount', () => ({
  useMoveUpRequestsCount: () => ({ count: 0, isLoading: false }),
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

function LocationProbe() {
  return <output data-testid="location-search">{useLocation().search}</output>;
}

const renderAt = (route: string) =>
  render(
    <>
      <EntryManagementPage />
      <LocationProbe />
    </>,
    { initialRoute: route }
  );

const listedForms = async () =>
  within(await screen.findByRole('list', { name: 'Entry form work queue' })).getAllByRole(
    'listitem'
  );

describe('EntryManagementPage default queue (MYK9-1594)', () => {
  // cmdk scrolls the highlighted row into view; jsdom has no layout, so no scrollIntoView.
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterAll(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });
  beforeEach(() => {
    data.entries = [entry('e1'), entry('e2')];
  });

  it('opens on every form, with no status filter and no queue in the URL', async () => {
    data.entries = [entry('e1'), entry('e2', { entryStatus: EntryStatus.PENDING })];
    renderAt('/shows/show-1/entries');

    // The form that needs review does not hide the accepted one.
    expect(await listedForms()).toHaveLength(2);
    expect(screen.queryByText(/^Status:/)).toBeNull();
    expect(screen.getByTestId('location-search')).toBeEmptyDOMElement();
  });

  it('lists the form that needs review first, and marks it in the row', async () => {
    data.entries = [
      entry('e1', { submittedAt: new Date(2026, 6, 1, 8) }),
      entry('e2', { entryStatus: EntryStatus.PENDING, submittedAt: new Date(2026, 6, 2, 8) }),
    ];
    renderAt('/shows/show-1/entries');

    const rows = await listedForms();
    expect(within(rows[0]!).getByTestId('needs-review-marker')).toHaveTextContent('Needs review');
    expect(within(rows[1]!).queryByTestId('needs-review-marker')).toBeNull();
  });

  it('keeps an explicit queue=needs-review and names the count in All', async () => {
    renderAt('/shows/show-1/entries?queue=needs-review');

    expect(await screen.findByText('Nothing needs review')).toBeInTheDocument();
    expect(
      screen.getByText('2 entry forms are in All. Clear the Status filter to see them.')
    ).toBeInTheDocument();
    expect(screen.getByTestId('location-search')).toHaveTextContent('?queue=needs-review');
    expect(screen.getByText('Status: Needs review')).toBeInTheDocument();
  });

  it('judges the All count on the class in view, not the whole show', async () => {
    const inClass2 = (id: string, overrides: Partial<EntryManagementEntry> = {}) =>
      entry(id, {
        classes: [
          { id, classId: 'class-2', name: 'Open A', number: '2', fee: 25, status: 'entered' },
        ],
        ...overrides,
      });
    data.entries = [entry('e1', { entryStatus: EntryStatus.PENDING }), entry('e2'), inClass2('e3')];
    const bare = renderAt('/shows/show-1/entries?class=class-2');
    expect(await listedForms()).toHaveLength(1);
    expect(screen.getByTestId('location-search')).toHaveTextContent('?class=class-2');
    bare.unmount();

    renderAt('/shows/show-1/entries?queue=needs-review&class=class-2');
    expect(await screen.findByText('Nothing needs review')).toBeInTheDocument();
    expect(
      screen.getByText('1 entry form is in All. Clear the Status filter to see it.')
    ).toBeInTheDocument();
  });

  it('writes the status the secretary picks in the Filter menu into the URL, and unticking shows every form', async () => {
    data.entries = [entry('e1'), entry('e2', { entryStatus: EntryStatus.PENDING })];
    const { user } = renderAt('/shows/show-1/entries');
    expect(await listedForms()).toHaveLength(2);

    await user.click(await screen.findByRole('button', { name: /^Filter/ }));
    await user.click(await screen.findByRole('option', { name: /Needs review/ }));

    expect(await listedForms()).toHaveLength(1);
    expect(screen.getByTestId('location-search')).toHaveTextContent('?queue=needs-review');

    await user.click(await screen.findByRole('option', { name: /Needs review/ }));
    expect(await listedForms()).toHaveLength(2);
    expect(screen.getByTestId('location-search')).toHaveTextContent('?queue=all');
  });
});
