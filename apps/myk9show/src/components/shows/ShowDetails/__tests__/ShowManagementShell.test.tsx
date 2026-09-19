import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShowManagementShell, type ShowManagementShellProps } from '../ShowManagementShell';
import type { ShowDetailTabsProps } from '../ShowDetailTabs';
import { buildShowManagementTabDefs } from '@/pages/ShowDetailsPage.tabDefs';
import type { Show } from '@/types/show-types';

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
  DetailHero: ({ headerActions }: { headerActions?: React.ReactNode }) => (
    <div data-testid="detail-hero">{headerActions}</div>
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
  PremiumDownloadCard: () => <div data-testid="premium-download-card" />,
}));
vi.mock('@/features/premium/LandingPageCard', () => ({
  LandingPageCard: () => <div data-testid="landing-page-card" />,
}));
vi.mock('../ShowDeskCompactContext', () => ({
  ShowDeskCompactContext: () => <div data-testid="show-desk-compact-context" />,
}));
vi.mock('@/components/panels/edit/ShowEditPanel', () => ({
  ShowEditPanel: ({
    open,
    onClose,
    onRequestDelete,
  }: {
    open: boolean;
    onClose: () => void;
    onRequestDelete?: () => void;
  }) =>
    open ? (
      <div data-testid="edit-panel-open">
        <button type="button" data-testid="edit-panel-close" onClick={onClose}>
          Close
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
  useShowStore: (selector: (s: { updateShow: () => void }) => unknown) =>
    selector({ updateShow: vi.fn() }),
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
  render(
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
  return props;
}

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
