import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
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

const scope = vi.hoisted(() => ({ trialClassIds: undefined as string[] | undefined }));

vi.mock('@/hooks/useEntryManagementTrialScope', () => ({
  useEntryManagementTrialClasses: () => ({
    trialClasses: [],
    classesLoaded: true,
    classTrialById: new Map(),
    classNameById: new Map([
      ['class-1', 'Container Novice'],
      ['class-2', 'Handler Discrimination Advanced'],
    ]),
    knownClassIds: new Set(['class-1', 'class-2']),
    trialClassIds: scope.trialClassIds,
    isLoadingClasses: false,
    trialClassesUnknown: false,
    refetchTrialClasses: vi.fn(),
  }),
  useEntryManagementTrialScope: () => ({ trials: [], isLoadingTrials: false }),
}));

vi.mock('@/components/entries/management/EntryManagementCockpit', () => ({
  EntryManagementCockpit: ({
    cockpit,
  }: {
    cockpit: {
      state: { registrationKey: string | null; classIds: string[] };
      focusedGroup: { entries: { id: string }[] } | null;
    };
  }) => (
    <>
      <output data-testid="focused-registration">{cockpit.state.registrationKey ?? 'none'}</output>
      <output data-testid="picked-classes">{cockpit.state.classIds.join(',') || 'none'}</output>
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
vi.mock('@/services/AuditService', () => ({ auditService: { log: vi.fn() } }));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
}

describe('EntryManagementPage carried class (MYK9-1996)', () => {
  beforeEach(() => {
    entryDataState.entries = [testEntry];
    entryDataState.loadedEntriesShowId = 'show-1';
    scope.trialClassIds = undefined;
  });

  const open = (search: string) =>
    render(
      <>
        <EntryManagementPage />
        <LocationProbe />
      </>,
      { initialRoute: `/shows/show-1/entries${search}` }
    );

  it('selects a carried class the show has, with no notice', async () => {
    open('?class=class-2');

    expect(screen.getByTestId('picked-classes')).toHaveTextContent('class-2');
    expect(screen.queryByTestId('carried-class-notice')).not.toBeInTheDocument();
    expect(screen.getByTestId('location-search')).toHaveTextContent('class=class-2');
  });

  it('names a carried class it cannot show and selects no other class', async () => {
    open('?class=class-gone');

    expect(await screen.findByTestId('carried-class-notice')).toHaveTextContent(
      "That class isn't shown here. Pick a class."
    );
    expect(screen.getByTestId('picked-classes')).toHaveTextContent('none');
    await waitFor(() => expect(screen.getByTestId('location-search')).toBeEmptyDOMElement());
    expect(screen.getByTestId('carried-class-notice')).toBeInTheDocument();
  });

  it('names a carried class that is outside the selected trial', async () => {
    scope.trialClassIds = ['class-1'];
    open('?trial=trial-1&class=class-2');

    expect(await screen.findByTestId('carried-class-notice')).toHaveTextContent(
      "Handler Discrimination Advanced isn't shown here. Pick a class."
    );
    expect(screen.getByTestId('picked-classes')).toHaveTextContent('none');
  });

  it('opens with no class and no notice when none is carried', () => {
    open('');

    expect(screen.getByTestId('picked-classes')).toHaveTextContent('none');
    expect(screen.queryByTestId('carried-class-notice')).not.toBeInTheDocument();
  });
});
