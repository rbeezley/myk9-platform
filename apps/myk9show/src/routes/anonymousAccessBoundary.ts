export const ANONYMOUS_PUBLIC_ROUTE_POLICY = [
  { path: '/shows', reason: 'Show discovery for prospective exhibitors.' },
  { path: '/shows/:id', reason: 'Show premium and offered-classes preview.' },
  {
    path: '/shows/:showId/trials/:trialId/classes/:classId/results',
    reason: 'Released public results share link.',
  },
  { path: '/clubs', reason: 'Club discovery; this is not personal entry data.' },
  { path: '/clubs/:id', reason: 'Public club profile and discovery.' },
  { path: '/tv/:showId', reason: 'Venue TV run-order display.' },
  { path: '/sign-in', reason: 'Authentication entry point.' },
  { path: '/sign-up', reason: 'Account creation entry point.' },
  { path: '/terms', reason: 'Public legal disclosure.' },
  { path: '/privacy', reason: 'Public legal disclosure.' },
  { path: '/sms', reason: 'Public SMS opt-in disclosure.' },
  { path: '/fees', reason: 'Shareable service-fee explanation.' },
  { path: '/help/credentials', reason: 'Public sign-in recovery help.' },
  { path: '/prototype/show', reason: 'Development-only prototype route.' },
] as const;
