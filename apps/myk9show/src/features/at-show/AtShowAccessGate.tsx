import type { ReactNode } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, KeyRound, ShieldAlert } from 'lucide-react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { LoadingEmptyState } from '@/components/common/EmptyState';
import { selectGrantRoleForShow, useRingsideGrantStore } from '@/store/ringsideGrantStore';
import { useAccountTodayAutoFavorites } from '@/features/show-today/accountTodayEntries';
import { useHasAnyEntryForShow } from './useHasAnyEntryForShow';
import { useRehydrateRingsideGrant } from './useRehydrateRingsideGrant';
import { AtShowAnnouncementFeed } from './AtShowAnnouncementFeed';
import { hasRingsideStaffRole } from './ringsideAccountAccess';

function FullScreen({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center p-6">{children}</div>;
}

export function AtShowAccessGate({ children }: { children: ReactNode }) {
  const { showId } = useParams<{ showId: string }>();
  const location = useLocation();
  const { user, loading, hasRole } = useAuthContext();
  useRehydrateRingsideGrant(showId);
  const activeGrant = useRingsideGrantStore(state => state.activeGrant);
  const grantRole = selectGrantRoleForShow(activeGrant, showId);
  const hasAccountStaffRole = hasRingsideStaffRole(hasRole);
  const accountToday = useAccountTodayAutoFavorites(
    user && !grantRole && !hasAccountStaffRole ? showId : undefined
  );
  const needsExhibitorAffiliationLookup = Boolean(
    user && !grantRole && !hasAccountStaffRole && !accountToday.hasAccountEntryForShow
  );
  // exhibitor-show-day-access: distinguishes "entered exhibitor visiting
  // early" from "stranger with no relationship to this show" so the no-access
  // gate below can speak to the right audience instead of assuming a worker
  // with a passcode.
  const {
    hasAnyEntryForShow,
    isLoading: hasAnyEntryLoading,
    isError: hasAnyEntryError,
    identityState,
    hasUsablePersonId,
  } = useHasAnyEntryForShow(needsExhibitorAffiliationLookup ? showId : undefined);

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
    return <AtShowAnnouncementFeed showId={showId}>{children}</AtShowAnnouncementFeed>;
  }

  if (!user) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  if (needsExhibitorAffiliationLookup && !hasUsablePersonId && identityState === 'missing') {
    return (
      <FullScreen>
        <div className="max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
          <ShieldAlert className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="mb-2 text-lg font-medium">We couldn&apos;t find your exhibitor profile.</p>
          <p className="text-sm text-muted-foreground">
            This account is signed in, but it is not linked to an exhibitor profile yet. Ask the
            secretary to add your profile, or use a show-day passcode if you&apos;re volunteering.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link
              to="/exhibitor/entries"
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Go to My Shows
            </Link>
            <Link
              to="/at-show?passcode=1"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-input px-4 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              I have a show-day passcode
            </Link>
          </div>
        </div>
      </FullScreen>
    );
  }

  if (needsExhibitorAffiliationLookup && !hasUsablePersonId && identityState === 'unresolved') {
    return (
      <FullScreen>
        <div className="max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
          <ShieldAlert className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="mb-2 text-lg font-medium">Still confirming your account.</p>
          <p className="text-sm text-muted-foreground">
            We&apos;re still confirming which entries belong to you. Keep this page open and try
            again when your connection is available.
          </p>
          <Link
            to="/exhibitor/entries"
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Go to My Shows
          </Link>
          <Link
            to="/at-show?passcode=1"
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-md border border-input px-4 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            I have a show-day passcode
          </Link>
        </div>
      </FullScreen>
    );
  }

  // Wait for the entry-affiliation lookup before deciding which no-access copy
  // to show — otherwise an entered exhibitor visiting early would flash the
  // generic "you don't have access" / passcode path for a frame before
  // switching to the intended early-entry guidance (the exact audience this
  // gate is trying to distinguish).
  if (hasAnyEntryLoading) {
    return (
      <FullScreen>
        <LoadingEmptyState message="Checking ringside access…" />
      </FullScreen>
    );
  }

  // INTENT: `hasAnyEntryForShow === false` after a failed read is an absence of
  // KNOWLEDGE, not an absence of entries, and the branch below it speaks to a
  // stranger. Telling an entered exhibitor standing at the ring on bad venue
  // wifi that they have no relationship to this show is the "poor connectivity
  // feels like user failure" state PRODUCT.md forbids. Say what actually
  // happened and keep both doors open (MYK9-629 restructure 3).
  if (hasAnyEntryError) {
    return (
      <FullScreen>
        <div className="max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
          <ShieldAlert className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="mb-2 text-lg font-medium">We couldn&apos;t confirm your entries.</p>
          <p className="text-sm text-muted-foreground">
            We couldn&apos;t reach the server to check whether you&apos;re entered in this show, so
            we can&apos;t open ringside yet. Try again when you have a signal — or use a show-day
            passcode if the secretary gave you one.
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
              <KeyRound className="h-4 w-4" aria-hidden />I have a show-day passcode
            </Link>
          </div>
        </div>
      </FullScreen>
    );
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
              <KeyRound className="h-4 w-4" aria-hidden />I have a show-day passcode
            </Link>
          </div>
        </div>
      </FullScreen>
    );
  }

  // exhibitor-show-day-access (D9): a signed-in user with no grant, staff role,
  // or entry for this show is never shown the passcode FORM — that prompt is
  // reserved for anonymous / explicit `?passcode=1` flows. Signed-in visitors
  // get an explanatory, account-voiced state pointing them at My Shows. (Any
  // anonymous visitor was already redirected to sign-in above, so everyone
  // reaching this branch is authenticated.)
  //
  // The secondary passcode LINK below is not that form. Arriving here by deep
  // link — a QR at the ring, a link from the secretary — is exactly how a
  // signed-in exhibitor volunteering as a steward reaches ringside, and a
  // passcode is their only way in. D9 withheld the link on this branch while
  // the entered-exhibitor branch above offered it, so the person most likely to
  // be holding a passcode was the one person never offered somewhere to use it.
  // See the spec's "Signed-in volunteer working a show they are not entered in".
  return (
    <FullScreen>
      <div className="max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
        <ShieldAlert className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <p className="mb-2 text-lg font-medium">
          You don&apos;t have ringside access for this show.
        </p>
        <p className="text-sm text-muted-foreground">
          Ringside opens on show day for entered exhibitors and show workers. If you&apos;re entered
          in this show, your entries and check-in are under My Shows. If you&apos;re working this
          show, the secretary can give you a passcode.
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
            <KeyRound className="h-4 w-4" aria-hidden />I have a show-day passcode
          </Link>
        </div>
        <Link
          to="/"
          className="mt-4 inline-flex items-center gap-1 rounded text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Back to dashboard
        </Link>
      </div>
    </FullScreen>
  );
}
