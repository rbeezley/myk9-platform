import { normalizeSignInRedirect } from '@/pages/SignInPage.helpers';
import type { Audience } from './lifecycleStories';

// The single source for landing CTA labels, targets and order: clubs first.
export const ADD_YOUR_CLUB = { label: 'Add your club', href: '#get-started' } as const;
// The one door to ask for a club (MYK9-2048): the home page form, reached from anywhere in
// the app. `onboarding=true` keeps a signed-in visitor on the landing instead of the dashboard.
export const ADD_YOUR_CLUB_PATH = '/?onboarding=true#get-started';

/** True on the home page opened for its club form (`/?onboarding=true`), with or without a `returnTo`. */
export function isAddYourClubLocation(location: { pathname: string; search: string }): boolean {
  return (
    location.pathname === '/' && new URLSearchParams(location.search).get('onboarding') === 'true'
  );
}

/** A same-origin app path (`/x?y`), or null for anything else (`//host`, a scheme, relative). */
export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value?.startsWith('/') || value.startsWith('//')) return null;
  return normalizeSignInRedirect(value);
}

/**
 * The add-a-club door, optionally carrying where to come back to (the show wizard's draft), so the
 * secretary lands back on the show she started with the new club chosen.
 */
export function addYourClubPath(returnTo?: string | null): string {
  const safe = safeReturnPath(returnTo);
  if (!safe) return ADD_YOUR_CLUB_PATH;
  return `/?${new URLSearchParams({ onboarding: 'true', returnTo: safe }).toString()}#get-started`;
}

/**
 * `returnTo` with the new club chosen (`clubId` replaced, never duplicated). `clubCreated=1` is the
 * flag the wizard already reads to tell a just-created club from a chosen one.
 */
export function returnPathWithClub(returnTo: string, clubId: string): string {
  const url = new URL(returnTo, 'http://local.invalid');
  url.searchParams.set('clubId', clubId);
  url.searchParams.set('clubCreated', '1');
  return `${url.pathname}${url.search}${url.hash}`;
}
export const ADD_YOUR_CLUB_PROMPT = "Your club isn't listed? Add your club";
export const FIND_A_SHOW = { label: 'Find a show', to: '/shows' } as const;
// Which calls to action the header and close lead with. Signed-in visitors already have an
// account (they reach the landing only through the club-onboarding return), so they always
// get the club actions; a guest gets the ones for the story they chose.
export function ctaAudience(storyAudience: Audience, signedIn: boolean): Audience {
  return signedIn ? 'club' : storyAudience;
}

// An exhibitor's first step: a free account to enter shows. `short` fits the phone header.
export const CREATE_ACCOUNT = {
  label: 'Create a free account',
  short: 'Create account',
  to: '/sign-up',
} as const;
