import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import EntryManagementPage from '../EntryManagementPage';

const h = vi.hoisted(() => ({
  setEntries: vi.fn(),
  loadEntries: vi.fn(),
  readStoredSecretaryRows: vi.fn(),
  refreshEntries: undefined as ((ids?: readonly string[]) => void | Promise<void>) | undefined,
}));

vi.mock('../WaitlistManagementPage/index', () => ({ default: () => <div>Waitlist</div> }));

// The desks' own behaviour is tested with them; here only what the page hands them matters.
vi.mock('../EntryManagementExceptionPanes', () => ({
  EntryManagementExceptionPanes: ({
    onRefreshEntries,
  }: {
    onRefreshEntries: (ids?: readonly string[]) => void | Promise<void>;
  }) => {
    h.refreshEntries = onRefreshEntries;
    return <div>Exception panes</div>;
  },
}));

vi.mock('@/services/database/entries/secretaryStoredRows', () => ({
  readStoredSecretaryRows: h.readStoredSecretaryRows,
}));

vi.mock('@/hooks/useEntryManagementData', () => ({
  useEntryManagementData: () => ({
    user: null,
    hasRole: () => true,
    shows: [],
    selectedShowId: 'show-1',
    isLoadingShows: false,
    entries: [],
    setEntries: h.setEntries,
    isLoading: false,
    error: null,
    setError: vi.fn(),
    loadError: null,
    loadEntries: h.loadEntries,
    stats: { total: 0, pending: 0, accepted: 0, waitlist: 0, issues: 0 },
    tabCounts: { all: 0, pending: 0, accepted: 0, waitlist: 0, issues: 0 },
    lastEmailedMap: {},
    refreshEmailLog: vi.fn(),
  }),
  mapSecretaryEntryToEntryManagementEntry: vi.fn(),
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

vi.mock('@/services/AuditService', () => ({ auditService: { log: vi.fn() } }));

describe('EntryManagementPage hands the desks its refresh-after-write (MYK9-1812)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.refreshEntries = undefined;
    h.loadEntries.mockResolvedValue(undefined);
    h.readStoredSecretaryRows.mockResolvedValue([{ id: 'entry-1' }]);
  });

  it('reads the stored rows back into its list, then re-reads', async () => {
    render(<EntryManagementPage />, {
      initialRoute: '/secretary/entries?tab=exceptions&exception=check-in',
    });
    await screen.findByText('Exception panes');

    await h.refreshEntries?.(['entry-1']);

    expect(h.readStoredSecretaryRows).toHaveBeenCalledWith(['entry-1']);
    await waitFor(() => expect(h.setEntries).toHaveBeenCalledTimes(1));
    expect(h.loadEntries).toHaveBeenCalledWith('show-1');
  });

  it('still re-reads when no stored id is named', async () => {
    render(<EntryManagementPage />, {
      initialRoute: '/secretary/entries?tab=exceptions&exception=check-in',
    });
    await screen.findByText('Exception panes');

    await h.refreshEntries?.();

    expect(h.readStoredSecretaryRows).not.toHaveBeenCalled();
    expect(h.setEntries).not.toHaveBeenCalled();
    expect(h.loadEntries).toHaveBeenCalledWith('show-1');
  });
});
