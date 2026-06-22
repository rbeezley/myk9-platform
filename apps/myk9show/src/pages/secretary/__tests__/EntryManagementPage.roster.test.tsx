import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import EntryManagementPage from '../EntryManagementPage';

// Capture the entries TrialRosterView actually receives so we can assert the
// class filter narrows the roster (P1 review fix).
vi.mock('@/components/entries/management/TrialRosterView', () => ({
  TrialRosterView: ({ entries }: { entries: Array<{ id: string; classId: string }> }) => (
    <div data-testid="roster">
      {entries.map(e => (
        <span key={e.id} data-testid="roster-row" data-class={e.classId} />
      ))}
    </div>
  ),
}));

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

// Roster mode, with class "c1" selected.
vi.mock('@/hooks/useEntryManagementFilters', () => ({
  useEntryManagementFilters: () => ({
    searchTerm: '',
    setSearchTerm: vi.fn(),
    paymentFilter: 'all',
    setPaymentFilter: vi.fn(),
    selectedTab: 'all',
    setSelectedTab: vi.fn(),
    attentionFilter: 'all',
    setAttentionFilter: vi.fn(),
    workMode: 'review',
    setWorkMode: vi.fn(),
    entryViewMode: 'table',
    setEntryViewMode: vi.fn(),
    trialFilter: 't1',
    setTrialFilter: vi.fn(),
    classFilter: 'c1',
    setClassFilter: vi.fn(),
    viewMode: 'roster',
    rosterView: true,
    setRosterView: vi.fn(),
    selectedEntries: new Set<string>(),
    setSelectedEntries: vi.fn(),
    handleSelectEntry: vi.fn(),
    handleSelectAll: vi.fn(),
    filteredEntries: [],
    tabCounts: { all: 0, pending: 0, accepted: 0, waitlist: 0, issues: 0 },
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

vi.mock('@/hooks/queries/useShowTrials', () => ({
  useShowTrials: () => ({ data: [{ id: 't1', name: 'Trial 1', date: null, trial_number: 1 }], isLoading: false }),
}));

vi.mock('@/hooks/queries/useClassesDatabase', () => ({
  useClassesByTrialQuery: () => ({
    data: [
      { id: 'c1', name: 'Novice A' },
      { id: 'c2', name: 'Open B' },
    ],
    isLoading: false,
  }),
}));

// Two roster rows in different classes; only the c1 row should survive the filter.
vi.mock('@/hooks/queries/useTrialEntries', () => ({
  useTrialEntries: () => ({
    data: [
      { id: 'r1', armband: 1, dog: { call_name: 'Rex' }, class: { name: 'Novice A' }, class_id: 'c1', is_scored: false, check_in_status: null },
      { id: 'r2', armband: 2, dog: { call_name: 'Fido' }, class: { name: 'Open B' }, class_id: 'c2', is_scored: false, check_in_status: null },
    ],
    isLoading: false,
  }),
}));

vi.mock('@/services/AuditService', () => ({ auditService: { log: vi.fn() } }));

describe('EntryManagementPage roster class filter (P1)', () => {
  it('narrows the roster to the selected class in Roster mode', () => {
    render(<EntryManagementPage />, {
      initialRoute: '/secretary/entries?tab=entries&trial=t1&roster=1&class=c1',
    });

    const rows = screen.getAllByTestId('roster-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute('data-class', 'c1');
  });
});
