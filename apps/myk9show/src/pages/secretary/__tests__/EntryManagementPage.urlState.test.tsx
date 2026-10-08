import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { blockedActionFor } from '@/features/delete/deleteBlockedAction';
import EntryManagementPage from '../EntryManagementPage';

const testEntry = vi.hoisted(() => ({
  id: 'entry-1',
  registrationId: 'registration-1',
  entryNumber: 'E-1',
  showId: 'show-1',
  dogId: 'dog-1',
  dogName: 'Scout',
  ownerName: 'Alice Martin',
  ownerEmail: 'alice@example.com',
  handlerName: 'Alice Martin',
  classes: [
    {
      id: 'entry-1',
      classId: 'class-1',
      name: 'Container Novice',
      number: '1',
      fee: 25,
      status: 'entered',
    },
  ],
  totalFee: 25,
  paidAmount: 0,
  entryStatus: 'pending',
  isScored: false,
  paymentStatus: 'pending',
  submittedAt: new Date(2026, 6, 1, 9),
  lastUpdated: new Date(2026, 6, 1, 9),
}));

const entryDataState = vi.hoisted(() => ({
  entries: [] as (typeof testEntry)[],
  loadedEntriesShowId: 'show-1' as string | null,
}));

vi.mock('@/hooks/useEntryManagementData', () => ({
  useEntryManagementData: () => ({
    user: null,
    hasRole: () => true,
    shows: [{ id: 'show-1', name: 'Demo Show' }],
    selectedShowId: 'show-1',
    isLoadingShows: false,
    entries: entryDataState.entries,
    setEntries: vi.fn(),
    isLoading: false,
    error: null,
    setError: vi.fn(),
    loadError: null,
    loadedEntriesShowId: entryDataState.loadedEntriesShowId,
    loadEntries: vi.fn(),
    lastEmailedMap: {},
    refreshEmailLog: vi.fn(),
  }),
}));

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
    trialClassIds: [],
    isLoadingClasses: false,
  }),
  useEntryManagementTrialScope: () => ({ trials: [], isLoadingTrials: false }),
}));

vi.mock('@/components/entries/management/EntryManagementCockpit', () => ({
  EntryManagementCockpit: ({
    cockpit,
  }: {
    cockpit: {
      page: { total: number };
      state: { registrationKey: string | null };
      focusedGroup: { entries: { id: string }[] } | null;
    };
  }) => (
    <>
      <output data-testid="focused-registration">{cockpit.state.registrationKey ?? 'none'}</output>
      <output data-testid="form-total">{cockpit.page.total}</output>
      <output data-testid="visible-entry">{cockpit.focusedGroup?.entries[0]?.id ?? 'none'}</output>
    </>
  ),
}));
vi.mock('@/components/entries/management', () => ({
  ArmbandDialog: () => null,
  CompEntryDialog: () => null,
}));
vi.mock('../WaitlistManagementPage/index', () => ({ default: () => null }));
vi.mock('@/components/entries/MoveUpRequestsTab', () => ({ MoveUpRequestsTab: () => null }));
vi.mock('@/components/entries/PullManagementTab', () => ({ PullManagementTab: () => null }));
vi.mock('@/features/registration/SecretaryAddEntriesDecision', () => ({
  SecretaryAddEntriesDecision: () => null,
}));
vi.mock('@/services/AuditService', () => ({ auditService: { log: vi.fn() } }));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
}

