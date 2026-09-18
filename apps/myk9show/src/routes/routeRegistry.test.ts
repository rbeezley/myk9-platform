import { describe, expect, it } from 'vitest';
import { fullRouteRegistry } from './routeRegistry';
import { router } from '../router';

function flattenRoutePaths(routes: typeof router.routes, parentPath = ''): string[] {
  return routes.flatMap(route => {
    const path = route.path ? joinRoutePaths(parentPath, route.path) : parentPath;
    return [path, ...flattenRoutePaths(route.children ?? [], path)];
  });
}

function joinRoutePaths(parentPath: string, childPath: string): string {
  if (childPath.startsWith('/')) return childPath;
  return `${parentPath}/${childPath}`.replace(/\/+/g, '/');
}

function routePatternSignature(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map(segment => (segment.startsWith(':') ? ':' : segment === '*' ? '*' : segment))
    .join('/');
}

describe('routeRegistry', () => {
  it('registers only paths declared in the application route tree', () => {
    const declaredSignatures = new Set(flattenRoutePaths(router.routes).map(routePatternSignature));
    const undeclared = Object.keys(fullRouteRegistry).filter(
      path => !declaredSignatures.has(routePatternSignature(path))
    );

    expect(undeclared).toEqual([]);
  });

  it('registers the canonical secretary show creation wizard route', () => {
    expect(fullRouteRegistry['/secretary/create-show/wizard']).toBeDefined();
    expect(fullRouteRegistry['/secretary/classes']).toBeUndefined();
    expect(fullRouteRegistry['/secretary/run-order']).toBeUndefined();
  });

  it('registers canonical show management route patterns', () => {
    expect(fullRouteRegistry['/shows/:showId/setup']).toBeDefined();
    expect(fullRouteRegistry['/shows/:showId/show-day']).toBeDefined();
    expect(fullRouteRegistry['/shows/:showId/results']).toBeDefined();
  });

  it('registers legacy secretary show redirect patterns without retired subroutes', () => {
    expect(fullRouteRegistry['/secretary/shows/:showId']).toBeDefined();
    expect(fullRouteRegistry['/secretary/shows/:showId/*']).toBeDefined();
    // The RETIRED spelling, on purpose: this asserts a subroute that once
    // existed is gone. MYK9-630 phase 2's mass repoint rewrote it to
    // `/results`, a path that never existed under `/secretary/shows/`, turning
    // a retirement guard into a vacuous assertion. Both are checked now.
    expect(fullRouteRegistry['/secretary/shows/:showId/results-control']).toBeUndefined();
    expect(fullRouteRegistry['/secretary/shows/:showId/results']).toBeUndefined();
  });
});
