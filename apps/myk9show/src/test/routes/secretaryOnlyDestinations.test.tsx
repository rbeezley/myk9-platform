import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext, ProtectedRoute, type AuthContextType } from '@/context/AuthContext';
import { PERMISSIONS, UserRole, type Permission } from '@/types/auth-types';
import { TRIAL_SECRETARY_ONLY_REASON } from '@/features/actions/trialSecretaryAccess';

/**
 * REV-2341 R-1. Two rounds of review each found an ENABLED control on a club
 * admin's six tabs leading to a `ProtectedRoute(SECRETARY | …)` destination and
 * a chrome-less "You don't have permission to access this page." line. Per
 * control greying has now been shown twice to be enumerable only by whoever
 * remembers to enumerate, so CLAUDE.md's convergence rule says restructure:
 * the DESTINATION is the safety net.
 *
 * These are the secretary-only route FAMILIES the six tabs link into, read off
 * `routes/secretaryRoutes.tsx` and `routes/publicRoutes.tsx` rather than from
 * memory. A control that is missed now degrades into an explained, in-shell
 * state; it does not dead-end.
 */
const SECRETARY_ONLY_DESTINATIONS: ReadonlyArray<{
  path: string;
  requiredRole: UserRole[];
  linkedFrom: string;
}> = [
  {
    path: '/secretary/register/show-1',
    requiredRole: [UserRole.SECRETARY, UserRole.SITE_ADMIN],
    linkedFrom: 'Show Day + Entries "Add entry for someone else", Show Day "Add late entry"',
  },
  {
    path: '/secretary/volunteers',
    requiredRole: [UserRole.SECRETARY, UserRole.SITE_ADMIN],
    linkedFrom: 'Show Day "Open volunteer scheduling"',
  },
  {
    path: '/scoring/classes/class-1/entries',
    requiredRole: [UserRole.SECRETARY, UserRole.JUDGE, UserRole.SITE_ADMIN],
    linkedFrom: 'Show Day cockpit "Enter paper scores"',
  },
  {
    path: '/secretary/dashboard',
    requiredRole: [UserRole.SECRETARY, UserRole.SITE_ADMIN],
    linkedFrom: 'Entries "Go to your shows", header Actions "Open Show Management"',
  },
];

const auth = vi.hoisted(() => ({
  value: {
    user: { id: 'user-1' } as object | null,
    loading: false,
    roles: [] as string[],
    hasPermission: true,
  },
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    hasRole: (role: string) => auth.value.roles.includes(role),
  }),
}));

vi.mock('@/components/layout/AppShell', () => ({
  AppShellPage: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell-page">{children}</div>
  ),
}));

/**
 * The REAL `ProtectedRoute`, with no `fallback` prop, so what is under test is
 * its DEFAULT — the thing this change edits. Re-implementing the component here
 * would certify the default no matter what it was.
 *
 * Mounted AT THE PATH, through a real `<Routes>`: the first cut of this file
 * declared a `path` on every row and then never used it, so the paths were
 * decorative and every row was a secretary-family route (REV-2341 U-1).
 */
function renderDestination({
  path,
  requiredRole,
  requiredPermission,
}: {
  path: string;
  requiredRole?: UserRole[] | undefined;
  requiredPermission?: Permission | undefined;
}) {
  const contextValue = {
    user: auth.value.user,
    loading: auth.value.loading,
    hasRole: (role: UserRole) => auth.value.roles.includes(role),
    hasPermission: () => auth.value.hasPermission,
  } as unknown as AuthContextType;

  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext.Provider value={contextValue}>
        <Routes>
          <Route
            path={path}
            element={
              <ProtectedRoute
                {...(requiredRole ? { requiredRole } : {})}
                {...(requiredPermission ? { requiredPermission } : {})}
              >
                <div data-testid="destination-body">the real page</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>
  );
}

