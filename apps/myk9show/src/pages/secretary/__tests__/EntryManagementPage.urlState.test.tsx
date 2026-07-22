import { useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
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
  paymentStatus: 'pending',
  submittedAt: new Date(2026, 6, 1, 9),
  lastUpdated: new Date(2026, 6, 1, 9),
}));

vi.mock('@/hooks/useEntryManagementData', () => ({
  useEntryManagementData: () => ({
    user: null,
    hasRole: () => true,
    shows: [{ id: 'show-1', name: 'Demo Show' }],
    selectedShowId: 'show-1',
    isLoadingShows: false,
    entries: [testEntry],
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

vi.mock('@/hooks/useEntryManagementActions', () => ({
  useEntryManagementActions: () => ({
    isProcessing: false,
    armbandDialog: { open: false, entry: null, value: '' },
    setArmbandDialog: vi.fn(),
    handleStatusChange: vi.fn(),
    handleAssignArmband: vi.fn(),
    handleNextArmband: vi.fn(),
    handleEnrollmentBulkStatusChange: vi.fn(),
    handleEnrollmentBulkCheckIn: vi.fn(),
    handleEnrollmentPaymentChange: vi.fn(),
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
    cockpitState,
  }: {
    cockpitState: { registrationKey: string | null };
  }) => (
    <output data-testid="focused-registration">{cockpitState.registrationKey ?? 'none'}</output>
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
vi.mock('@/features/operational-views/CopyViewLinkButton', () => ({
  CopyViewLinkButton: () => null,
}));
vi.mock('@/services/AuditService', () => ({ auditService: { log: vi.fn() } }));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
}

describe('EntryManagementPage URL ownership', () => {
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
});
