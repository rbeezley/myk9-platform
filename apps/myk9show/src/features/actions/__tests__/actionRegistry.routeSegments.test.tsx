import { createRoutesFromChildren, type RouteObject } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { isShowShellMountedPath, NON_SHOW_ID_SEGMENTS } from '@/features/actions/actionRegistry';
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

/**
 * `ShowManagementShell` is the ELEMENT at `/shows/:id`, and it is the only
 * consumer of `?edit=true`. So "is the shell mounted here" is answerable from
 * the route tree itself: every route nested under `/shows/:id` has it, every
 * sibling `/shows/...` route does not. This reads that, rather than trusting
 * `SHELL_MOUNTED_CHILD_SEGMENTS` to have kept up.
 */
function showRouteShape() {
  const roots = createRoutesFromChildren(PublicRoutes());
  const showRoute = roots.find(route => route.path === '/shows/:id');
  const nested: string[] = [];
  const walk = (routes: RouteObject[], prefix: string) => {
    for (const route of routes) {
      const path = `${prefix}/${route.path ?? ''}`.replace(/\/+$/, '');
      if (route.path) nested.push(path);
      if (route.children) walk(route.children, path);
    }
  };
  if (showRoute?.children) walk(showRoute.children, '/shows/:id');

  const siblings = roots
    .map(route => route.path ?? '')
    .filter(path => /^\/shows\/:[^/]+\/.+/.test(path));

  return { nested, siblings };
}

const withIds = (path: string) =>
  path.replace(/:[A-Za-z]+/g, segment =>
    segment === ':id' || segment === ':showId' ? 'show-1' : 'x1'
  );

describe('isShowShellMountedPath vs the real route tree', () => {
  it('finds both nested children and siblings (harness control)', () => {
    const { nested, siblings } = showRouteShape();
    expect(nested.length).toBeGreaterThan(0);
    expect(siblings.length).toBeGreaterThan(0);
  });

  it('says mounted for /shows/:id and every route nested under it', () => {
    const { nested } = showRouteShape();
    expect(isShowShellMountedPath('/shows/show-1')).toBe(true);
    for (const path of nested) {
      expect(isShowShellMountedPath(withIds(path)), path).toBe(true);
    }
  });

  it('says NOT mounted for every sibling /shows route', () => {
    const { siblings } = showRouteShape();
    for (const path of siblings) {
      expect(isShowShellMountedPath(withIds(path)), path).toBe(false);
    }
  });
});