describe('EntryManagementPage URL ownership', () => {
  beforeEach(() => {
    entryDataState.entries = [testEntry];
    entryDataState.loadedEntriesShowId = 'show-1';
  });

  it('resolves a legacy entry focus to its show-scoped registration', async () => {
    render(
      <>
        <EntryManagementPage />
        <LocationProbe />
      </>,
      { initialRoute: '/shows/show-1/entries?entry=entry-1' }
    );

    await waitFor(() =>
      expect(screen.getByTestId('location-search')).toHaveTextContent(
        '?registration=registration-1'
      )
    );
    expect(screen.getByTestId('focused-registration')).toHaveTextContent('registration-1');
  });

  it('keeps a scored entry visible when linked from blocked delete', async () => {
    entryDataState.entries = [
      { ...testEntry, id: 'entry-0', registrationId: 'registration-0', dogId: 'dog-0' },
      { ...testEntry, entryStatus: 'accepted', paymentStatus: 'paid', isScored: true },
    ];

    const action = blockedActionFor('entry', [
      { id: 'entry-1', name: 'Scout', context: { showId: 'show-1' } },
    ]);
    expect(action).toBeDefined();

    render(
      <>
        <EntryManagementPage />
        <LocationProbe />
      </>,
      { initialRoute: action!.to }
    );

    await waitFor(() =>
      expect(screen.getByTestId('location-search')).toHaveTextContent(
        '?queue=all&registration=registration-1'
      )
    );
    expect(screen.getByTestId('focused-registration')).toHaveTextContent('registration-1');
    expect(screen.getByTestId('visible-entry')).toHaveTextContent('entry-1');
  });

  it('removes a registration focus that does not belong to the loaded show', async () => {
    render(
      <>
        <EntryManagementPage />
        <LocationProbe />
      </>,
      { initialRoute: '/shows/show-1/entries?registration=registration-other' }
    );

    await waitFor(() => expect(screen.getByTestId('location-search')).toBeEmptyDOMElement());
    expect(screen.getByTestId('focused-registration')).toHaveTextContent('none');
  });

  it('preserves registration focus before the selected show entries have loaded', async () => {
    entryDataState.entries = [];
    entryDataState.loadedEntriesShowId = null;

    render(
      <>
        <EntryManagementPage />
        <LocationProbe />
      </>,
      { initialRoute: '/shows/show-1/entries?registration=registration-1' }
    );

    await waitFor(() =>
      expect(screen.getByTestId('location-search')).toHaveTextContent(
        '?registration=registration-1'
      )
    );
    expect(screen.getByTestId('focused-registration')).toHaveTextContent('registration-1');
  });

  it('removes stale focus after an authoritative empty-show load', async () => {
    entryDataState.entries = [];
    entryDataState.loadedEntriesShowId = 'show-1';

    render(
      <>
        <EntryManagementPage />
        <LocationProbe />
      </>,
      { initialRoute: '/shows/show-1/entries?registration=registration-stale' }
    );

    await waitFor(() => expect(screen.getByTestId('location-search')).toBeEmptyDOMElement());
    expect(screen.getByTestId('focused-registration')).toHaveTextContent('none');
  });

  it('Show all forms widens only the queue and keeps the trial and class scope', async () => {
    entryDataState.entries = [{ ...testEntry, entryStatus: 'accepted', paymentStatus: 'paid' }];

    const { user } = render(
      <>
        <EntryManagementPage />
        <LocationProbe />
      </>,
      { initialRoute: '/shows/show-1/entries?trial=trial-1&class=class-1' }
    );

    await user.click(await screen.findByRole('button', { name: 'Show all forms' }));

    await waitFor(() =>
      expect(screen.getByTestId('location-search').textContent).toBe(
        '?queue=all&trial=trial-1&class=class-1'
      )
    );
  });

  it('Show all forms clears a search that hid the class forms, keeping the scope', async () => {
    entryDataState.entries = [{ ...testEntry, entryStatus: 'accepted', paymentStatus: 'paid' }];

    const { user } = render(
      <>
        <EntryManagementPage />
        <LocationProbe />
      </>,
      { initialRoute: '/shows/show-1/entries?trial=trial-1&class=class-1&search=zzz' }
    );

    await waitFor(() => expect(screen.getByTestId('form-total')).toHaveTextContent('0'));
    await user.click(await screen.findByRole('button', { name: 'Show all forms' }));

    await waitFor(() => expect(screen.getByTestId('form-total')).toHaveTextContent('1'));
    expect(screen.getByTestId('location-search').textContent).toBe(
      '?queue=all&trial=trial-1&class=class-1'
    );
  });
});
