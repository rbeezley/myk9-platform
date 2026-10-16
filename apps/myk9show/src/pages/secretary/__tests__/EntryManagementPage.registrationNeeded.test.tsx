/**
 * MYK9-1162: the "Registration number needed" exception on the Entries cockpit.
 * Real entries go through the real held-entry rule and the page's own wiring, so
 * the count on the menu is the number of rows the pane lists, the pane is URL
 * state, and adding a number removes the row.
 */
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { Dog } from '@/types/dog-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import EntryManagementPage from '../EntryManagementPage';

function entry(id: string, dogId: string, dogName: string, held = false): EntryManagementEntry {
  return {
    ...(held && { awaitingRegistrationNumber: true }),
    id,
    registrationId: `registration-${id}`,
    entryNumber: id,
    showId: 'show-1',
    dogId,
    dogName,
    ownerName: `${dogName}'s person`,
    ownerEmail: '',
    handlerName: 'Handler',
    classes: [
      {
        id,
        classId: 'class-1',
        name: 'Container Novice',
        number: '1',
        fee: 25,
        status: 'entered',
        trialId: 'trial-1',
      },
    ],
    totalFee: 25,
    paidAmount: 0,
    entryStatus: EntryStatus.ACCEPTED,
    rawEntryStatus: 'confirmed',
    paymentStatus: PaymentStatus.PENDING,
    submittedAt: new Date(2026, 6, 1),
    lastUpdated: new Date(2026, 6, 1),
  };
}

const state = vi.hoisted(() => ({
  trialsFailed: false,
  entries: [] as EntryManagementEntry[],
  dogs: [] as Dog[],
  dogsReady: true,
}));

const dog = (id: string, registrations: unknown[]): Dog =>
  ({ id, name: id, callName: id, breed: 'Beagle', registrations }) as unknown as Dog;
const akc = { id: 'r', organization: 'AKC', registrationNumber: 'SR1' };

vi.mock('@/hooks/useEntryManagementData', () => ({
  useEntryManagementData: () => ({
    user: null,
    hasRole: () => true,
    shows: [{ id: 'show-1', name: 'Test Show' }],
    selectedShowId: 'show-1',
    isLoadingShows: false,
    didResolveShow: true,
    showError: null,
    retryShowResolution: vi.fn(),
    loadedEntriesShowId: 'show-1',
    entries: state.entries,
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
vi.mock('@/hooks/queries/useShowTrials', () => ({
  useShowTrials: () => ({
    data: state.trialsFailed ? undefined : [{ id: 'trial-1', registry_id: 'AKC' }],
    isError: state.trialsFailed,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({
    dogs: state.dogs,
    isReady: state.dogsReady,
    rosterError: null,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/hooks/useMoveUpRequestsCount', () => ({
  useMoveUpRequestsCount: () => ({ count: 0, refetch: vi.fn() }),
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
    handleEntryRemoved: vi.fn(),
    handleSendDecisionEmail: vi.fn(),
  }),
}));
vi.mock('@/hooks/useEntryManagementTrialScope', () => ({
  useEntryManagementTrialClasses: () => ({
    trialClasses: [],
    trialClassIds: undefined,
    knownClassIds: undefined,
    isLoadingClasses: false,
    trialClassesUnknown: false,
    refetchTrialClasses: vi.fn(),
  }),
  useEntryManagementTrialScope: () => ({ trials: [], isLoadingTrials: false, trialsLoaded: false }),
}));
vi.mock('@/components/dogs/DogDetails/Registrations/DogRegistrationDialogs', () => ({
  default: () => null,
}));
vi.mock('../WaitlistManagementPage/index', () => ({ default: () => null }));
vi.mock('@/components/entries/MoveUpRequestsTab', () => ({ MoveUpRequestsTab: () => null }));
vi.mock('@/components/entries/PullManagementTab', () => ({ PullManagementTab: () => null }));
vi.mock('@/services/AuditService', () => ({ auditService: { log: vi.fn() } }));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
}

const PANE = '/shows/show-1/entries?tab=exceptions&exception=registration-needed';

function page() {
  return (
    <>
      <EntryManagementPage />
      <LocationProbe />
    </>
  );
}

describe('EntryManagementPage registration number needed (MYK9-1162)', () => {
  beforeEach(() => {
    state.dogsReady = true;
    state.trialsFailed = false;
    // The server marks e1 and e2 as held (MYK9-1162); the pane never rederives it.
    state.entries = [
      entry('e1', 'd1', 'Scout', true),
      entry('e2', 'd2', 'Juni', true),
      entry('e3', 'd3', 'Ok'),
    ];
    state.dogs = [dog('d1', []), dog('d2', [{ ...akc, organization: 'UKC' }]), dog('d3', [akc])];
  });

  it('counts the entries awaiting a number on the menu and lists exactly those in the pane', async () => {
    const { user } = render(page(), { initialRoute: PANE });

    const rows = await screen.findAllByRole('listitem');
    expect(within(rows[0]!.closest('ul')!).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Scout')).toBeInTheDocument();
    expect(screen.getByText('Juni')).toBeInTheDocument();
    expect(screen.queryByText('Ok')).toBeNull();

    await user.click(screen.getByRole('button', { name: /^Show:/ }));
    const menu = await screen.findByRole('menu');
    expect(
      within(menu).getByRole('menuitemradio', { name: /Registration number needed/ }).textContent
    ).toBe('Registration number needed (2)');
  });

  it('keeps the pane in the URL, so a refresh or copied link reopens it', async () => {
    render(page(), { initialRoute: PANE });

    await screen.findByRole('heading', { name: /Registration number needed/ });
    await waitFor(() =>
      expect(screen.getByTestId('location-search')).toHaveTextContent(
        '?tab=exceptions&exception=registration-needed'
      )
    );
  });

  it('removes a row and drops the count once the server clears the hold', async () => {
    const view = render(page(), { initialRoute: PANE });
    await screen.findByText('Scout');

    // The number was added: the entry re-syncs with the server's new verdict.
    state.entries = [entry('e1', 'd1', 'Scout'), ...state.entries.slice(1)];
    view.rerender(page());

    await waitFor(() => expect(screen.queryByText('Scout')).toBeNull());
    expect(screen.getByText('Juni')).toBeInTheDocument();
    await view.user.click(screen.getByRole('button', { name: /^Show:/ }));
    expect(
      within(await screen.findByRole('menu')).getByRole('menuitemradio', {
        name: /Registration number needed/,
      }).textContent
    ).toBe('Registration number needed (1)');
  });

  it('shows no count, never a fake 0, until the dog roster has loaded', async () => {
    state.dogsReady = false;
    const { user } = render(page(), { initialRoute: PANE });

    await user.click(await screen.findByRole('button', { name: /^Show:/ }));
    expect(
      within(await screen.findByRole('menu')).getByRole('menuitemradio', {
        name: /Registration number needed/,
      }).textContent
    ).toBe('Registration number needed');
  });

  it('Pull / Withdraw opens that registration’s entry form in the All view', async () => {
    const { user } = render(page(), { initialRoute: PANE });

    await user.click(await screen.findByRole('button', { name: 'Pull or withdraw Juni' }));

    await waitFor(() =>
      expect(screen.getByTestId('location-search')).toHaveTextContent(
        '?queue=all&registration=registration-e2'
      )
    );
  });

  it('says it could not load, with a Retry, when the trials read fails: never an endless skeleton', async () => {
    state.trialsFailed = true;
    render(page(), { initialRoute: PANE });

    expect(await screen.findByText("Couldn't load this show's entries")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: /Loading entries awaiting/ })).toBeNull();
  });
});
