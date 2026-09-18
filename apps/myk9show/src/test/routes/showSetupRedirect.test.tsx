import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PublicRoutes } from '@/routes/publicRoutes';
import { ScopeType, UserRole } from '@/types/auth-types';

/**
 * `/shows/:id/setup` is a compatibility route that must land on the show
 * Overview (decision 4, docs/plan-secretary-show-actions.md): Setup's contents
 * moved onto Overview and the sidebar no longer points here.
 *
 * This renders the PRODUCTION route tree with the real redirect component,
 * which `canonicalShowRoutes.test.tsx` cannot do — it mocks the setup page to a
 * placeholder to prove the section mounts. The failure this closes is the one a
 * component-level test cannot see: the redirect reads `useParams().id`, so it
 * silently bounces to `/shows` if the route's param is ever renamed or the
 * route stops being nested under `/shows/:id`.
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
            {location.hash}
          </div>
          <router.Outlet />
        </div>
      );
    },
  };
});

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

describe('/shows/:id/setup redirects to the show Overview', () => {
  // EXACT equality, not `toHaveTextContent`: `/shows/show-1/setup` CONTAINS
  // `/shows/show-1`, so the substring matcher passes on the un-redirected URL.
  async function expectLandsAt(expected: string) {
    const probe = await screen.findByTestId('production-show-details-location');
    await waitFor(() => expect(probe.textContent).toBe(expected));
  }

  it('lands a secretary on /shows/<id>', async () => {
    renderAt('/shows/show-1/setup');
    // Not `/shows` either: a dropped route param bounces to the browse list.
    await expectLandsAt('/shows/show-1');
  });

  it('carries a readiness hash through to the Overview', async () => {
    renderAt('/shows/show-1/setup#setup-publish-premium');
    await expectLandsAt('/shows/show-1#setup-publish-premium');
  });
});
