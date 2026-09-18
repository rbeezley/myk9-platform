import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShowManagementShell, type ShowManagementShellProps } from '../ShowManagementShell';
import type { ShowDetailTabsProps } from '../ShowDetailTabs';
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
vi.mock('../ShowDetailTabs', () => ({
  ShowDetailTabs: () => <div data-testid="show-detail-tabs" />,
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
    isManagementSection: false,
    tabs: makeTabs(),
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
            <Route
              path="entry-management"
              element={<div data-testid="outlet-child">entries</div>}
            />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return props;
}

/**
 * Navigate WITHIN the mounted router, the way the header Actions "Show settings"
 * link does. Re-rendering a fresh MemoryRouter would remount the shell and let a
 * mount-time param read pass a test the real app fails.
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

  it('renders the management section nav without Setup as a peer workflow', () => {
    renderShell();
    const nav = screen.getByTestId('canonical-show-management-nav');
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /show management section/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Setup' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Show Desk' })).toHaveAttribute(
      'href',
      '/shows/show-1/show-desk'
    );
  });

  it('labels class management routes in the narrow section selector', () => {
    renderShell({ activeManagementSection: 'classes', isManagementSection: true });
    const selector = screen.getByRole('combobox', { name: /show management section/i });
    expect(selector).toHaveValue('classes');
    expect(screen.getByRole('option', { name: 'Class Management' })).toBeDisabled();
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

  it.each(['reports', 'results-control', 'submit-results', 'entry-management'] as const)(
    'keeps the publish row OFF the %s section (Overview only, decision 2)',
    section => {
      renderShell({ activeManagementSection: section, isManagementSection: true });
      expect(document.getElementById('setup-publish')).toBeNull();
      expect(screen.queryByTestId('premium-download-card')).toBeNull();
      expect(screen.queryByTestId('landing-page-card')).toBeNull();
    }
  );

  it('uses compact operational chrome on Show Desk without the hero or routine publish cards', () => {
    renderShell({ activeManagementSection: 'show-desk', isManagementSection: true });

    expect(screen.getByTestId('show-desk-compact-context')).toBeInTheDocument();
    expect(screen.queryByTestId('detail-hero')).not.toBeInTheDocument();
    expect(screen.queryByTestId('premium-download-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('landing-page-card')).not.toBeInTheDocument();
  });

  it('renders the shared tabs when not on a management section', () => {
    renderShell({ isManagementSection: false });
    expect(screen.getByTestId('show-detail-tabs')).toBeInTheDocument();
    expect(screen.queryByTestId('outlet-child')).toBeNull();
  });

  it('renders the section Outlet (not the tabs) when on a management section', () => {
    renderShell({ isManagementSection: true });
    expect(screen.getByTestId('outlet-child')).toBeInTheDocument();
    expect(screen.queryByTestId('show-detail-tabs')).toBeNull();
  });

  it('no longer carries its own overflow menu', () => {
    // MYK9-630: the `...` menu is deleted. Its five items moved -- Show settings
    // to the header Actions menu, Copy link and Preview to the Overview landing
    // card, Delete into the Show Edit panel, and Edit is Show settings.
    renderShell();
    expect(screen.queryByRole('button', { name: /more show actions/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /preview as exhibitor/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /^delete$/i })).toBeNull();
  });

  it('opens the edit panel when the header Actions link lands with ?edit=true', () => {
    // The Actions item is a LINK to the page the secretary is already on, so the
    // shell never remounts and a mount-time read of the param cannot see it.
    renderShell({}, '/shows/show-1', <InPageNavigator to="/shows/show-1?edit=true" />);
    expect(screen.queryByTestId('edit-panel-open')).toBeNull();
    fireEvent.click(screen.getByTestId('in-page-nav'));
    expect(screen.getByTestId('edit-panel-open')).toBeInTheDocument();
  });

  it('opens settings ON the section the secretary is working in, and leaves them there', () => {
    // Round-3 review: the Actions item used to be an ABSOLUTE
    // `/shows/:id?edit=true`, so from Entry Management it walked the secretary
    // to Overview and closing the panel stranded them there. Search-only now,
    // and the shell strips the param, so the URL is unchanged either side.
    renderShell(
      { activeManagementSection: 'entry-management', isManagementSection: true },
      '/shows/show-1/entry-management',
      <>
        <InPageNavigator to="?edit=true" />
        <LocationProbe />
      </>
    );

    expect(screen.getByTestId('probe-url')).toHaveTextContent('/shows/show-1/entry-management');
    fireEvent.click(screen.getByTestId('in-page-nav'));
    expect(screen.getByTestId('edit-panel-open')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('edit-panel-close'));
    expect(screen.queryByTestId('edit-panel-open')).toBeNull();
    expect(screen.getByTestId('probe-url').textContent).toBe('/shows/show-1/entry-management');
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
