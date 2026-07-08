import type { ReactNode } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, KeyRound, ShieldAlert } from 'lucide-react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { LoadingEmptyState } from '@/components/common/EmptyState';
import { UserRole } from '@/types/auth-types';
import { selectGrantRoleForShow, useRingsideGrantStore } from '@/store/ringsideGrantStore';
import { useAccountTodayAutoFavorites } from '@/features/show-today/accountTodayEntries';
import { useHasAnyEntryForShow } from './useHasAnyEntryForShow';

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
  // exhibitor-show-day-access: distinguishes "entered exhibitor visiting
  // early" from "stranger with no relationship to this show" so the no-access
  // gate below can speak to the right audience instead of assuming a worker
  // with a passcode.
  const { hasAnyEntryForShow } = useHasAnyEntryForShow(
    user && !grantRole && !hasAccountStaffRole && !accountToday.hasAccountEntryForShow
      ? showId
      : undefined
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

  // exhibitor-show-day-access: an entered exhibitor visiting before show day
  // gets guidance to their own entries/check-in, not a passcode prompt aimed
  // at show workers. Everyone else still sees both audiences' paths.
  if (hasAnyEntryForShow) {
    return (
      <FullScreen>
        <div className="max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
          <ShieldAlert className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="mb-2 text-lg font-medium">Ringside isn&apos;t open for this show yet.</p>
          <p className="text-sm text-muted-foreground">
            Ringside opens on show day. Check your entries, check-in status, and show-day details
            under My Shows in the meantime.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link
              to="/exhibitor/entries"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Go to My Shows
            </Link>
            <Link
              to="/at-show?passcode=1"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <KeyRound className="h-4 w-4" aria-hidden />
              I have a show-day passcode
            </Link>
          </div>
        </div>
      </FullScreen>
    );
  }

  return (
    <FullScreen>
      <div className="max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
        <ShieldAlert className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <p className="mb-2 text-lg font-medium">
          You don&apos;t have ringside access for this show.
        </p>
        <p className="text-sm text-muted-foreground">
          Entered this show? Check your entries under My Shows. Working the show? Enter the
          passcode your secretary gave you.
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
