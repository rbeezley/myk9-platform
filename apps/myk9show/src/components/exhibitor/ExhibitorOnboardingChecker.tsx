/**
 * Sends a signed-in user to /onboarding while they have onboarding steps left.
 *
 * One rule for everyone (MYK9-970): `buildOnboardingSteps` decides, the same
 * function the onboarding page renders from. Staff are no longer exempt — they
 * get profile, dogs (skippable) and their role steps like everyone else.
 *
 * Redirects only when:
 *   - the user is authenticated and not an anonymous passcode session,
 *   - the profile query has SETTLED (an unresolved query is "unknown", never
 *     "no profile"),
 *   - the current route is not exempt (auth, legal, and the show-day/payment
 *     routes in `@/utils/sensitiveRoutes`), and
 *   - there is at least one step left.
 */

import React, { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';
import { buildOnboardingSteps } from '@/pages/onboarding/onboardingSteps';
import type { UserRole } from '@/types/auth-types';
import { isSensitivePath } from '@/utils/sensitiveRoutes';

interface ExhibitorOnboardingCheckerProps {
  children: React.ReactNode;
}

// Auth pages, the onboarding route itself and legal pages never redirect.
const ONBOARDING_EXEMPT_PATHS = [
  '/onboarding',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/terms',
  '/privacy',
];

// INTENT: neither do show-day and payment routes (ringside, scoring, the live
// class dashboard, TV display, checkout). A judge signing in at the ring must
// land on the scoresheet, never on a setup form; the step waits for the next
// visit to the rest of the app. The list is the one the PWA update prompt uses
// (`isSensitivePath`), so a new show-day route is added in one place.
function isExemptPath(pathname: string): boolean {
  return (
    isSensitivePath(pathname) ||
    ONBOARDING_EXEMPT_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
  );
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

  // "A new role starts its step on the next sign-in", not mid-session: RBAC
  // re-polls every few minutes, and a role granted while someone is working
  // must not yank them off their page. The role set is latched the first time
  // RBAC settles for this user in this app session.
  const latchedRolesRef = useRef<{ userId: string; roles: readonly UserRole[] } | null>(null);

  const isLoading = authLoading || rbacLoading || profileLoading;

  useEffect(() => {
    if (isLoading) return;
    if (!user) return;
    if (isExemptPath(location.pathname)) return;
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

    if (latchedRolesRef.current?.userId !== user.id) {
      latchedRolesRef.current = { userId: user.id, roles: userWithRoles?.roles ?? [] };
    }

    const steps = buildOnboardingSteps({
      hasProfile: Boolean(profile),
      baseCompleted: Boolean(profile?.onboarding_completed_at),
      roles: latchedRolesRef.current.roles,
      onboardedRoles: profile ? profile.onboarded_roles : [],
    });

    if (steps.length > 0) {
      navigate('/onboarding', { replace: true });
    }
  }, [
    isLoading,
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
