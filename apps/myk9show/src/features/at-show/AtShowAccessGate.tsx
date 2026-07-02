import type { ReactNode } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, KeyRound, ShieldAlert } from 'lucide-react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { LoadingEmptyState } from '@/components/common/EmptyState';
import { UserRole } from '@/types/auth-types';
import { selectGrantRoleForShow, useRingsideGrantStore } from '@/store/ringsideGrantStore';
import { useAccountTodayAutoFavorites } from '@/features/show-today/accountTodayEntries';

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
  const accountToday = useAccountTodayAutoFavorites(
    user && !grantRole && !hasAccountStaffRole ? showId : undefined
  );

  // Client-only UX gate: a passcode grant admits the ringside UI for this
  // device/show, but data security remains enforced by Supabase RLS and the
  // replication layer. Do not treat `grantRole` as a server authorization token.
  if (loading) {
    return (
      <FullScreen>
        <LoadingEmptyState message="Checking ringside access…" />
      </FullScreen>
    );
  }

  if (grantRole || hasAccountStaffRole || accountToday.hasAccountEntryForShow) {
    return <>{children}</>;
  }

  if (user && accountToday.isLoading) {
    return (
      <FullScreen>
        <LoadingEmptyState message="Checking ringside access…" />
      </FullScreen>
    );
  }

  if (!user) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  return (
    <FullScreen>
      <div className="max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
        <ShieldAlert className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <p className="mb-2 text-lg font-medium">
          You don&apos;t have ringside access for this show.
        </p>
        <p className="text-sm text-muted-foreground">
          Enter the passcode your secretary gave you, or ask the secretary for the right show
          access.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            to="/at-show?passcode=1"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <KeyRound className="h-4 w-4" aria-hidden />
            Enter passcode
          </Link>
          <Link
            to="/"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to dashboard
          </Link>
        </div>
      </div>
    </FullScreen>
  );
}
