import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicRoutes } from '@/routes/publicRoutes';
import { ScopeType, UserRole } from '@/types/auth-types';

/**
 * Every URL the deleted five-link row emitted, through the PRODUCTION route
 * tree, landing on the tab that absorbed it (MYK9-630 phase 2).
 *
 * This file used to pin the OPPOSITE of one of these cases: phase 1 decision 4
 * made `/shows/:id/setup` redirect to Overview, because Setup had no page of
 * its own. Phase 2 gives it one — Setup is the second of the six tabs and
 * absorbs Trials, Classes and Show Map — so that assertion is superseded by the
 * decision recorded in `docs/plan-secretary-show-actions.md` § Phase 2, not
 * rewritten to make an implementation pass.
 *
 * It renders the real redirect components, which `canonicalShowRoutes.test.tsx`
 * cannot: it mocks the section pages to placeholders to prove they mount. The
 * failure this closes is the one a component test cannot see — each redirect
 * reads `useParams().id`, so it silently bounces to `/shows` if the route's
 * param is renamed or the route stops being nested under `/shows/:id`.
 */
const mockAuth = vi.hoisted(() => ({
  user: { id: 'user-1' } as object | null,
  loading: false,
  rbacLoading: false,
  hasRole: (role: string): boolean => role === UserRole.SECRETARY,
  userWithRoles: {
    scopes: [{ scopeType: 'club', scopeId: 'club-a', roleId: 'secretary' }],
  } as object | null,
}));

const mockShows = vi.hoisted(() => ({
  data: [{ id: 'show-1', clubId: 'club-a' }],
  isLoading: false,
}));

vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => mockAuth }));

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
          <div data-testid="production-show-details-location">
            {location.pathname}
            {location.search}
            {location.hash}
          </div>
          <router.Outlet />
        </div>
      );
    },
  };
});

vi.mock('@/pages/secretary/ShowWorkbenchSetupPage', () => ({
  ShowWorkbenchSetupPage: () => <div data-testid="section-setup" />,
}));
vi.mock('@/pages/secretary/ShowWorkbenchShowDeskPage', () => ({
  ShowWorkbenchShowDeskPage: () => <div data-testid="section-show-day" />,
}));
vi.mock('@/pages/secretary/EntryManagementPage', () => ({
  default: () => <div data-testid="section-entries" />,
}));
vi.mock('@/pages/secretary/ReportsPage', () => ({
  default: () => <div data-testid="section-reports" />,
}));
vi.mock('@/pages/secretary/ShowResultsSection', () => ({
  default: () => <div data-testid="section-results" />,
}));

type RolesFixture = boolean | 'no-club-scope';

function renderAt(path: string, { rolesKnown = true }: { rolesKnown?: RolesFixture } = {}) {
  // `no-club-scope` is the real in-flight shape: AuthContext hands back a
  // non-null `userWithRoles` before the club scopes arrive. `false` is the
  // terminal "RBAC settled with zero roles" shape.
  mockAuth.userWithRoles =
    rolesKnown === true
      ? { scopes: [{ scopeType: ScopeType.CLUB, scopeId: 'club-a', roleId: UserRole.SECRETARY }] }
      : rolesKnown === 'no-club-scope'
        ? { scopes: [] }
        : null;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>{PublicRoutes()}</Routes>
    </MemoryRouter>
  );
}

