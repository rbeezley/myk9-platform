import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/utils/testUtils';
import { Route, Routes } from 'react-router-dom';
import EntryManagementPage from '../EntryManagementPage';

/**
 * REV-2341 R-2 — a regression this PR introduced, pinned with the REAL
 * `useShowManageScope`.
 *
 * `/secretary/entries` has no `:showId` segment; the page resolves its show from
 * localStorage (and `ClassManagementPage` links straight to it). With no show id
 * `useShowManageScope` returns `status: 'resolving'` forever — there is nothing
 * to scope against and no retry can change that — and the round-1 helper failed
 * closed on every non-`resolved` status. So a REAL trial secretary found
 * "Add entry for someone else" permanently disabled, captioned "Trial secretary access
 * only": the app telling the one person it is not about that it is about her.
 *
 * `useShowManageScope` is deliberately NOT mocked here. Mocking it is what let
 * the round-1 tests pass over this.
 */
// String literals, not `UserRole.*`: a `vi.hoisted` factory runs before the
// module's imports are initialised, so referencing the enum there is a TDZ error.
const auth = vi.hoisted(() => ({ roles: ['secretary'] as string[] }));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    hasRole: (role: string) => auth.roles.includes(role),
    userWithRoles: {
      databaseUserId: 'person-1',
      scopes: [{ userId: 'user-1', roleId: 'secretary', scopeType: 'club', scopeId: 'club-1' }],
    },
    isSecretary: auth.roles.includes('secretary'),
    isAdmin: auth.roles.includes('site_admin'),
  }),
}));

vi.mock('@/store/showStore', () => ({ useShowStore: () => ({ shows: [] }) }));

vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useShowQuery: () => ({
    data: null,
    isLoading: false,
    isError: false,
    isPlaceholderData: false,
  }),
  showQueryKeys: { detail: (id: string) => ['shows', id], lists: () => ['shows'] },
}));

vi.mock('../WaitlistManagementPage/index', () => ({ default: () => <div>Waitlist</div> }));
vi.mock('@/components/entries/MoveUpRequestsTab', () => ({
  MoveUpRequestsTab: () => <div>Move-ups</div>,
}));
vi.mock('@/components/entries/PullManagementTab', () => ({
  PullManagementTab: () => <div>Pulls</div>,
}));

vi.mock('@/hooks/useEntryManagementData', () => ({
  useEntryManagementData: () => ({
    user: null,
    // Deliberately permissive, exactly as the deleted in-page gate saw it: a
    // viewer who holds a staff role SOMEWHERE. If the page still consulted this,
    // the cross-club test below would pass through to the body.
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
    entries: [],
    setEntries: vi.fn(),
    isLoading: false,
    error: null,
    setError: vi.fn(),
    loadError: null,
    loadEntries: vi.fn(),
    lastEmailedMap: {},
    refreshEmailLog: vi.fn(),
    stats: { total: 0, pending: 0, accepted: 0, waitlist: 0, issues: 0 },
    tabCounts: { all: 0, pending: 0, accepted: 0, waitlist: 0, issues: 0 },
  }),
}));

vi.mock('@/hooks/useEntryManagementActions', () => ({
  useEntryManagementActions: () => ({
    isProcessing: false,
    checkInDialog: { open: false, entry: null, classEntry: null },
    setCheckInDialog: vi.fn(),
    armbandDialog: { open: false, entry: null, value: '' },
    setArmbandDialog: vi.fn(),
    bulkActionDialog: { open: false, action: null },
    setBulkActionDialog: vi.fn(),
    handleStatusChange: vi.fn(),
    handleAssignArmband: vi.fn(),
    handleBulkCheckIn: vi.fn(),
    handleCheckInStatusUpdate: vi.fn(),
    handleBulkAction: vi.fn(),
    handleExportCSV: vi.fn(),
    handleCompEntry: vi.fn(),
    handleUncompEntry: vi.fn(),
  }),
}));

vi.mock('@/hooks/queries/useShowTrials', () => ({
  useShowTrials: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/queries/useClassesDatabase', () => ({
  useClassesByTrialQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/queries/useTrialEntries', () => ({
  useTrialEntries: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/services/AuditService', () => ({ auditService: { log: vi.fn() } }));

/**
 * Mounted at the page's REAL path. The show id has to come from the route for
 * the gate to have a show to scope against — `/secretary/entries` has none, and
 * the gate deliberately declines to answer without one.
 */

/** The page's OTHER arrival: a bare `/secretary/entries`, no show in the URL. */
function renderWithoutShowId() {
  return render(
    <Routes>
      <Route path="/secretary/entries" element={<EntryManagementPage />} />
    </Routes>,
    { initialRoute: '/secretary/entries' }
  );
}

describe('EntryManagementPage at /secretary/entries, where the URL names no show', () => {
  beforeEach(() => {
    auth.roles = ['secretary'];
  });

  it('leaves "Add entry for someone else" live for a real trial secretary', async () => {
    const user = userEvent.setup();

    renderWithoutShowId();
    await user.click(screen.getByRole('button', { name: /add entry/i }));

    expect(
      await screen.findByRole('button', { name: /add entry for someone else/i })
    ).toBeEnabled();
    expect(screen.queryByText('Trial secretary access only')).toBeNull();
    // ...and never the "still asking" caption either: with no show to ask about,
    // the role IS the answer, so there is nothing in flight.
    expect(screen.queryByText(/checking your access/i)).toBeNull();
  });

  it('leaves it live for a site admin', async () => {
    const user = userEvent.setup();
    auth.roles = ['site_admin'];

    renderWithoutShowId();
    await user.click(screen.getByRole('button', { name: /add entry/i }));

    expect(
      await screen.findByRole('button', { name: /add entry for someone else/i })
    ).toBeEnabled();
  });

  it('still greys it for a club admin, who is not an operator anywhere', async () => {
    const user = userEvent.setup();
    auth.roles = ['club_admin'];

    renderWithoutShowId();
    await user.click(screen.getByRole('button', { name: /add entry/i }));

    expect(
      await screen.findByRole('button', { name: /add entry for someone else/i })
    ).toBeDisabled();
    expect(screen.getByText('Trial secretary access only')).toBeInTheDocument();
  });
});
