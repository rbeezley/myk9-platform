import { describe, expect, it } from 'vitest';
import { BENCHMARK_ROUTES, benchmarkRoutesFor, resolveBenchmarkRoutePath } from './benchmarkRoutes';
import { blockedRouteReason, rankSlowestRoutes } from './benchmarkMetrics';

describe('MYK9-843 route matrix', () => {
  it('covers the requested public and authenticated role groups without duplicate ids', () => {
    expect(new Set(BENCHMARK_ROUTES.map(route => route.id)).size).toBe(BENCHMARK_ROUTES.length);
    expect(new Set(BENCHMARK_ROUTES.map(route => route.role))).toEqual(
      new Set(['public', 'exhibitor', 'secretary', 'judge', 'admin'])
    );
    expect(
      BENCHMARK_ROUTES.some(route => route.role === 'secretary' && route.path.endsWith('/show-day'))
    ).toBe(true);
    expect(
      BENCHMARK_ROUTES.some(route => route.role === 'judge' && route.path.startsWith('/at-show/'))
    ).toBe(true);
    expect(BENCHMARK_ROUTES.some(route => route.id === 'exhibitor-cart')).toBe(true);
    expect(BENCHMARK_ROUTES.some(route => route.id === 'secretary-show-day')).toBe(true);
    expect(BENCHMARK_ROUTES.some(route => route.id === 'ringside-scoring')).toBe(true);
  });

  it('rejects a route that escapes the configured app origin', () => {
    expect(() =>
      resolveBenchmarkRoutePath('https://example.com/', 'http://localhost:4173')
    ).toThrow('Benchmark route must stay on the configured origin');
  });

  it('uses a supplied QA show ID for show-scoped routes', () => {
    const routes = benchmarkRoutesFor('custom-show-id', 'custom-class-id');
    expect(routes.find(route => route.id === 'secretary-setup')?.path).toBe(
      '/shows/custom-show-id/setup'
    );
    expect(routes.find(route => route.id === 'ringside-class-picker')?.path).toBe(
      '/at-show/custom-show-id'
    );
    expect(routes.find(route => route.id === 'ringside-scoring')?.path).toBe(
      '/at-show/custom-show-id/class/custom-class-id'
    );
  });

  it('marks redirects as blocked and excludes blocked or incomplete rows from slow-route ranking', () => {
    expect(blockedRouteReason('/admin/users', '/sign-in', 'No authorized admin session')).toContain(
      'Redirected to /sign-in'
    );
    expect(
      rankSlowestRoutes([
        { status: 'measured' as const, timeToUsableMs: 900 },
        { status: 'blocked' as const, timeToUsableMs: 1 },
        { status: 'measured' as const, timeToUsableMs: 1400 },
        { status: 'measured' as const },
      ]).map(sample => sample.timeToUsableMs)
    ).toEqual([1400, 900]);
  });
});
