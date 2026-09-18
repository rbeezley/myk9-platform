import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  createRoutesFromChildren,
  matchRoutes,
  MemoryRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LegacySecretaryShowRedirect } from '@/routes/showRouteRedirects';
import { PublicRoutes } from '@/routes/publicRoutes';
import {
  SHOW_MANAGEMENT_SECTIONS,
  type ShowManagementSectionPath,
} from '@/routes/showManagementSections';
import { ScopeType, UserRole } from '@/types/auth-types';

// ── Hoisted control objects ────────────────────────────────────────────────
/**
 * Both module-scope mutable fixtures, and the ONE reset that restores them.
 *
 * This file had NO `beforeEach` and no `afterEach` at all: eight tests wrote
 * `hasRole`, `userWithRoles`, `user`, `mockShows.data` and `mockShows.isLoading`
 * and left them for whatever ran next, while the suites that read the defaults
 * (`canonical show route redirects`, `notification routes`) set nothing. CI runs
 * vitest with `--sequence.shuffle`, which shuffles the tests inside a file as
 * well as the files, so the order was never fixed.
 *
 * It was latent rather than live — the tests reading the defaults do not route
 * through `ShowManagementSectionRoute`, so nothing had a victim yet — but it is
 * the identical shape that reddened `main` in the sibling
 * `showSectionRedirects.test.tsx` (MYK9-666), one directory over, and one new
 * test here that DOES route through that guard is all it would take.
 *
 * Worse, `mockAuth.user = null` was undone by the LAST LINE of its own test
 * body, after two assertions that can throw. Either one failing left
 * `user === null` for every test after it, and `ProtectedRoute` redirects on
 * `!user` — so one real failure cascaded into a file-wide red whose top failure
 * named something unrelated. That restore is gone; the hook owns it now.
 *
 * The defaults are a FACTORY and the reset is `Object.assign` over it, so a
 * field added to either fixture is reset by construction rather than by
 * remembering. A hand-maintained field list is exactly what drifted in the
 * sibling file.
 */
const fixtures = vi.hoisted(() => {
  const authDefaults = (): {
    user: object | null;
    loading: boolean;
    rbacLoading: boolean;
    hasRole: (role: string) => boolean;
    userWithRoles: object | null;
  } => ({
    user: { id: 'user-1' },
    loading: false,
    rbacLoading: false,
    hasRole: (_role: string) => false,
    userWithRoles: null,
  });

  const showsDefaults = (): {
    data: { id: string; clubId: string }[];
    isLoading: boolean;
  } => ({
    data: [],
    isLoading: false,
  });

  const mockAuth = authDefaults();
  const mockShows = showsDefaults();

  return {
    mockAuth,
    mockShows,
    reset: (): void => {
      Object.assign(mockAuth, authDefaults());
      Object.assign(mockShows, showsDefaults());
    },
  };
});

const { mockAuth, mockShows } = fixtures;

beforeEach(fixtures.reset);

// ── Module mocks ───────────────────────────────────────────────────────────
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => mockAuth,
}));

vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useShowsQuery: () => mockShows,
  useShowQuery: (id?: string) => ({
    data: mockShows.data.find(show => show.id === id) ?? null,
    isLoading: mockShows.isLoading,
    isError: false,
    isPlaceholderData: false,
  }),
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
vi.mock('@/pages/secretary/ShowResultsSection', () => ({
  default: () => <div data-testid="production-results">Results</div>,
}));
vi.mock('@/pages/AccountPage', () => ({
  default: () => <div data-testid="production-account-page">Account</div>,
}));

// ── Helpers ────────────────────────────────────────────────────────────────

const PRODUCTION_SECTION_TEST_IDS: Record<ShowManagementSectionPath, string> = {
  setup: 'production-setup',
  entries: 'production-entry-management',
  'show-day': 'production-show-desk',
  results: 'production-results',
  reports: 'production-reports',
};

const HARNESS_SECTION_TEST_IDS: Record<ShowManagementSectionPath, string> = {
  setup: 'setup-section',
  entries: 'entries-section',
  'show-day': 'show-day-section',
  results: 'results-section',
  reports: 'reports-section',
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
        <Route path="entries" element={<div data-testid="entries-section">Entries</div>} />
        <Route path="show-day" element={<div data-testid="show-day-section">Show Day</div>} />
        <Route path="results" element={<div data-testid="results-section">Results</div>} />
        <Route path="reports" element={<div data-testid="reports-section">Reports</div>} />
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

  it('redirects the legacy show-desk phase query to the Show Day tab', async () => {
    // `?phase=show-desk` is still honoured as a query; it lands directly on the
    // tab that absorbed Show Desk rather than hopping through the legacy path
    // (MYK9-630 phase 2).
    renderRedirect('/secretary/shows/show-1?phase=show-desk&from=email');
    expect(await screen.findByTestId('location')).toHaveTextContent(
      '/shows/show-1/show-day?from=email'
    );
  });

  it('redirects a legacy secretary show subroute to the matching canonical subroute', async () => {
    renderRedirect('/secretary/shows/show-1/show-day', 'show-day');
    expect(await screen.findByTestId('location')).toHaveTextContent('/shows/show-1/show-day');
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

describe('notification routes', () => {
  it('does not mount a second notifications page behind the Message Center bell', () => {
    expect(matchRoutes(createRoutesFromChildren(PublicRoutes()), '/notifications')).toBeNull();
  });
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
        scopes: [{ scopeType: ScopeType.CLUB, scopeId: 'club-a', roleId: UserRole.SECRETARY }],
      };
      mockShows.data = [{ id: 'show-1', clubId: 'club-a' }];
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
      <MemoryRouter initialEntries={['/shows/show-1/show-day']}>
        <Routes>{PublicRoutes()}</Routes>
      </MemoryRouter>
    );

    expect(await screen.findByTestId('production-show-details-location')).toHaveTextContent(
      '/shows/show-1'
    );
    expect(screen.queryByTestId('production-show-desk')).not.toBeInTheDocument();
    // No manual restore: `beforeEach(fixtures.reset)` owns it. Restoring on the
    // last line meant either assertion above throwing left `user === null` for
    // every test after this one.
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
      <MemoryRouter initialEntries={['/shows/show-1/show-day']}>
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

  it('redirects a secretary scoped to a different club', async () => {
    mockAuth.hasRole = (role: string) => role === UserRole.SECRETARY;
    mockAuth.userWithRoles = {
      scopes: [{ scopeType: ScopeType.CLUB, scopeId: 'club-b', roleId: UserRole.SECRETARY }],
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