describe('legacy show section URLs land on the tab that absorbed them', () => {
  // EXACT equality, not `toHaveTextContent`: `/shows/show-1/setup` CONTAINS
  // `/shows/show-1`, so the substring matcher passes on the un-redirected URL.
  async function expectLandsAt(expected: string) {
    const probe = await screen.findByTestId('production-show-details-location');
    await waitFor(() => expect(probe.textContent).toBe(expected));
  }

  it.each([
    ['/shows/show-1/show-desk', '/shows/show-1/show-day', ''],
    ['/shows/show-1/entry-management', '/shows/show-1/entries', ''],
    ['/shows/show-1/results-control', '/shows/show-1/results', ''],
    ['/shows/show-1/submit-results', '/shows/show-1/results', '?step=submit'],
  ])('redirects %s to %s', async (from, pathname, search) => {
    renderAt(from);
    await expectLandsAt(`${pathname}${search}`);
  });

  it("keeps the viewer's own query params across the hop", async () => {
    // A deep link into Entry Management carries queue, scope and focus; losing
    // them is the whole failure the Show Desk check-in link already has
    // (MYK9-630 inventory, check-in finding 1).
    renderAt('/shows/show-1/entry-management?queue=needs-review&trial=trial-7');
    await expectLandsAt('/shows/show-1/entries?queue=needs-review&trial=trial-7');
  });

  it('carries a hash through the hop', async () => {
    renderAt('/shows/show-1/show-desk#ring-2');
    await expectLandsAt('/shows/show-1/show-day#ring-2');
  });

  it('renders Setup in place — phase 2 gave it a page, so it no longer redirects', async () => {
    renderAt('/shows/show-1/setup');
    await expectLandsAt('/shows/show-1/setup');
    expect(await screen.findByTestId('section-setup')).toBeInTheDocument();
  });

  it.each([
    ['/shows/show-1/setup', 'section-setup'],
    ['/shows/show-1/entries', 'section-entries'],
    ['/shows/show-1/show-day', 'section-show-day'],
    ['/shows/show-1/results', 'section-results'],
    ['/shows/show-1/reports', 'section-reports'],
  ])('mounts %s as a real page', async (path, testId) => {
    renderAt(path);
    expect(await screen.findByTestId(testId)).toBeInTheDocument();
  });
});

describe('a warm RBAC refresh does not blank the tab a secretary is standing on', () => {
  // `useRbacLifecycle` re-runs `load()` every 5 minutes and on every `online`
  // event, and `load()` sets `isLoading: true` while PRESERVING the roles it
  // already has. `ShowManagementSectionRoute` returned null on raw
  // `rbacLoading`, which UNMOUNTS the section element -- bulk selection, search,
  // page index, open detail pane and scroll position are component state and
  // went with it. Since MYK9-630 phase 2 these routes are the only door to the
  // secretary's show-day surfaces, so this covered all five of them.
  afterEach(() => {
    mockAuth.rbacLoading = false;
  });

  it('keeps the Entries page mounted while roles refresh in the background', async () => {
    // Warm: loading again, but the roles from the last load are still here.
    mockAuth.rbacLoading = true;
    renderAt('/shows/show-1/entries');

    expect(await screen.findByTestId('section-entries')).toBeInTheDocument();
  });

  it('still holds while the roles have never arrived', async () => {
    mockAuth.rbacLoading = true;
    renderAt('/shows/show-1/entries', { rolesKnown: false });

    await waitFor(() => expect(screen.queryByTestId('section-entries')).not.toBeInTheDocument());
  });

  it('does not BOUNCE a secretary whose scopes have not landed yet', async () => {
    // The state the browser walk actually hit, per the in-page diagnostic:
    // `userWithRoles` NON-null (AuthContext's default shape) with no club scope
    // in it yet, so `useShowManageScope` answers a confident
    // `resolved: canManage false` and the route's redirect fires. At 375px that
    // sent every one of the six tabs back to `/shows/:id`.
    //
    // NOT written as `hasRole -> SECRETARY` with `userWithRoles: null`: the real
    // `hasRole` opens with `if (!userWithRoles) return false` (AuthContext), so
    // that pairing cannot occur and a test built on it proves nothing.
    mockAuth.rbacLoading = true;
    renderAt('/shows/show-1/entries', { rolesKnown: 'no-club-scope' });

    await waitFor(() =>
      expect(screen.getByTestId('production-show-details-location')).toHaveTextContent(
        '/shows/show-1/entries'
      )
    );
    expect(screen.queryByTestId('section-entries')).not.toBeInTheDocument();
  });

  it('positive control: with roles known and no refresh, the page is there', async () => {
    renderAt('/shows/show-1/entries');

    expect(await screen.findByTestId('section-entries')).toBeInTheDocument();
  });
});

