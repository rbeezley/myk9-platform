import { describe, expect, it } from 'vitest';

import { expectedRoutePath, routePathMatches } from './routePathContract';

describe('route-health path contract', () => {
  it('requires an exact canonical destination for a compatibility redirect', () => {
    const route = {
      path: '/shows/show-1/setup',
      expectedPath: '/shows/show-1',
      pathMatch: 'exact' as const,
    };

    expect(expectedRoutePath(route)).toBe('/shows/show-1');
    expect(routePathMatches(route, '/shows/show-1')).toBe(true);
    expect(routePathMatches(route, '/shows/show-1/setup')).toBe(false);
  });

  it('uses segment-aware prefix matching for ordinary routes', () => {
    const route = { path: '/shows/show-1?tab=entries' };

    expect(expectedRoutePath(route)).toBe('/shows/show-1');
    expect(routePathMatches(route, '/shows/show-1/entry-management')).toBe(true);
    expect(routePathMatches(route, '/shows/show-10')).toBe(false);
  });

  it('matches the root route exactly', () => {
    expect(routePathMatches({ path: '/' }, '/')).toBe(true);
    expect(routePathMatches({ path: '/' }, '/shows')).toBe(false);
  });
});
