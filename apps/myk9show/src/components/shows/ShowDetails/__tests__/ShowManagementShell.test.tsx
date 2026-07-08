import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
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
  ShowStatusPill: () => <div data-testid="status-pill" />,
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
vi.mock('@/components/panels/edit/ShowEditPanel', () => ({
  ShowEditPanel: ({ open }: { open: boolean }) =>
    open ? <div data-testid="edit-panel-open" /> : null,
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
  return { id: 'show-1', name: 'Test Show', status: 'Upcoming' } as Show;
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

function renderShell(overrides: Partial<ShowManagementShellProps> = {}) {
  const props: ShowManagementShellProps = {
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
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/shows/show-1']}>
        <Routes>
          <Route path="/shows/:id" element={<ShowManagementShell {...props} />}>
            <Route index element={<div data-testid="outlet-child">section</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return props;
}

describe('ShowManagementShell', () => {
  it('mounts the presence UI (guards against silent provider/child loss)', () => {
    renderShell();
    expect(screen.getByTestId('presence-stack')).toBeInTheDocument();
    expect(screen.getByTestId('live-indicator')).toBeInTheDocument();
    expect(screen.getByTestId('status-pill')).toBeInTheDocument();
  });

  it('renders the management section nav with the canonical section links', () => {
    renderShell();
    const nav = screen.getByTestId('canonical-show-management-nav');
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /show management section/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Setup' })).toHaveAttribute(
      'href',
      '/shows/show-1/setup'
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

  it('renders the publish row anchor with the premium cards', () => {
    renderShell();
    const anchor = document.getElementById('setup-publish');
    expect(anchor).toBeInTheDocument();
    expect(screen.getByTestId('premium-download-card')).toBeInTheDocument();
    expect(screen.getByTestId('landing-page-card')).toBeInTheDocument();
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

  it('opens the edit panel from the overflow menu', () => {
    renderShell();
    expect(screen.queryByTestId('edit-panel-open')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /more show actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /edit/i }));
    expect(screen.getByTestId('edit-panel-open')).toBeInTheDocument();
  });

  it('offers a public exhibitor preview from the overflow menu', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: /more show actions/i }));
    expect(screen.getByRole('menuitem', { name: /preview as exhibitor/i })).toHaveAttribute(
      'href',
      '/shows/show-1?preview=public'
    );
  });
});
