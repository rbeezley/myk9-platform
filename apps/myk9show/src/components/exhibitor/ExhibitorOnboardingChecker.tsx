/**
 * Component that checks if the current user needs to complete onboarding.
 * Wraps children and redirects to /onboarding when:
 *   - user is authenticated
 *   - no exhibitor_profiles row exists (needsOnboarding), OR
 *   - onboarding has not been completed (onboarding_completed_at is null)
 *
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
  const {
    needsOnboarding,
    onboardingCompleted,
    isLoading: profileLoading,
    error: profileError,
  } = useExhibitorProfile();
  const navigate = useNavigate();
  const location = useLocation();

  const isLoading = authLoading || profileLoading;

  useEffect(() => {
    if (isLoading) return;
    if (!user) return;
    if (isExemptPath(location.pathname)) return;
    if (profileError) return;

    // Anonymous (passcode ringside) sessions are NOT exhibitors. As of migration
    // 20260625000000 they have no exhibitor_profiles row by design, so
    // `needsOnboarding` is true for them — but routing a passcode judge/steward to
    // exhibitor onboarding is wrong (it bounces them out of /at-show). They carry
    // their ringside role in the client grant, not RBAC, so the hasRole() checks
    // below never match. Exempt them explicitly.
    if (user.is_anonymous) return;

    // Secretaries, site admins, judges, and club admins don't have exhibitor_profiles
    // rows — they are staff roles, not exhibitors. Never route them to exhibitor onboarding.
    if (isSecretary || hasRole('site_admin') || hasRole('judge') || hasRole('club_admin')) return;

    if (needsOnboarding || !onboardingCompleted) {
      navigate('/onboarding', { replace: true });
    }
  }, [
    isLoading,
    user,
    needsOnboarding,
    onboardingCompleted,
    profileError,
    navigate,
    location.pathname,
    hasRole,
    isSecretary,
  ]);

  return <>{children}</>;
}
