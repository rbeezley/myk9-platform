import { isSensitivePath } from '@/utils/sensitiveRoutes';

// Auth pages, the onboarding route itself and legal pages.
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

/**
 * Routes where neither the onboarding redirect nor the new-role banner appears.
 *
 * INTENT: this includes every show-day and payment route (ringside, scoring, the
 * live class dashboard, TV display, checkout). A judge at the ring must land on
 * the scoresheet, never on a setup form or a prompt. That list is the one the
 * PWA update prompt uses (`isSensitivePath`), so a new show-day route is added
 * in one place.
 */
export function isOnboardingExemptPath(pathname: string): boolean {
  return (
    isSensitivePath(pathname) ||
    ONBOARDING_EXEMPT_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
  );
}
