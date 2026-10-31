import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { usePageEditTargetStore } from '@/features/actions/pageEditTarget';
import { Route, Routes } from 'react-router-dom';
import EntryManagementPage from '../EntryManagementPage';
import { TRIAL_SECRETARY_ONLY_REASON } from '@/features/actions/trialSecretaryAccess';

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
const exportCsv = vi.hoisted(() => vi.fn());

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

vi.mock('@/hooks/useMoveUpRequestsCount', () => ({
  useMoveUpRequestsCount: () => ({ count: 0, isLoading: false }),
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
    handleExportCSV: exportCsv,
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
vi.mock('@/services/database/day-of-operations', () => ({
  getClassesWithCapacity: vi.fn(async () => ({ data: [{ available_spots: 2 }], error: null })),
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

/** The rows Entry Forms hands the header Actions menu (`useEntryManagementHeaderActions`). */
const registeredTool = (id: string) =>
  usePageEditTargetStore.getState().showTools?.tools.find(tool => tool.id === id);

describe('EntryManagementPage derives its gate from the one manage scope', () => {
  beforeEach(() => {
    exportCsv.mockClear();
    usePageEditTargetStore.setState({ showTools: null, showToolsOwner: null, exports: [] });
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
    expect(screen.getByRole('heading', { name: 'Entry Forms' })).toBeInTheDocument();
  });

  // MYK9-1594: the page has no Add Entry button or More menu; the header Actions menu is the one
  // door (its Add entry gating is pinned in features/actions/__tests__/addEntryAction.test.ts).
  it('draws no Add Entry button or More menu of its own', () => {
    renderAtShow();

    expect(screen.queryByRole('button', { name: /add entry/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^more$/i })).toBeNull();
  });

  it('greys the late-entry row in the header menu for a club admin, with the reason', () => {
    manageScopeState.value = {
      status: 'resolved',
      canManage: true,
      canOperate: false,
      hasOperationalStaffRole: false,
      clubId: 'club-1',
    };

    renderAtShow();

    expect(registeredTool('late-entry')).toMatchObject({
      title: 'Add late entry',
      disabledReason: TRIAL_SECRETARY_ONLY_REASON,
    });
  });

  it('keeps the late-entry row live for a trial secretary, going to the secretary flow', () => {
    renderAtShow();

    const lateEntry = registeredTool('late-entry');
    expect(lateEntry?.href).toBe('/secretary/register/show-1?source=show-desk&entryMode=late');
    expect(lateEntry?.disabledReason).toBeUndefined();
    expect(registeredTool('people-at-show')?.href).toBe('/shows/show-1?tool=people-at-show');
  });

  it('offers Export CSV to the header while the form list is showing, running the page export', () => {
    renderAtShow();

    const exported = usePageEditTargetStore.getState().exports.find(item => item.id === 'entries');
    expect(exported).toBeDefined();
    exported?.run();
    expect(exportCsv).toHaveBeenCalledTimes(1);
  });

  it('keeps Export CSV (the full file) on an entry list too, as the old toolbar did', () => {
    render(
      <Routes>
        <Route path="/shows/:id/entries" element={<EntryManagementPage />} />
      </Routes>,
      { initialRoute: '/shows/show-1/entries?tab=exceptions&exception=pulls' }
    );

    expect(usePageEditTargetStore.getState().exports.some(item => item.id === 'entries')).toBe(
      true
    );
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
    // Nothing is offered to the header until ownership resolves: an item that appears late is
    // honest, one shown and then withdrawn is not.
    expect(registeredTool('late-entry')).toBeUndefined();
  });
});
