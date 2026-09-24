import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShowManagementShell, type ShowManagementShellProps } from '../ShowManagementShell';
import type { ShowDetailTabsProps } from '../ShowDetailTabs';
import { buildShowManagementTabDefs } from '@/pages/ShowDetailsPage.tabDefs';
import type { Show } from '@/types/show-types';
import { generatedPremium } from '@/features/premium/__tests__/fixtures/generatedPremium';

const saveHarness = vi.hoisted(() => ({
  updateShow: vi.fn(),
  runPublish: vi.fn(),
  persistJudges: vi.fn(),
  payload: undefined as Record<string, unknown> | undefined,
}));

vi.mock('@/features/premium/premiumPublishCoordinator', () => ({
  premiumPublishDraftKey: () => 'draft-key',
  runPremiumPublishOperation: saveHarness.runPublish,
}));
vi.mock('@/services/database/judges', () => ({
  persistShowJudgeAssignments: saveHarness.persistJudges,
}));

const manageScope = vi.hoisted(() => ({
  status: 'resolved' as 'resolved' | 'resolving' | 'unavailable',
  canManage: true,
}));

// Shell primitives mocked to passthroughs; presence/status/premium mocked to
// testids so we can assert the shell RENDERS them (the silent-provider-loss
// guard: presence UI must not be dropped by the extraction).
vi.mock('@/components/common/PageShell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/common/PageHeader', () => ({
  PageHeader: ({ actions }: { actions?: React.ReactNode }) => (
    <div data-testid="page-header-actions">{actions}</div>
  ),
}));
vi.mock('@/components/common/DetailHero', () => ({
  DetailHero: ({
    headerActions,
    primaryAction,
  }: {
    headerActions?: React.ReactNode;
    primaryAction?: { label: string; onClick: () => void };
  }) => (
    <div data-testid="detail-hero">
      <div data-testid="detail-hero-header-actions">{headerActions}</div>
      {primaryAction && (
        <div data-testid="detail-hero-side-actions">
          <button type="button" onClick={primaryAction.onClick}>
            {primaryAction.label}
          </button>
        </div>
      )}
    </div>
  ),
}));
vi.mock('@/components/shows/ShowDateBlock', () => ({ ShowDateBlock: () => null }));
vi.mock('@/components/shows/overview/QuickInfoCards', () => ({ QuickInfoCards: () => null }));
vi.mock('@/components/shows/ArmbandLookup', () => ({
  ArmbandLookup: ({ showId }: { showId: string }) => (
    <div data-testid="armband-lookup">Armband lookup for {showId}</div>
  ),
}));
vi.mock('@/components/shows/ShowStatusPill', () => ({
  ShowStatusPill: ({ clubId }: { clubId?: string }) => (
    <div data-testid="status-pill" data-club-id={clubId} />
  ),
}));
vi.mock('@/features/show-presence/ShowPresenceStack', () => ({
  ShowPresenceStack: () => <div data-testid="presence-stack" />,
}));
vi.mock('@/features/show-live-sync/LiveUpdateIndicator', () => ({
  LiveUpdateIndicator: () => <div data-testid="live-indicator" />,
}));
vi.mock('@/features/premium/PremiumDownloadCard', () => ({
  PremiumDownloadCard: ({ canManageShow }: { canManageShow: boolean }) => (
    <div data-testid="premium-download-card" data-can-manage={String(canManageShow)} />
  ),
}));
vi.mock('@/features/premium/LandingPageCard', () => ({
  LandingPageCard: () => <div data-testid="landing-page-card" />,
}));
vi.mock('../ShowDeskCompactContext', () => ({
  ShowDeskCompactContext: ({ canManageShow }: { canManageShow: boolean }) => (
    <div data-testid="show-desk-compact-context" data-can-manage={String(canManageShow)} />
  ),
}));
vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({
    status: manageScope.status,
    canManage: manageScope.canManage,
    canOperate: manageScope.canManage,
    hasOperationalStaffRole: true,
    clubId: 'club-1',
  }),
}));
vi.mock('@/components/panels/edit/ShowEditPanel', () => ({
  ShowEditPanel: ({
    open,
    onClose,
    onRequestDelete,
    onSave,
  }: {
    open: boolean;
    onClose: () => void;
    onRequestDelete?: () => void;
    onSave?: (data: Record<string, unknown>) => Promise<void>;
  }) =>
    open ? (
      <div data-testid="edit-panel-open">
        <button type="button" data-testid="edit-panel-close" onClick={onClose}>
          Close
        </button>
        <button
          type="button"
          data-testid="edit-panel-save"
          onClick={() => {
            void onSave?.(saveHarness.payload ?? {}).catch(() => undefined);
          }}
        >
          Save
        </button>
        {onRequestDelete && (
          <button type="button" data-testid="edit-panel-delete-row" onClick={onRequestDelete}>
            Delete show
          </button>
        )}
      </div>
    ) : null,
}));
vi.mock('@/components/shows/ShowDetails/dialogs/DeleteShowDialog', () => ({ default: () => null }));
vi.mock('@/components/shows/tabs/ShowOverviewTab', () => ({
  ShowOverviewTab: () => <div data-testid="show-overview-tab" />,
}));
vi.mock('@/store/showStore', () => ({
  useShowStore: (selector: (s: { updateShow: typeof saveHarness.updateShow }) => unknown) =>
    selector({ updateShow: saveHarness.updateShow }),
}));