describe('secretary-only destinations a club admin can reach from the six tabs', () => {
  beforeEach(() => {
    auth.value.roles = [];
    auth.value.hasPermission = true;
  });

  describe.each(SECRETARY_ONLY_DESTINATIONS)(
    '$path (linked from $linkedFrom)',
    ({ path, requiredRole }) => {
      it('gives a club admin the in-shell "Trial secretary access only" state, not a bare wall', () => {
        auth.value.roles = [UserRole.CLUB_ADMIN];

        renderDestination({ path, requiredRole });

        // Refused — the route's role check is unchanged.
        expect(screen.queryByTestId('destination-body')).toBeNull();
        // ...but inside the app's page chrome, with a heading, the reason, and a
        // way back. The old fallback had none of these.
        expect(screen.getByTestId('app-shell-page')).toBeInTheDocument();
        expect(
          screen.getByRole('heading', { name: TRIAL_SECRETARY_ONLY_REASON })
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /back to shows/i })).toBeInTheDocument();
      });

      it('still admits a trial secretary — positive control', () => {
        auth.value.roles = [UserRole.SECRETARY];

        renderDestination({ path, requiredRole });

        expect(screen.getByTestId('destination-body')).toBeInTheDocument();
        expect(screen.queryByTestId('role-access-denied')).toBeNull();
      });

      it('still admits a site admin — positive control', () => {
        auth.value.roles = [UserRole.SITE_ADMIN];

        renderDestination({ path, requiredRole });

        expect(screen.getByTestId('destination-body')).toBeInTheDocument();
      });

      it('does not tell an exhibitor about trial secretary access', () => {
        auth.value.roles = [UserRole.EXHIBITOR];

        renderDestination({ path, requiredRole });

        expect(screen.getByTestId('role-access-denied')).toBeInTheDocument();
        expect(screen.queryByText(TRIAL_SECRETARY_ONLY_REASON)).toBeNull();
      });
    }
  );

  it('admits a judge to the scoring family and nobody else to it', () => {
    // The scoring family is the one with a THIRD admitted role; a club admin is
    // still none of the three.
    const scoring = {
      path: '/scoring/classes/class-1/entries',
      requiredRole: [UserRole.SECRETARY, UserRole.JUDGE, UserRole.SITE_ADMIN],
    };
    auth.value.roles = [UserRole.JUDGE];
    const { unmount } = renderDestination(scoring);
    expect(screen.getByTestId('destination-body')).toBeInTheDocument();
    unmount();

    auth.value.roles = [UserRole.CLUB_ADMIN];
    renderDestination(scoring);
    expect(screen.queryByTestId('destination-body')).toBeNull();
  });
});

/**
 * REV-2341 U-1 — the OTHER side of the copy split, which the rows above cannot
 * reach because every one of them is a secretary-family route.
 *
 * The first cut asked only what the VIEWER held, so this page told a club admin
 * that `/admin/*`, `/judge/*` and every permission-only gate "belongs to the
 * show's trial secretary" and that a club admin could grant them access. False
 * on ~30 routes, and `/people/:id` is two clicks from the Entries tab (a dog's
 * owner name links there). The line it replaced was vague but true.
 */
describe('routes that are NOT the trial secretary’s', () => {
  const NON_SECRETARY_ROUTES: ReadonlyArray<{
    name: string;
    path: string;
    requiredRole?: UserRole[];
    requiredPermission?: Permission;
  }> = [
    { name: 'site-admin only', path: '/admin/dashboard', requiredRole: [UserRole.SITE_ADMIN] },
    {
      name: 'judge / steward',
      path: '/judge/check-in',
      requiredRole: [UserRole.JUDGE, UserRole.STEWARD, UserRole.SITE_ADMIN],
    },
    {
      name: 'permission-only, no role',
      path: '/clubs/club-1/edit',
      requiredPermission: PERMISSIONS.DOG_READ_ALL,
    },
  ];

  beforeEach(() => {
    auth.value.roles = [];
    auth.value.hasPermission = true;
  });

  it.each(NON_SECRETARY_ROUTES)(
    'tells a club admin the generic truth on $name ($path), never the secretary sentence',
    ({ path, requiredRole, requiredPermission }) => {
      auth.value.roles = [UserRole.CLUB_ADMIN];
      if (requiredPermission) auth.value.hasPermission = false;

      renderDestination({
        path,
        ...(requiredRole ? { requiredRole } : {}),
        ...(requiredPermission ? { requiredPermission } : {}),
      });

      expect(screen.queryByTestId('destination-body')).toBeNull();
      expect(screen.getByTestId('role-access-denied')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /don.t have access/i })).toBeInTheDocument();
      expect(screen.queryByText(TRIAL_SECRETARY_ONLY_REASON)).toBeNull();
      expect(screen.queryByText(/belongs to the show/i)).toBeNull();
      expect(screen.queryByText(/grant you secretary access/i)).toBeNull();
    }
  );

  it('keeps the secretary sentence on a route that DOES require SECRETARY — the contrast', () => {
    auth.value.roles = [UserRole.CLUB_ADMIN];

    renderDestination({
      path: '/secretary/volunteers',
      requiredRole: [UserRole.SECRETARY, UserRole.SITE_ADMIN],
    });

    expect(screen.getByRole('heading', { name: TRIAL_SECRETARY_ONLY_REASON })).toBeInTheDocument();
  });

  it('a permission-only refusal on a SECRETARY route is still explained as a permission', () => {
    // The route declares a role AND a permission; the viewer passes the role and
    // fails the permission. Naming the role would explain the refusal wrongly.
    auth.value.roles = [UserRole.SECRETARY, UserRole.CLUB_ADMIN];
    auth.value.hasPermission = false;

    renderDestination({
      path: '/secretary/volunteers',
      requiredRole: [UserRole.SECRETARY, UserRole.SITE_ADMIN],
      requiredPermission: PERMISSIONS.DOG_READ_ALL,
    });

    expect(screen.getByRole('heading', { name: /don.t have access/i })).toBeInTheDocument();
    expect(screen.queryByText(TRIAL_SECRETARY_ONLY_REASON)).toBeNull();
  });
});
