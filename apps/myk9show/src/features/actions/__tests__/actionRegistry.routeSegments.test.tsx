import { createRoutesFromChildren, type RouteObject } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { NON_SHOW_ID_SEGMENTS } from '@/features/actions/actionRegistry';
import { PublicRoutes } from '@/routes/publicRoutes';

/**
 * `parseActionRouteContext` treats the segment after `/shows/` as a show id
 * unless it is in `NON_SHOW_ID_SEGMENTS`. That list is hand-written, because
 * importing the route tree into the pure resolver would end its purity — so
 * this test is the thing that keeps it honest.
 *
 * It reads the REAL route tree and fails when a new literal `/shows/<word>`
 * route appears, rather than leaving the next one to be found by a secretary
 * getting six dead links. A declared list checked against the source beats a
 * scan that guesses (LESSONS `comment-satisfies-grep`).
 */
function literalShowChildSegments(): string[] {
  const found: string[] = [];
  const walk = (routes: RouteObject[], prefix: string) => {
    for (const route of routes) {
      const raw = route.path ?? '';
      const path = raw.startsWith('/') ? raw : prefix ? `${prefix}/${raw}` : raw;
      const match = /^\/shows\/([^/:*][^/]*)$/.exec(path);
      if (match?.[1]) found.push(match[1]);
      if (route.children) walk(route.children, path.replace(/\/$/, ''));
    }
  };
  walk(createRoutesFromChildren(PublicRoutes()), '');
  return found;
}

describe('NON_SHOW_ID_SEGMENTS vs the real route tree', () => {
  it('finds the literal segments at all (harness control)', () => {
    // Without this, a walker that silently returned [] would report a clean
    // pass forever — the exact failure this test exists to prevent.
    expect(literalShowChildSegments().length).toBeGreaterThan(0);
  });

  it('covers every literal /shows/<segment> route', () => {
    const uncovered = literalShowChildSegments().filter(
      segment => !NON_SHOW_ID_SEGMENTS.has(segment)
    );
    expect(
      uncovered,
      `these /shows/<segment> routes are not show ids and must be added to NON_SHOW_ID_SEGMENTS: ${uncovered.join(', ')}`
    ).toEqual([]);
  });

  it('lists nothing that is not a real route', () => {
    const real = new Set(literalShowChildSegments());
    for (const segment of NON_SHOW_ID_SEGMENTS) {
      expect(real.has(segment), `${segment} is no longer a route and can be dropped`).toBe(true);
    }
  });
});
