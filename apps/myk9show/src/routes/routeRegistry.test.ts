import { describe, expect, it } from 'vitest';
import {
  getRouteImportFunction,
  navigationPatterns,
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

  it('resolves the secretary show workbench parameterized route', () => {
    expect(secretaryRouteComponents['/secretary/shows/:showId']).toBeDefined();
    expect(getRouteImportFunction('/secretary/shows/show-42')).toBe(
      secretaryRouteComponents['/secretary/shows/:showId']
    );
  });
});
