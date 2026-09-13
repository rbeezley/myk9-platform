import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ANONYMOUS_PUBLIC_ROUTE_POLICY } from './anonymousAccessBoundary';

const publicRoutesSource = readFileSync(
  resolve(__dirname, 'publicRoutes.tsx'),
  'utf8'
);

function routeBlock(path: string): string {
  const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return publicRoutesSource.match(
    new RegExp(`path="${escapedPath}"[\\s\\S]*?(?=\\n    <Route|\\n  </>)`)
  )?.[0] ?? '';
}

describe('anonymous access boundary', () => {
  it('pins the deliberate anonymous route set and its reason for existence', () => {
    expect(ANONYMOUS_PUBLIC_ROUTE_POLICY).toEqual([
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
    ]);
  });

  it('keeps entry-bearing trial and class routes behind the boundary', () => {
    expect(routeBlock('/shows/:showId/trials/:trialId')).toContain('<ProtectedRoute>');
    expect(routeBlock('/shows/:showId/trials/:trialId/classes/:classId')).toContain(
      '<ProtectedRoute>'
    );
    expect(routeBlock('/shows/:showId/trials/:trialId/classes/:classId/results')).not.toContain(
      '<ProtectedRoute>'
    );
  });
});
