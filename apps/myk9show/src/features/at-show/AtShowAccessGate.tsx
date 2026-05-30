import type { ReactNode } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { LoadingEmptyState } from '@/components/common/EmptyState';
import { UserRole } from '@/types/auth-types';
import { selectGrantRoleForShow, useRingsideGrantStore } from '@/store/ringsideGrantStore';

const STAFF_ROLES = [
  UserRole.SITE_ADMIN,
  UserRole.SECRETARY,
  UserRole.CLUB_ADMIN,
  UserRole.CHAIRMAN,
  UserRole.JUDGE,
  UserRole.STEWARD,
];

function FullScreen({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center p-6">{children}</div>;
}

export function AtShowAccessGate({ children }: { children: ReactNode }) {
  const { showId } = useParams<{ showId: string }>();
  const location = useLocation();
  const { user, loading, hasRole } = useAuthContext();
  const activeGrant = useRingsideGrantStore(state => state.activeGrant);
  const grantRole = selectGrantRoleForShow(activeGrant, showId);
  const hasAccountStaffRole = STAFF_ROLES.some(role => hasRole(role));

  if (loading) {
    return (
      <FullScreen>
        <LoadingEmptyState message="Checking ringside access…" />
      </FullScreen>
    );
  }

  if (grantRole || hasAccountStaffRole) {
    return <>{children}</>;
  }

  if (!user) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  return (
    <FullScreen>
      <div className="max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
        <ShieldAlert className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <p className="mb-2 text-lg font-medium">You don&apos;t have ringside access for this show.</p>
        <p className="text-sm text-muted-foreground">
          Enter the passcode your secretary gave you, or ask the secretary for the right show access.
        </p>
      </div>
    </FullScreen>
  );
}