function makeShow(): Show {
  return { id: 'show-1', name: 'Test Show', status: 'Upcoming', clubId: 'club-1' } as Show;
}

function makeTabs(): ShowDetailTabsProps {
  return {
    show: makeShow(),
    tabs: [],
    activeTab: 'overview',
    onTabChange: vi.fn(),
    canManageShow: true,
    canShowMap: false,
    isAuthenticated: true,
    hasUserEntries: false,
    judges: [],
    classes: [],
    trials: [],
    trialStats: {},
    mapTrials: [],
    mapClasses: [],
    mapEntries: [],
  };
}

function shellProps(overrides: Partial<ShowManagementShellProps>): ShowManagementShellProps {
  return {
    show: makeShow(),
    showId: 'show-1',
    breadcrumbs: [],
    armbandCount: 0,
    catalogEntryCount: 0,
    canonicalShowHref: '/shows/show-1',
    activeManagementSection: undefined,
    tabs: makeTabs(),
    sectionTabs: buildShowManagementTabDefs({
      catalogEntryCount: 517,
      managerEntryDataUnavailable: false,
      resultsCount: 2,
    }),
    ...overrides,
  };
}

function renderShell(
  overrides: Partial<ShowManagementShellProps> = {},
  initialRoute = '/shows/show-1',
  extra?: React.ReactNode
) {
  const props = shellProps(overrides);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const renderTree = () => (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialRoute]}>
        {extra}
        <Routes>
          <Route path="/shows/:id" element={<ShowManagementShell {...props} />}>
            <Route index element={<div data-testid="outlet-child">section</div>} />
            <Route path="entries" element={<div data-testid="outlet-child">entries</div>} />
            <Route path="setup" element={<div data-testid="outlet-child">setup</div>} />
            <Route path="show-day" element={<div data-testid="outlet-child">show day</div>} />
            <Route path="results" element={<div data-testid="outlet-child">results</div>} />
            <Route path="reports" element={<div data-testid="outlet-child">reports</div>} />
            <Route
              path="classes/:trialId"
              element={<div data-testid="outlet-child">class management</div>}
            />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(renderTree());
  return { ...view, props, rerenderShell: () => view.rerender(renderTree()) };
}

beforeEach(() => {
  manageScope.status = 'resolved';
  manageScope.canManage = true;
});

/**
 * Navigate WITHIN the mounted router, the way an in-app edit link does.
 * Re-rendering a fresh MemoryRouter would remount the shell and let a mount-time
 * param read pass a test the real app fails.
 */
function LocationProbe() {
  const location = useLocation();
  return <span data-testid="probe-url">{`${location.pathname}${location.search}`}</span>;
}

function InPageNavigator({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" data-testid="in-page-nav" onClick={() => navigate(to)}>
      go
    </button>
  );
}

