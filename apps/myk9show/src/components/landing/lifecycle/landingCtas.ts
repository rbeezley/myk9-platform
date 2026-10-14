import type { Audience } from './lifecycleStories';

// The single source for landing CTA labels, targets and order: clubs first.
export const ADD_YOUR_CLUB = { label: 'Add your club', href: '#get-started' } as const;
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
