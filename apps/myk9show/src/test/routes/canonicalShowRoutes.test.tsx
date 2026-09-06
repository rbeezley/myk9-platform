import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LegacySecretaryShowRedirect } from '@/routes/showRouteRedirects';
import { PublicRoutes } from '@/routes/publicRoutes';
import {
  SHOW_MANAGEMENT_SECTIONS,
  type ShowManagementSectionPath,
} from '@/routes/showManagementSections';
import { ScopeType, UserRole } from '@/types/auth-types';

// ── Hoisted control objects ────────────────────────────────────────────────
const mockAuth = vi.hoisted(() => ({
  user: { id: 'user-1' } as object | null,
  loading: false,
  rbacLoading: false,
  hasRole: (_role: string) => false as boolean,
  userWithRoles: null as object | null,
}));

const mockShows = vi.hoisted(() => ({
  data: [] as { id: string; clubId: string }[],
  isLoading: false,
}));

// ── Module mocks ───────────────────────────────────────────────────────────
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => mockAuth,
}));

vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useShowsQuery: () => mockShows,
}));

vi.mock('@/context/AuthContext', () => ({
  ProtectedRoute: ({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) => (
    // ProtectedRoute is no longer used in ShowManagementSectionRoute, but is
    // still used in other routes (exhibitor gate). Treat as always-pass here
    // since the gate under test is ShowManagementSectionRoute's own logic.
    <>{children ?? fallback}</>
  ),
}));

vi.mock('@/components/common/PageTransition', () => ({
  PageTransition: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/routes/utils/SuspenseWrapper', () => ({
  SuspenseWrapper: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/pages/ShowDetailsPage', async () => {
  const router = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    default: function MockShowDetailsPage() {
      const location = router.useLocation();
      return (
        <div data-testid="production-show-details">
          <div data-testid="production-show-details-location">{location.pathname}</div>
          <router.Outlet />
        </div>
      );
    },
  };
});

vi.mock('@/pages/secretary/ShowWorkbenchShowDeskPage', () => ({
  ShowWorkbenchShowDeskPage: () => <div data-testid="production-show-desk">Show Desk</div>,
}));
vi.mock('@/pages/secretary/ShowWorkbenchSetupPage', () => ({
  ShowWorkbenchSetupPage: () => <div data-testid="production-setup">Setup</div>,
}));
vi.mock('@/pages/secretary/EntryManagementPage', () => ({
  default: () => <div data-testid="production-entry-management">Entry Management</div>,
}));
vi.mock('@/pages/secretary/ReportsPage', () => ({
  default: () => <div data-testid="production-reports">Reports</div>,
}));
vi.mock('@/pages/secretary/ResultsControlPage', () => ({
  default: () => <div data-testid="production-results-control">Results Control</div>,
}));
vi.mock('@/pages/secretary/ResultsSubmissionPage', () => ({
  default: () => <div data-testid="production-submit-results">Submit Results</div>,
}));
vi.mock('@/pages/AccountPage', () => ({
  default: () => <div data-testid="production-account-page">Account</div>,
}));

// ── Helpers ────────────────────────────────────────────────────────────────

const PRODUCTION_SECTION_TEST_IDS: Record<ShowManagementSectionPath, string> = {
  setup: 'production-setup',
  'show-desk': 'production-show-desk',
  'entry-management': 'production-entry-management',
  reports: 'production-reports',
  'results-control': 'production-results-control',
  'submit-results': 'production-submit-results',
};

const HARNESS_SECTION_TEST_IDS: Record<ShowManagementSectionPath, string> = {
  setup: 'setup-section',
  'show-desk': 'show-desk-section',
  'entry-management': 'entries-section',
  reports: 'reports-section',
  'results-control': 'results-control-section',
  'submit-results': 'submit-results-section',
};

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
    </div>
  );
}

