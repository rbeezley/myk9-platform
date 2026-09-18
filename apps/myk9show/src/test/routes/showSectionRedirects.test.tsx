import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
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
  hasRole: (role: string) => role === UserRole.SECRETARY,
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

function renderAt(path: string) {
  mockAuth.userWithRoles = {
    scopes: [{ scopeType: ScopeType.CLUB, scopeId: 'club-a', roleId: UserRole.SECRETARY }],
  };
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
