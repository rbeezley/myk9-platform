import { Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/common/PageShell';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { TRIAL_SECRETARY_ONLY_REASON } from '@/features/actions/trialSecretaryAccess';

/**
 * What a signed-in user sees when a route's role requirement refuses them.
 *
 * THE DESTINATION IS THE SAFETY NET. Until MYK9-630 phase 3 this was a
 * chrome-less, centred grey line — "You don't have permission to access this
 * page." — with no heading, no way back but the browser button, and no hint of
 * which role was missing. That was tolerable while only an exhibitor who typed a
 * URL could reach it. Phase 3 puts a club admin in front of six tabs whose
 * bodies link out to secretary-only destinations, and TWO rounds of review found
 * an enabled control leading here that per-control greying had missed
 * (REV-2341 P1, then R-1 on a fourth control). CLAUDE.md's convergence rule says
 * the second finding on one path is a restructure signal, so the fix moved here:
 * a control that someone forgets to grey now degrades into an explained,
 * in-shell state instead of a dead end.
 *
 * This is presentation only. It renders EXACTLY when `ProtectedRoute` would have
 * rendered the old line — it never admits anyone, and the route's role check is
 * unchanged.
 *
 * The copy splits on what the viewer actually holds, because "Trial secretary
 * access only" is information to a club admin and noise to an exhibitor who
 * mistyped a URL.
 */
export function RoleAccessDeniedState() {
  const navigate = useNavigate();
  const { hasRole } = useAuthContext();
  // A manager who is not an operator: the persona phase 3 created. Deliberately
  // the GLOBAL role, not a club-scoped gate — this component cannot resolve a
  // show from every route that renders it (`/scoring/classes/:id/entries` names
  // a class), and since it only ever chooses between two refusal messages, the
  // coarser question is the right one. Nothing is granted either way.
  const isManagerWithoutOperatorRole =
    hasRole(UserRole.CLUB_ADMIN) && !hasRole(UserRole.SECRETARY) && !hasRole(UserRole.SITE_ADMIN);

  return (
    <PageShell>
      <div
        role="status"
        data-testid="role-access-denied"
        className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center text-center"
      >
        <div className="mb-4 rounded-full bg-muted p-4">
          <Lock className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
        </div>
        <h1 className="mb-2 text-lg font-semibold">
          {isManagerWithoutOperatorRole ? TRIAL_SECRETARY_ONLY_REASON : 'You don’t have access'}
        </h1>
        <p className="mb-6 text-muted-foreground">
          {isManagerWithoutOperatorRole
            ? 'This page belongs to the show’s trial secretary. You manage this show — its setup, entries, show day, results and reports — but entering paperwork on an exhibitor’s behalf, scoring on paper and volunteer scheduling stay with the secretary. Ask your club’s secretary, or ask a club admin to grant you secretary access.'
            : 'This page needs a role your account doesn’t have. If you think that’s wrong, ask your club admin.'}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button type="button" onClick={() => navigate(-1)}>
            Go back
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/shows')}>
            Back to Shows
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
