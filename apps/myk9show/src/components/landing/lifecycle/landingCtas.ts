// The single source for landing CTA labels, targets and order: clubs first.
export const ADD_YOUR_CLUB = { label: 'Add your club', href: '#get-started' } as const;
export const FIND_A_SHOW = { label: 'Find a show', to: '/shows' } as const;
// An exhibitor's first step: a free account to enter shows. `short` fits the phone header.
export const CREATE_ACCOUNT = {
  label: 'Create a free account',
  short: 'Create account',
  to: '/sign-up',
} as const;
