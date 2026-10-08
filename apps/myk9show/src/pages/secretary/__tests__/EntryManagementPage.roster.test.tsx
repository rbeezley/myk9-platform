import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import EntryManagementPage from '../EntryManagementPage';

vi.mock('../WaitlistManagementPage/index', () => ({ default: () => <div>Waitlist</div> }));

vi.mock('@/hooks/useEntryManagementData', () => ({
  useEntryManagementData: () => ({
    user: null,
    hasRole: () => true,
    shows: [],
    selectedShowId: 'show-1',
    isLoadingShows: false,
    entries: [],
    setEntries: vi.fn(),
    isLoading: false,
    error: null,
    setError: vi.fn(),
    loadError: null,
    loadEntries: vi.fn(),
    stats: { total: 0, pending: 0, accepted: 0, waitlist: 0, issues: 0 },
    tabCounts: { all: 0, pending: 0, accepted: 0, waitlist: 0, issues: 0 },
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

vi.mock('@/hooks/queries/useShowTrials', () => ({
  useShowTrials: () => ({
    data: [{ id: 't1', name: 'Trial 1', date: null, trial_number: 1 }],
    isLoading: false,
    isSuccess: true,
  }),
}));

vi.mock('@/hooks/queries/useClassesDatabase', () => ({
  classesByTrialQueryOptions: (trialId: string) => ({
    queryKey: ['classes', 'trial', trialId],
    queryFn: async () => [
      { id: 'c1', name: 'Novice A' },
      { id: 'c2', name: 'Open B' },
    ],
  }),
}));

// Two roster rows in different classes; only the c1 row should survive the filter.
vi.mock('@/hooks/queries/useTrialEntries', () => ({
  useTrialEntries: () => ({
    data: [
      {
        id: 'r1',
        armband: 1,
        dog: { call_name: 'Rex' },
        class: { name: 'Novice A' },
        class_id: 'c1',
        is_scored: false,
        check_in_status: null,
      },
      {
        id: 'r2',
        armband: 2,
        dog: { call_name: 'Fido' },
        class: { name: 'Open B' },
        class_id: 'c2',
        is_scored: false,
        check_in_status: null,
      },
    ],
    isLoading: false,
  }),
}));

vi.mock('@/services/AuditService', () => ({ auditService: { log: vi.fn() } }));

describe('EntryManagementPage legacy roster links', () => {
  // The Trial/Class selects became one Filter button with the applied filters as sentences
  // (docs/plan-entries-filter-button.md); this still proves the legacy `?trial=&class=` scope
  // survives normalization onto that toolbar.
  it('normalizes the retired roster presentation into the scoped registration cockpit', async () => {
    render(<EntryManagementPage />, {
      initialRoute: '/secretary/entries?tab=entries&trial=t1&roster=1&class=c1',
    });

    expect(
      screen.getByPlaceholderText('Search exhibitor, dog, handler, armband, confirmation, class…')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filter, 2 applied' })).toBeInTheDocument();
    expect(await screen.findByText('Trial: Trial 1')).toBeInTheDocument();
    expect(await screen.findByText('Class: Novice A')).toBeInTheDocument();
  });
});