/**
 * The management gate, over every state AuthContext can actually produce.
 *
 * `loading` and `rbacLoading` are DERIVED here from AuthContext's own formulas
 * rather than set by hand, so a fixture cannot invent a combination the real
 * provider forbids -- which is how the earlier version of this file came to pin
 * `hasRole -> SECRETARY` alongside `userWithRoles: null`, a pairing
 * `AuthContext.hasRole` rules out on its first line.
 *
 *   loading     = auth.loading || (!!user && !rbacBelongs) || (rbacIsLoading && !userWithRoles)
 *   rbacLoading = !!user && (!rbacBelongs || rbacIsLoading)
 */
interface GateState {
  authLoading: boolean;
  rbacBelongs: boolean;
  rbacIsLoading: boolean;
  /** null = RBAC settled with zero roles; [] = roles, no club scope; scoped = manager. */
  scopes: null | Array<{ scopeType: ScopeType; scopeId: string; roleId: UserRole }>;
  /**
   * The GLOBAL role `hasRole()` reports. Defaults to secretary. Club-admin rows
   * pass `UserRole.CLUB_ADMIN`: since MYK9-630 phase 3 a club-scoped club admin
   * manages the show, so every transient state below must treat them exactly as
   * it treats a secretary — a club admin must never be bounced off a tab by a
   * warm RBAC refresh or a cold auth window.
   */
  role?: UserRole;
}

type GateOutcome = 'mounted' | 'held' | 'redirected';

function deriveAuth(state: GateState) {
  const hasUser = true;
  const userWithRoles = state.scopes === null ? null : { scopes: state.scopes };
  return {
    loading:
      state.authLoading ||
      (hasUser && !state.rbacBelongs) ||
      (state.rbacIsLoading && !userWithRoles),
    rbacLoading: hasUser && (!state.rbacBelongs || state.rbacIsLoading),
    userWithRoles,
  };
}

const SCOPED = [{ scopeType: ScopeType.CLUB, scopeId: 'club-a', roleId: UserRole.SECRETARY }];
/** A club admin of `club-a` — the club that owns `show-1`. */
const SCOPED_CLUB_ADMIN = [
  { scopeType: ScopeType.CLUB, scopeId: 'club-a', roleId: UserRole.CLUB_ADMIN },
];
/** The positive control: a club admin of a DIFFERENT club. */
const SCOPED_OTHER_CLUB_ADMIN = [
  { scopeType: ScopeType.CLUB, scopeId: 'club-b', roleId: UserRole.CLUB_ADMIN },
];

