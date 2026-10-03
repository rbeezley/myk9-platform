/**
 * Sends an EXHIBITOR-ONLY user to /onboarding until they finish the first run
 * (no profile row, or no onboarding_completed_at) — main's behaviour.
 *
 * MYK9-970: anyone holding a staff role (secretary, judge, club admin,
 * chairman, steward, site admin) is never force-redirected. Their working
 * pages are where they run a show, so their unfinished onboarding — the first
 * run or a role gained later — is offered by NewRoleStepBanner instead.
 *
 * Redirects only when:
 *   - auth, RBAC and the profile query have all settled (an unresolved query
 *     is "unknown", never "no profile"),
 *   - the user is authenticated, holds no staff role, and is not an anonymous
 *     passcode session,
 *   - the current route is not exempt (auth, legal, and the show-day/payment
 *     routes in `@/utils/sensitiveRoutes`), and
 *   - there is no profile row, or it has no onboarding_completed_at.
 */

import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';
import { holdsStaffRole } from '@/pages/onboarding/onboardingSteps';
import { isOnboardingExemptPath } from './onboardingExemptPaths';

interface ExhibitorOnboardingCheckerProps {
  children: React.ReactNode;
}

export function ExhibitorOnboardingChecker({ children }: ExhibitorOnboardingCheckerProps) {
  const { user, userWithRoles, loading: authLoading, rbacLoading } = useAuthContext();
  const {
    profile,
    profileSettled,
    isLoading: profileLoading,
    error: profileError,
  } = useExhibitorProfile();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Roles decide whether to redirect at all, so wait for RBAC too.
    if (authLoading || rbacLoading || profileLoading) return;
    if (!user) return;
    // Staff are offered onboarding by a banner, never redirected (MYK9-970).
    if (holdsStaffRole(userWithRoles?.roles ?? [])) return;
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
    rbacLoading,
    profileLoading,
    user,
    userWithRoles?.roles,
    profile,
    profileSettled,
    profileError,
    navigate,
    location.pathname,
  ]);

  return <>{children}</>;
}