function renderRedirect(initialPath: string, subPath?: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/secretary/shows/:showId/*"
          element={<LegacySecretaryShowRedirect subPath={subPath} />}
        />
        <Route path="/shows/:id/*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

function CanonicalShowRouteHarness() {
  return (
    <Routes>
      <Route
        path="/shows/:id"
        element={
          <div data-testid="show-shell">
            <LocationProbe />
            <Outlet />
          </div>
        }
      >
        <Route path="setup" element={<div data-testid="setup-section">Setup</div>} />
        <Route path="show-desk" element={<div data-testid="show-desk-section">Show Desk</div>} />
        <Route path="entry-management" element={<div data-testid="entries-section">Entries</div>} />
        <Route path="reports" element={<div data-testid="reports-section">Reports</div>} />
        <Route
          path="results-control"
          element={<div data-testid="results-control-section">Results Control</div>}
        />
        <Route
          path="submit-results"
          element={<div data-testid="submit-results-section">Submit Results</div>}
        />
      </Route>
    </Routes>
  );
}

function CanonicalAccessProbe({ canManage }: { canManage: boolean }) {
  const location = useLocation();

  if (!canManage) {
    return <Navigate to="/shows/show-1" replace />;
  }

  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
    </div>
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('canonical show route redirects', () => {
  it('redirects the legacy secretary show base route to canonical setup', async () => {
    renderRedirect('/secretary/shows/show-1');
    expect(await screen.findByTestId('location')).toHaveTextContent('/shows/show-1/setup');
  });

  it('redirects the legacy show-desk phase query to canonical Show Desk', async () => {
    renderRedirect('/secretary/shows/show-1?phase=show-desk&from=email');
    expect(await screen.findByTestId('location')).toHaveTextContent(
      '/shows/show-1/show-desk?from=email'
    );
  });

  it('redirects a legacy secretary show subroute to the matching canonical subroute', async () => {
    renderRedirect('/secretary/shows/show-1/show-desk', 'show-desk');
    expect(await screen.findByTestId('location')).toHaveTextContent('/shows/show-1/show-desk');
  });

  it('preserves query strings on legacy secretary show redirects', async () => {
    renderRedirect(
      '/secretary/shows/show-1/reports?report=result-catalog&trialId=trial-7',
      'reports'
    );
    expect(await screen.findByTestId('location')).toHaveTextContent(
      '/shows/show-1/reports?report=result-catalog&trialId=trial-7'
    );
  });
});

describe('canonical account route redirects', () => {
  it.each(['/profile', '/exhibitor/profile'])(
    'redirects %s to the unified account page',
    async path => {
      render(
        <MemoryRouter initialEntries={[path]}>
          <Routes>{PublicRoutes()}</Routes>
        </MemoryRouter>
      );

      expect(await screen.findByTestId('production-account-page')).toBeInTheDocument();
    }
  );
});

describe('canonical show management routes', () => {
  it.each(SHOW_MANAGEMENT_SECTIONS.map(({ path }) => [`/shows/show-1/${path}`, path] as const))(
    'renders %s at the canonical section path',
    async (path, sectionPath) => {
      render(
        <MemoryRouter initialEntries={[path]}>
          <CanonicalShowRouteHarness />
        </MemoryRouter>
      );

      expect(await screen.findByTestId('show-shell')).toBeInTheDocument();
      expect(screen.getByTestId(HARNESS_SECTION_TEST_IDS[sectionPath])).toBeInTheDocument();
    }
  );

  it.each(
    SHOW_MANAGEMENT_SECTIONS.map(
      ({ path }) => [`/shows/show-1/${path}`, PRODUCTION_SECTION_TEST_IDS[path]] as const
    )
  )(
    'secretary renders %s through the production PublicRoutes tree',
    async (path, sectionTestId) => {
      mockAuth.hasRole = (role: string) => role === UserRole.SECRETARY;
      mockAuth.userWithRoles = {
        scopes: [{ scopeType: ScopeType.SHOW, scopeId: 'show-1', roleId: UserRole.SECRETARY }],
      };
      mockShows.data = [{ id: 'show-1', clubId: 'club-1' }];
      mockShows.isLoading = false;

      render(
        <MemoryRouter initialEntries={[path]}>
          <Routes>{PublicRoutes()}</Routes>
        </MemoryRouter>
      );

      expect(await screen.findByTestId('production-show-details')).toBeInTheDocument();
      expect(screen.getByTestId(sectionTestId)).toBeInTheDocument();
    }
  );

  it('redirects an unauthenticated user from management URLs back to show overview', async () => {
    mockAuth.user = null;
    mockAuth.hasRole = () => false;

    render(
      <MemoryRouter initialEntries={['/shows/show-1/show-desk']}>
        <Routes>{PublicRoutes()}</Routes>
      </MemoryRouter>
    );

    expect(await screen.findByTestId('production-show-details-location')).toHaveTextContent(
      '/shows/show-1'
    );
    expect(screen.queryByTestId('production-show-desk')).not.toBeInTheDocument();

    mockAuth.user = { id: 'user-1' };
  });

  it('redirects a non-manager direct management URL back to the canonical overview', async () => {
    render(
      <MemoryRouter initialEntries={['/shows/show-1/show-desk?from=dashboard']}>
        <Routes>
          <Route path="/shows/:id/show-desk" element={<CanonicalAccessProbe canManage={false} />} />
          <Route path="/shows/:id" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByTestId('location')).toHaveTextContent('/shows/show-1');
  });

  it('redirects a user with no management role through the production PublicRoutes tree', async () => {
    mockAuth.hasRole = () => false;
    mockAuth.userWithRoles = null;
    mockShows.data = [{ id: 'show-1', clubId: 'club-a' }];
    mockShows.isLoading = false;

    render(
      <MemoryRouter initialEntries={['/shows/show-1/show-desk']}>
        <Routes>{PublicRoutes()}</Routes>
      </MemoryRouter>
    );

    expect(await screen.findByTestId('production-show-details-location')).toHaveTextContent(
      '/shows/show-1'
    );
    expect(screen.queryByTestId('production-show-desk')).not.toBeInTheDocument();
  });

  it("allows a club admin scoped to the show's club", async () => {
    mockAuth.hasRole = (role: string) => role === UserRole.CLUB_ADMIN;
    mockAuth.userWithRoles = {
      scopes: [{ scopeType: ScopeType.CLUB, scopeId: 'club-a', roleId: UserRole.CLUB_ADMIN }],
    };
    mockShows.data = [{ id: 'show-1', clubId: 'club-a' }];
    mockShows.isLoading = false;

    render(
      <MemoryRouter initialEntries={['/shows/show-1/setup']}>
        <Routes>{PublicRoutes()}</Routes>
      </MemoryRouter>
    );

    expect(await screen.findByTestId('production-show-details')).toBeInTheDocument();
    expect(screen.getByTestId('production-setup')).toBeInTheDocument();
  });

  it('redirects a club admin scoped to a different club', async () => {
    mockAuth.hasRole = (role: string) => role === UserRole.CLUB_ADMIN;
    mockAuth.userWithRoles = {
      // Club admin for club-b, not club-a which owns this show
      scopes: [{ scopeType: ScopeType.CLUB, scopeId: 'club-b', roleId: UserRole.CLUB_ADMIN }],
    };
    mockShows.data = [{ id: 'show-1', clubId: 'club-a' }];
    mockShows.isLoading = false;

    render(
      <MemoryRouter initialEntries={['/shows/show-1/setup']}>
        <Routes>{PublicRoutes()}</Routes>
      </MemoryRouter>
    );

    expect(await screen.findByTestId('production-show-details-location')).toHaveTextContent(
      '/shows/show-1'
    );
    expect(screen.queryByTestId('production-setup')).not.toBeInTheDocument();
  });
});
