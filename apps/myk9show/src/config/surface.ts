// Build-time gate that hides everything except the show-creation wizard
// surface — the only slice of myK9Show that's ready for real secretaries
// to use. Set VITE_PUBLIC_SURFACE=wizard on the gated deployment; leave
// unset (or 'full') on the staging / internal deployment.
//
// INTENT: shipping early access feels like a polished single-purpose tool,
// not a half-built app with broken menu items. Hide aggressively.

import { matchPath } from 'react-router-dom';

export type Surface = 'wizard' | 'full';

const raw = import.meta.env.VITE_PUBLIC_SURFACE;
export const currentSurface: Surface = raw === 'wizard' ? 'wizard' : 'full';
export const isWizardSurface = currentSurface === 'wizard';

// Paths reachable when the wizard surface is active. Site admins bypass
// this list (see WizardSurfaceGate). Keep this list tight — every entry
// is a promise that the page works end-to-end for an early-access user.
export const WIZARD_SURFACE_PATHS = [
  '/',
  '/sign-in',
  '/sign-up',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/account',
  '/help/credentials',
  '/secretary',
  '/secretary/dashboard',
  '/secretary/create-show',
  '/secretary/create-show/wizard',
  '/secretary/shows/:showId',
  '/secretary/settings',
  '/shows/:id',
  '/shows/:id/*',
] as const;

// Pure check — does this path match the wizard-surface allowlist? Useful
// in tests and in any code that needs to ask the question independently of
// whether the surface flag is currently on.
export function isPathInWizardAllowlist(pathname: string): boolean {
  return WIZARD_SURFACE_PATHS.some((pattern) =>
    matchPath({ path: pattern, end: !pattern.endsWith('*') }, pathname) !== null
  );
}

// Live check — true when either (a) the surface is full, so everything is
// allowed, or (b) the surface is wizard and the path is in the allowlist.
export function isPathAllowedInCurrentSurface(pathname: string): boolean {
  if (!isWizardSurface) return true;
  return isPathInWizardAllowlist(pathname);
}
