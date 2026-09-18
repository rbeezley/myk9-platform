import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, ProtectedRoute, type AuthContextType } from '@/context/AuthContext';
import { UserRole } from '@/types/auth-types';
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
    linkedFrom: 'Show Day + Entries "Add mail-in entry", Show Day "Add late entry"',
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
 */
function renderDestination(requiredRole: UserRole[]) {
  const contextValue = {
    user: auth.value.user,
    loading: auth.value.loading,
    hasRole: (role: UserRole) => auth.value.roles.includes(role),
    hasPermission: () => true,
  } as unknown as AuthContextType;

  return render(
    <MemoryRouter>
      <AuthContext.Provider value={contextValue}>
        <ProtectedRoute requiredRole={requiredRole}>
          <div data-testid="destination-body">the real page</div>
        </ProtectedRoute>
      </AuthContext.Provider>
    </MemoryRouter>
  );
}

describe('secretary-only destinations a club admin can reach from the six tabs', () => {
  beforeEach(() => {
    auth.value.roles = [];
  });

  describe.each(SECRETARY_ONLY_DESTINATIONS)(
    '$path (linked from $linkedFrom)',
    ({ requiredRole }) => {
      it('gives a club admin the in-shell "Trial secretary access only" state, not a bare wall', () => {
        auth.value.roles = [UserRole.CLUB_ADMIN];

        renderDestination(requiredRole);

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

        renderDestination(requiredRole);

        expect(screen.getByTestId('destination-body')).toBeInTheDocument();
        expect(screen.queryByTestId('role-access-denied')).toBeNull();
      });

      it('still admits a site admin — positive control', () => {
        auth.value.roles = [UserRole.SITE_ADMIN];

        renderDestination(requiredRole);

        expect(screen.getByTestId('destination-body')).toBeInTheDocument();
      });

      it('does not tell an exhibitor about trial secretary access', () => {
        auth.value.roles = [UserRole.EXHIBITOR];

        renderDestination(requiredRole);

        expect(screen.getByTestId('role-access-denied')).toBeInTheDocument();
        expect(screen.queryByText(TRIAL_SECRETARY_ONLY_REASON)).toBeNull();
      });
    }
  );

  it('admits a judge to the scoring family and nobody else to it', () => {
    // The scoring family is the one with a THIRD admitted role; a club admin is
    // still none of the three.
    auth.value.roles = [UserRole.JUDGE];
    const { unmount } = renderDestination([
      UserRole.SECRETARY,
      UserRole.JUDGE,
      UserRole.SITE_ADMIN,
    ]);
    expect(screen.getByTestId('destination-body')).toBeInTheDocument();
    unmount();

    auth.value.roles = [UserRole.CLUB_ADMIN];
    renderDestination([UserRole.SECRETARY, UserRole.JUDGE, UserRole.SITE_ADMIN]);
    expect(screen.queryByTestId('destination-body')).toBeNull();
  });
});
