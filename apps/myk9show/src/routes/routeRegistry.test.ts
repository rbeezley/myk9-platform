import { describe, expect, it } from 'vitest';
import {
  getRouteImportFunction,
  fullRouteRegistry,
  navigationPatterns,
  publicRouteComponents,
  secretaryRouteComponents,
} from './routeRegistry';
import { router } from '../router';

function flattenRoutePaths(
  routes: typeof router.routes,
  parentPath = ''
): string[] {
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
    const declaredSignatures = new Set(
      flattenRoutePaths(router.routes).map(routePatternSignature)
    );
    const undeclared = Object.keys(fullRouteRegistry).filter(
      path => !declaredSignatures.has(routePatternSignature(path))
    );

    expect(undeclared).toEqual([]);
  });

  it('registers the canonical secretary show creation wizard route', () => {
    expect(secretaryRouteComponents['/secretary/create-show/wizard']).toBeDefined();
    expect(secretaryRouteComponents['/secretary/classes']).toBeUndefined();
    expect(secretaryRouteComponents['/secretary/run-order']).toBeUndefined();
  });

  it('preloads the canonical show creation route from the secretary dashboard', () => {
    expect(navigationPatterns.secretaryDashboard).toContain('/secretary/create-show/wizard');
    expect(navigationPatterns.secretaryDashboard).not.toContain('/secretary/classes');
  });

  it('resolves canonical show management parameterized routes', () => {
    expect(publicRouteComponents['/shows/:showId/setup']).toBeDefined();
    expect(publicRouteComponents['/shows/:showId/show-desk']).toBeDefined();
    expect(publicRouteComponents['/shows/:showId/results-control']).toBeDefined();
    expect(getRouteImportFunction('/shows/show-42/setup')).toBe(
      publicRouteComponents['/shows/:showId/setup']
    );
    expect(getRouteImportFunction('/shows/show-42/show-desk')).toBe(
      publicRouteComponents['/shows/:showId/show-desk']
    );
    expect(getRouteImportFunction('/shows/show-42/results-control')).toBe(
      publicRouteComponents['/shows/:showId/results-control']
    );
  });

  it('resolves legacy secretary show routes to redirect helpers', () => {
    expect(secretaryRouteComponents['/secretary/shows/:showId']).toBeDefined();
    expect(secretaryRouteComponents['/secretary/shows/:showId/*']).toBeDefined();
    expect(secretaryRouteComponents['/secretary/shows/:showId/results-control']).toBeUndefined();
    expect(getRouteImportFunction('/secretary/shows/show-42')).toBe(
      secretaryRouteComponents['/secretary/shows/:showId']
    );
    expect(getRouteImportFunction('/secretary/shows/show-42/legacy/path')).toBe(
      secretaryRouteComponents['/secretary/shows/:showId/*']
    );
  });

  it('does not preload legacy standalone run order as a direct page', () => {
    expect(getRouteImportFunction('/secretary/run-order')).toBeNull();
  });
});
