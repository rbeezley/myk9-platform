/**
 * MYK9-1800: the page is the last hop that decides whether an Accept emails the exhibitor
 * with no preview. It reads the show's status and last day from the replicated show (its own
 * show rows carry no status). Dropping that hop makes every show fall back to the preview
 * without any other test noticing.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@/test/utils/testUtils';
import { useShowStore } from '@/store/showStore';
import type { Show } from '@/types/show-types';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import EntryManagementPage from '../EntryManagementPage';

const cockpitProps = vi.hoisted(() => ({ sendDecisionEmailsUnasked: vi.fn() }));

const acceptedEntry: EntryManagementEntry = {
  id: 'e1',
  registrationId: 'e1',
  entryNumber: '#e1',
  showId: 'show-1',
  dogId: 'e1',
  dogName: 'Maple',
  ownerName: 'Owner',
  ownerEmail: 'owner@example.com',
  handlerName: 'Handler',
  classes: [
    { id: 'e1', classId: 'class-1', name: 'Novice A', number: '1', fee: 25, status: 'entered' },
  ],
  totalFee: 25,
  paidAmount: 25,
  entryStatus: EntryStatus.ACCEPTED,
  paymentStatus: PaymentStatus.PAID_ONLINE,
  submittedAt: new Date(2026, 6, 1, 9),
  lastUpdated: new Date(2026, 6, 1, 9),
};

vi.mock('@/components/entries/management/EntryManagementCockpit', () => ({
  EntryManagementCockpit: (props: { sendDecisionEmailsUnasked?: boolean }) => {
    cockpitProps.sendDecisionEmailsUnasked(props.sendDecisionEmailsUnasked);
    return null;
  },
}));
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
    entries: [acceptedEntry],
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

async function unaskedFor(replicated: Array<Partial<Show>>) {
  cockpitProps.sendDecisionEmailsUnasked.mockClear();
  useShowStore.setState({ shows: replicated as Show[] });
  render(<EntryManagementPage />, { initialRoute: '/shows/show-1/entries' });
  await waitFor(() => expect(cockpitProps.sendDecisionEmailsUnasked).toHaveBeenCalled());
  return cockpitProps.sendDecisionEmailsUnasked.mock.lastCall?.[0];
}

describe('EntryManagementPage tells the cockpit whether this show emails decisions unasked', () => {
  // cmdk scrolls the highlighted row into view; jsdom has no layout, so no scrollIntoView.
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterAll(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  it('yes for a published show that has not finished', async () => {
    expect(await unaskedFor([{ id: 'show-1', status: 'published', endDate: '2999-01-01' }])).toBe(
      true
    );
  });

  it('no for a draft show', async () => {
    expect(await unaskedFor([{ id: 'show-1', status: 'draft', endDate: '2999-01-01' }])).toBe(
      false
    );
  });

  it('no for a published show that is over', async () => {
    expect(await unaskedFor([{ id: 'show-1', status: 'published', endDate: '2020-01-01' }])).toBe(
      false
    );
  });

  it('no when the replicated show is another show, or not loaded yet', async () => {
    expect(
      await unaskedFor([{ id: 'other-show', status: 'published', endDate: '2999-01-01' }])
    ).toBe(false);
    expect(await unaskedFor([])).toBe(false);
  });
});
