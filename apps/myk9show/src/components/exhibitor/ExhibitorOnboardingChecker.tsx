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
  const { user, loading: authLoading } = useAuthContext();
  const { needsOnboarding, onboardingCompleted, isLoading: profileLoading } = useExhibitorProfile();
  const navigate = useNavigate();
  const location = useLocation();

  const isLoading = authLoading || profileLoading;

  useEffect(() => {
    if (isLoading) return;
    if (!user) return;
    if (isExemptPath(location.pathname)) return;

    // Redirect when profile row is missing or onboarding not yet completed
    if (needsOnboarding || !onboardingCompleted) {
      navigate('/onboarding', { replace: true });
    }
  }, [isLoading, user, needsOnboarding, onboardingCompleted, navigate, location.pathname]);

  return <>{children}</>;
}
