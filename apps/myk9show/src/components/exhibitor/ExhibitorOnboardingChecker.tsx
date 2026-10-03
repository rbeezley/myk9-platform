/**
 * Sends a signed-in user to /onboarding until they have finished the FIRST run.
 *
 * MYK9-970: staff are no longer exempt — everyone gets profile, dogs
 * (skippable) and the role steps for the roles they hold at that moment.
 *
 * Only the first run is forced. A role gained later is offered by a
 * dismissible banner (NewRoleStepBanner), never by a redirect: a redirect keyed
 * on roles has to agree with RBAC re-polls, revocations and sign-out, and three
 * review rounds showed it cannot do that simply.
 *
 * Redirects only when:
 *   - the user is authenticated and not an anonymous passcode session,
 *   - the profile query has SETTLED (an unresolved query is "unknown", never
 *     "no profile"),
 *   - the current route is not exempt (auth, legal, and the show-day/payment
 *     routes in `@/utils/sensitiveRoutes`), and
 *   - there is no profile row, or it has no onboarding_completed_at.
 */

import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';
import { isOnboardingExemptPath } from './onboardingExemptPaths';

interface ExhibitorOnboardingCheckerProps {
  children: React.ReactNode;
}

export function ExhibitorOnboardingChecker({ children }: ExhibitorOnboardingCheckerProps) {
  const { user, loading: authLoading } = useAuthContext();
  const {
    profile,
    profileSettled,
    isLoading: profileLoading,
    error: profileError,
  } = useExhibitorProfile();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!user) return;
    if (isOnboardingExemptPath(location.pathname)) return;
    if (profileError) return;

    // Anonymous (passcode ringside) sessions are NOT accounts. As of migration
    // 20260625000000 they have no exhibitor_profiles row by design, and they
    // carry their ringside role in the client grant, not RBAC. Never onboard them.
    if (user.is_anonymous) return;

    // MYK9-347: only redirect once the profile query has actually reported.
    // `profileLoading` is `isPending && isFetching`, and a query PAUSED after a
    // connectivity drop is pending but not fetching — so the guards above let it
    // through with `profile === undefined`, which would read as "no profile" for
    // a fully onboarded user and strand them on /onboarding, which they cannot
    // complete without a backend. An unsettled query is "unknown".
    if (!profileSettled) return;

    if (!profile?.onboarding_completed_at) {
      navigate('/onboarding', { replace: true });
    }
  }, [
    authLoading,
    profileLoading,
    user,
    profile,
    profileSettled,
    profileError,
    navigate,
    location.pathname,
  ]);

  return <>{children}</>;
}
