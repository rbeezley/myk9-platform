import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/utils/testUtils';
import { Route, Routes } from 'react-router-dom';
import EntryManagementPage from '../EntryManagementPage';

/**
 * REV-2341 lens P, P4. This page carried its own gate —
 * `!hasRole(SECRETARY) && !hasRole(CLUB_ADMIN) && !hasRole(SITE_ADMIN)` — a
 * GLOBAL role list, while its only mount (`ShowManagementSectionRoute`) asked
 * the club-scoped question. Broader, so it never leaked, but a second copy that
 * goes stale silently. It now derives from the same `useShowManageScope`.
 *
 * The cross-club case is the one that tells the two apart: a club admin of
 * ANOTHER club passes the old role list (they hold `club_admin` globally) and
 * fails the scoped gate. Flipping the gate back to the role list reds the first
 * test here and nothing else.
 */
const manageScopeState = vi.hoisted<{
  value: {
    status: 'resolved' | 'resolving' | 'unavailable';
    canManage: boolean;
    canOperate: boolean;
    hasOperationalStaffRole: boolean;
    clubId: string | undefined;
  };
}>(() => ({
  value: {
    status: 'resolved',
    canManage: true,
    canOperate: true,
    hasOperationalStaffRole: true,
    clubId: 'club-1',
  },
}));

vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => manageScopeState.value,
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
function renderAtShow() {
  return render(
    <Routes>
      <Route path="/shows/:id/entries" element={<EntryManagementPage />} />
    </Routes>,
    { initialRoute: '/shows/show-1/entries' }
  );
}

describe('EntryManagementPage derives its gate from the one manage scope', () => {
  beforeEach(() => {
    manageScopeState.value = {
      status: 'resolved',
      canManage: true,
      canOperate: true,
      hasOperationalStaffRole: true,
      clubId: 'club-1',
    };
  });

  it('refuses a viewer the scoped gate denies, even though they hold a staff role globally', () => {
    manageScopeState.value = {
      status: 'resolved',
      canManage: false,
      canOperate: false,
      hasOperationalStaffRole: false,
      clubId: 'club-1',
    };

    renderAtShow();

    expect(screen.getByRole('heading', { name: /access restricted/i })).toBeInTheDocument();
  });

  it('admits a club admin of THIS show — canManage without canOperate', () => {
    manageScopeState.value = {
      status: 'resolved',
      canManage: true,
      canOperate: false,
      hasOperationalStaffRole: false,
      clubId: 'club-1',
    };

    renderAtShow();

    expect(screen.queryByRole('heading', { name: /access restricted/i })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Entry Management' })).toBeInTheDocument();
  });

  // REV-2341 R-4. The round-1 commit claimed "Entry Management carried the same
  // ungated mail-in button and is fixed with it" and had NO test for it: the
  // mutation `trialSecretaryOnlyReason -> undefined` left this whole file green.
  // These two open the popover the button actually lives in.
  it('greys "Add entry for someone else" for a club admin, with the reason', async () => {
    const user = userEvent.setup();
    manageScopeState.value = {
      status: 'resolved',
      canManage: true,
      canOperate: false,
      hasOperationalStaffRole: false,
      clubId: 'club-1',
    };

    renderAtShow();
    await user.click(screen.getByRole('button', { name: /add entry/i }));

    expect(
      await screen.findByRole('button', { name: /add entry for someone else/i })
    ).toBeDisabled();
    expect(screen.getByText('Trial secretary access only')).toBeInTheDocument();
    // The exhibitor wizard carries no role requirement, so this one stays live.
    expect(screen.getByRole('button', { name: /add entry for my dog/i })).toBeEnabled();
  });

  it('leaves "Add entry for someone else" live for a trial secretary — positive control', async () => {
    const user = userEvent.setup();

    renderAtShow();
    await user.click(screen.getByRole('button', { name: /add entry/i }));

    expect(
      await screen.findByRole('button', { name: /add entry for someone else/i })
    ).toBeEnabled();
    expect(screen.queryByText('Trial secretary access only')).toBeNull();
  });

  it('never flashes a denial while ownership is still resolving', () => {
    manageScopeState.value = {
      status: 'resolving',
      canManage: false,
      canOperate: false,
      hasOperationalStaffRole: true,
      clubId: undefined,
    };

    renderAtShow();

    expect(screen.queryByRole('heading', { name: /access restricted/i })).toBeNull();
  });
});
