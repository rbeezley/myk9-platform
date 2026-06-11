import { describe, expect, it } from 'vitest';
import {
  getRouteImportFunction,
  navigationPatterns,
  publicRouteComponents,
  secretaryRouteComponents,
} from './routeRegistry';

describe('routeRegistry', () => {
  it('registers the canonical secretary show creation wizard route', () => {
    expect(secretaryRouteComponents['/secretary/create-show/wizard']).toBeDefined();
    expect(secretaryRouteComponents['/secretary/classes']).toBeUndefined();
  });

  it('preloads the canonical show creation route from the secretary dashboard', () => {
    expect(navigationPatterns.secretaryDashboard).toContain('/secretary/create-show/wizard');
    expect(navigationPatterns.secretaryDashboard).not.toContain('/secretary/classes');
  });

  it('resolves canonical show management parameterized routes', () => {
    expect(publicRouteComponents['/shows/:id/results-control']).toBeDefined();
    expect(getRouteImportFunction('/shows/show-42/results-control')).toBe(
      publicRouteComponents['/shows/:id/results-control']
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
});
