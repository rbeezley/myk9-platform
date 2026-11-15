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

// Her own pages. MYK9-1998 owner decision: "Never block her own pages". An
// exhibitor with unfinished first-run set-up still opens My Shows, her cart and
// her messages; My Shows offers the set-up as a line instead (MYK9-2028).
// Kept out of `isOnboardingExemptPath` and `sensitiveRoutes.ts`: the new-role
// banner still shows for staff here, and the PWA update prompt must not change.
const EXHIBITOR_OWN_PAGE_PATHS = ['/exhibitor/entries', '/my-entries', '/cart', '/messages'];

/** True on My Shows, the cart and messages, where the onboarding redirect never fires. */
export function isExhibitorOwnPagePath(pathname: string): boolean {
  return EXHIBITOR_OWN_PAGE_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
}