describe('ShowManagementShell', () => {
  it('mounts the presence UI (guards against silent provider/child loss)', () => {
    renderShell();
    expect(screen.getByTestId('presence-stack')).toBeInTheDocument();
    expect(screen.getByTestId('live-indicator')).toBeInTheDocument();
    expect(screen.getByTestId('status-pill')).toBeInTheDocument();
  });

  it('shows Edit in the side action slot for managers and opens the existing edit panel', () => {
    renderShell();

    const headerActions = screen.getByTestId('detail-hero-header-actions');
    expect(headerActions).not.toHaveTextContent('Edit');

    const sideActions = screen.getByTestId('detail-hero-side-actions');
    const editButton = within(sideActions).getByRole('button', { name: 'Edit' });
    expect(editButton).toBeInTheDocument();
    fireEvent.click(editButton);

    expect(screen.getByTestId('edit-panel-open')).toBeInTheDocument();
  });

  it('gives the status control the host club required for publishing', () => {
    renderShell();
    expect(screen.getByTestId('status-pill')).toHaveAttribute('data-club-id', 'club-1');
  });

  it('renders exactly six tabs, in the decided order', () => {
    renderShell();
    expect(
      screen.getAllByRole('tab').map(tab => tab.textContent?.replace(/\d+$/, '').trim())
    ).toEqual(['Overview', 'Setup', 'Entries', 'Show Day', 'Results', 'Reports']);
  });

  it('carries NO standalone page links above the tabs — the tabs are the only row', () => {
    // MYK9-630 phase 2: the five-link row (Show Desk, Entry Management,
    // Reports, Results, Submit Results) and the narrow <select> that mirrored
    // it are deleted, because every one of those pages IS a tab now. This is
    // the "difficult to tell if they are tabs or links or buttons" complaint.
    renderShell();
    expect(screen.queryByTestId('canonical-show-management-nav')).toBeNull();
    expect(screen.queryByRole('combobox', { name: /show management section/i })).toBeNull();
    for (const label of ['Show Desk', 'Entry Management', 'Reports', 'Results', 'Submit Results']) {
      expect(screen.queryByRole('link', { name: label })).toBeNull();
    }
  });

  it("navigates to a tab's own page when that tab is selected", () => {
    renderShell({}, '/shows/show-1', <LocationProbe />);
    fireEvent.click(screen.getByRole('tab', { name: /^Show Day/ }));
    expect(screen.getByTestId('probe-url')).toHaveTextContent('/shows/show-1/show-day');
  });

  it('keeps Setup lit on Class Management, which is reached from it', () => {
    renderShell({ activeManagementSection: 'classes' }, '/shows/show-1/classes/trial-1');
    expect(screen.getByRole('tab', { name: /^Setup/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('badges Entries with the show entry count the page already read', () => {
    renderShell();
    expect(screen.getByRole('tab', { name: /^Entries/ }).textContent).toContain('517');
  });

  it('renders the staff armband lookup only when armbands exist', () => {
    renderShell({ armbandCount: 3 });
    expect(screen.getByTestId('armband-lookup')).toHaveTextContent('Armband lookup for show-1');
  });

  it('omits the staff armband lookup before armbands exist', () => {
    renderShell({ armbandCount: 0 });
    expect(screen.queryByTestId('armband-lookup')).toBeNull();
  });

  it('renders the publish row anchor with the premium cards on Overview', () => {
    renderShell();
    const anchor = document.getElementById('setup-publish');
    expect(anchor).toBeInTheDocument();
    expect(screen.getByTestId('premium-download-card')).toBeInTheDocument();
    expect(screen.getByTestId('landing-page-card')).toBeInTheDocument();
  });

  it('structurally unmounts management UI until the management scope resolves', () => {
    manageScope.status = 'resolving';
    manageScope.canManage = false;

    renderShell();

    expect(screen.getByRole('status', { name: /loading content/i })).toBeInTheDocument();
    expect(screen.queryByTestId('premium-download-card')).toBeNull();
    expect(screen.queryByTestId('detail-hero')).toBeNull();
  });

  it('surfaces a retryable degraded state when management scope is unavailable', () => {
    manageScope.status = 'unavailable';
    manageScope.canManage = false;

    renderShell();

    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't verify show access.");
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByTestId('premium-download-card')).toBeNull();
    expect(screen.queryByTestId('detail-hero')).toBeNull();
  });

  it('structurally unmounts Show Desk management UI in the unresolved window', () => {
    manageScope.status = 'resolving';
    manageScope.canManage = false;

    renderShell({ activeManagementSection: 'show-day' }, '/shows/show-1/show-day');

    expect(screen.queryByTestId('show-desk-compact-context')).toBeNull();
    expect(screen.queryByTestId('detail-hero')).toBeNull();
  });

  it('does not flash cached management content across scope transitions', () => {
    const view = renderShell();

    manageScope.status = 'resolving';
    view.rerenderShell();
    expect(screen.getByRole('status', { name: /loading content/i })).toBeInTheDocument();
    expect(screen.queryByTestId('premium-download-card')).toBeNull();

    manageScope.status = 'resolved';
    manageScope.canManage = false;
    view.rerenderShell();
    expect(screen.queryByTestId('premium-download-card')).toBeNull();

    manageScope.canManage = true;
    view.rerenderShell();
    expect(screen.getByTestId('premium-download-card')).toHaveAttribute('data-can-manage', 'true');
  });

  it.each(['reports', 'results', 'entries', 'setup'] as const)(
    'keeps the publish row OFF the %s section (Overview only, decision 2)',
    section => {
      renderShell({ activeManagementSection: section }, `/shows/show-1/${section}`);
      expect(document.getElementById('setup-publish')).toBeNull();
      expect(screen.queryByTestId('premium-download-card')).toBeNull();
      expect(screen.queryByTestId('landing-page-card')).toBeNull();
    }
  );

  it('uses compact operational chrome on Show Day without the hero or routine publish cards', () => {
    renderShell({ activeManagementSection: 'show-day' }, '/shows/show-1/show-day');

    expect(screen.getByTestId('show-desk-compact-context')).toBeInTheDocument();
    expect(screen.queryByTestId('detail-hero')).not.toBeInTheDocument();
    expect(screen.queryByTestId('premium-download-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('landing-page-card')).not.toBeInTheDocument();
  });

  it('renders Overview itself at /shows/:id — Overview is a tab, not a redirect', () => {
    renderShell();
    expect(screen.getByTestId('show-overview-tab')).toBeInTheDocument();
  });

  it('renders the tab page in the Outlet on every other tab', () => {
    renderShell({ activeManagementSection: 'entries' }, '/shows/show-1/entries');
    expect(screen.getByTestId('outlet-child')).toBeInTheDocument();
    expect(screen.queryByTestId('show-overview-tab')).toBeNull();
  });

  it('no longer carries its own overflow menu', () => {
    // MYK9-630: the `...` menu is deleted. Its five items moved -- Show Details
    // to the header Actions menu, Copy link and Preview to the Overview landing
    // card, Delete into the Show Edit panel, and editing remains on this page.
    renderShell();
    expect(screen.queryByRole('button', { name: /more show actions/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /preview as exhibitor/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /^delete$/i })).toBeNull();
  });

  it('opens the edit panel when the header Actions link lands with ?edit=true', () => {
    // An in-app edit link can target the page the secretary is already on, so
    // the shell never remounts and a mount-time read of the param cannot see it.
    renderShell({}, '/shows/show-1', <InPageNavigator to="/shows/show-1?edit=true" />);
    expect(screen.queryByTestId('edit-panel-open')).toBeNull();
    fireEvent.click(screen.getByTestId('in-page-nav'));
    expect(screen.getByTestId('edit-panel-open')).toBeInTheDocument();
  });

  it('opens the edit panel ON the section the secretary is working in, and leaves them there', () => {
    // The edit link is search-only and the shell strips the param, so the URL
    // is unchanged either side of opening and closing the panel.
    renderShell(
      { activeManagementSection: 'entries' },
      '/shows/show-1/entries',
      <>
        <InPageNavigator to="?edit=true" />
        <LocationProbe />
      </>
    );

    expect(screen.getByTestId('probe-url')).toHaveTextContent('/shows/show-1/entries');
    fireEvent.click(screen.getByTestId('in-page-nav'));
    expect(screen.getByTestId('edit-panel-open')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('edit-panel-close'));
    expect(screen.queryByTestId('edit-panel-open')).toBeNull();
    expect(screen.getByTestId('probe-url').textContent).toBe('/shows/show-1/entries');
  });

  it('hands the edit panel the delete row, the only home Delete show has left', () => {
    // Delete left the `...` menu and lives at the bottom of the edit panel now,
    // so the panel MUST be given a trigger or the verb has no home at all.
    renderShell({}, '/shows/show-1', <InPageNavigator to="/shows/show-1?edit=true" />);
    fireEvent.click(screen.getByTestId('in-page-nav'));
    expect(screen.getByTestId('edit-panel-delete-row')).toBeInTheDocument();
  });

  it('still honours a cold ?edit=true deep link', () => {
    // The in-page case above must not cost the original one. Both read the same
    // router params now, which is also why this is assertable at all -- seeded
    // from `window.location.search`, it would only measure the runner's own URL.
    renderShell({}, '/shows/show-1?edit=true');
    expect(screen.getByTestId('edit-panel-open')).toBeInTheDocument();
  });
});

describe('Save & Publish keeps the show edits when publication cannot start', () => {
  it('persists the form changes even when the publish reservation fails', async () => {
    saveHarness.updateShow.mockReset().mockResolvedValue({ ...makeShow(), name: 'Renamed Show' });
    saveHarness.persistJudges.mockReset().mockResolvedValue(undefined);
    // Reservation fails (e.g. the RPC is not deployed yet), so the operation
    // rejects before it would ever call createPremium.
    saveHarness.runPublish.mockReset().mockRejectedValue(new Error('function not found'));
    saveHarness.payload = {
      name: 'Renamed Show',
      assignedJudges: [],
      publishExperience: true,
      generatedPremium: generatedPremium(),
    };

    renderShell({}, '/shows/show-1?edit=true');
    fireEvent.click(await screen.findByTestId('edit-panel-save'));

    await waitFor(() =>
      expect(saveHarness.updateShow).toHaveBeenCalledWith(
        'show-1',
        expect.objectContaining({ name: 'Renamed Show' })
      )
    );
    // Publication did not complete, so the panel stays open with its error.
    expect(saveHarness.runPublish).toHaveBeenCalled();
    expect(screen.getByTestId('edit-panel-open')).toBeInTheDocument();
  });
});
