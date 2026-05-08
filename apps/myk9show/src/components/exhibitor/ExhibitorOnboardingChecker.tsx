/**
 * Component that checks if the current user needs to complete onboarding.
 * Wraps children and redirects to /onboarding when:
 *   - user is authenticated
 *   - no exhibitor_profiles row exists (needsOnboarding)
 *   - onboarding has not been completed (onboarding_completed_at is null)
 *
 * ExhibitorOnboardingModal is kept as dead code for edge-case reference
 * but is no longer rendered here.
 */

import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';

interface ExhibitorOnboardingCheckerProps {
  children: React.ReactNode;
}

// Routes that should never trigger an onboarding redirect (auth pages, the
// onboarding route itself, legal pages, and TV display).
const EXEMPT_PATHS = [
  '/onboarding',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/terms',
  '/privacy',
];

function isExemptPath(pathname: string): boolean {
  return EXEMPT_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
}

export function ExhibitorOnboardingChecker({ children }: ExhibitorOnboardingCheckerProps) {
  const { user, loading: authLoading, isSecretary, hasRole } = useAuthContext();
  const { needsOnboarding, onboardingCompleted, isLoading: profileLoading } = useExhibitorProfile();
  const navigate = useNavigate();
  const location = useLocation();

  const isLoading = authLoading || profileLoading;

  useEffect(() => {
    if (isLoading) return;
    if (!user) return;
    if (isExemptPath(location.pathname)) return;

    // Secretaries, site admins, judges, and club admins don't have exhibitor_profiles
    // rows — they are staff roles, not exhibitors. Never route them to exhibitor onboarding.
    if (isSecretary || hasRole('site_admin') || hasRole('judge') || hasRole('club_admin')) return;

    // Only redirect users who have no profile row yet (brand new accounts).
    // The !onboardingCompleted check is intentionally omitted until migration 125
    // is deployed and all existing users have been given a chance to complete it —
    // otherwise every user created before this feature shipped would be redirected.
    if (needsOnboarding) {
      navigate('/onboarding', { replace: true });
    }
  }, [
    isLoading,
    user,
    needsOnboarding,
    onboardingCompleted,
    navigate,
    location.pathname,
    hasRole,
    isSecretary,
  ]);

  return <>{children}</>;
}