describe('ShowManagementSectionRoute over every reachable auth state', () => {
  afterEach(() => {
    mockAuth.rbacLoading = false;
    mockAuth.loading = false;
  });

  async function outcomeAt(state: GateState): Promise<GateOutcome> {
    const derived = deriveAuth(state);
    mockAuth.loading = derived.loading;
    mockAuth.rbacLoading = derived.rbacLoading;
    const globalRole = state.role ?? UserRole.SECRETARY;
    mockAuth.hasRole = (role: string) => derived.userWithRoles !== null && role === globalRole;
    mockAuth.userWithRoles = derived.userWithRoles;

    render(
      <MemoryRouter initialEntries={['/shows/show-1/entries']}>
        <Routes>{PublicRoutes()}</Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const probe = screen.queryByTestId('production-show-details-location');
      const mounted = screen.queryByTestId('section-entries');
      expect(probe !== null || mounted !== null).toBe(true);
    });
    // Let a redirect settle before reading the verdict.
    await waitFor(() => expect(screen.queryByTestId('production-show-details')).not.toBeNull());

    if (screen.queryByTestId('section-entries')) return 'mounted';
    const path = screen.getByTestId('production-show-details-location').textContent ?? '';
    return path.includes('/entries') ? 'held' : 'redirected';
  }

  it.each<[string, GateState, GateOutcome]>([
    [
      'cold: RBAC effect has not run',
      { authLoading: false, rbacBelongs: false, rbacIsLoading: false, scopes: null },
      'held',
    ],
    [
      'cold: RBAC loading, no roles yet',
      { authLoading: false, rbacBelongs: true, rbacIsLoading: true, scopes: null },
      'held',
    ],
    [
      'in flight: roles present, club scopes not landed',
      { authLoading: false, rbacBelongs: true, rbacIsLoading: true, scopes: [] },
      'held',
    ],
    [
      'secretary, fully loaded',
      { authLoading: false, rbacBelongs: true, rbacIsLoading: false, scopes: SCOPED },
      'mounted',
    ],
    [
      'secretary, WARM refresh (5-minute interval / online event)',
      { authLoading: false, rbacBelongs: true, rbacIsLoading: true, scopes: SCOPED },
      'mounted',
    ],
    [
      'exhibitor, loaded, no management scope',
      { authLoading: false, rbacBelongs: true, rbacIsLoading: false, scopes: [] },
      'redirected',
    ],
    [
      'RBAC load FAILED: settled with zero roles',
      { authLoading: false, rbacBelongs: true, rbacIsLoading: false, scopes: null },
      'redirected',
    ],
    // ---- club admin (MYK9-630 phase 3): identical verdicts to the secretary
    // rows above. Before phase 3 these rows had no meaning, because a club
    // admin was admitted to the section route and then handed the exhibitor
    // body; now the route and the surface are one decision.
    //
    // There is deliberately NO "offline cold boot" row, for either role.
    // `GateState` models auth loading, RBAC belonging, RBAC loading and the
    // scope set — nothing in it, or in `deriveAuth`, distinguishes roles
    // hydrated from a cache from roles hydrated from the network. Such a row is
    // field-identical to "fully loaded", exercises the same code path and can
    // never fail independently (REV-2341 lens P, P5). One was added here and a
    // second already existed on the secretary side; both are gone rather than
    // left to read as coverage they are not. The offline-boot property is a
    // claim about the RBAC cache, and belongs to a test of that cache.
    [
      'club admin of this club, fully loaded',
      {
        authLoading: false,
        rbacBelongs: true,
        rbacIsLoading: false,
        scopes: SCOPED_CLUB_ADMIN,
        role: UserRole.CLUB_ADMIN,
      },
      'mounted',
    ],
    [
      'club admin, WARM refresh (5-minute interval / online event)',
      {
        authLoading: false,
        rbacBelongs: true,
        rbacIsLoading: true,
        scopes: SCOPED_CLUB_ADMIN,
        role: UserRole.CLUB_ADMIN,
      },
      'mounted',
    ],
    [
      'club admin, COLD auth window: roles present, club scopes not landed',
      {
        authLoading: false,
        rbacBelongs: true,
        rbacIsLoading: true,
        scopes: [],
        role: UserRole.CLUB_ADMIN,
      },
      'held',
    ],
    [
      'club admin, RBAC load FAILED: settled with zero roles',
      {
        authLoading: false,
        rbacBelongs: true,
        rbacIsLoading: false,
        scopes: null,
        role: UserRole.CLUB_ADMIN,
      },
      'redirected',
    ],
    [
      'club admin of ANOTHER club, fully loaded',
      {
        authLoading: false,
        rbacBelongs: true,
        rbacIsLoading: false,
        scopes: SCOPED_OTHER_CLUB_ADMIN,
        role: UserRole.CLUB_ADMIN,
      },
      'redirected',
    ],
  ])('%s -> %s', async (_label, state, expected) => {
    expect(await outcomeAt(state)).toBe(expected);
  });
});
