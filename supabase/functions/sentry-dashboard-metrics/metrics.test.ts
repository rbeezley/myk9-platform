import { describe, expect, it, vi } from 'vitest';
import type { HandlerCtx } from '../_shared/http/handler.ts';
import {
  CACHE_TTL_MS,
  createSentryDashboardMetricsHandler,
  type SentryDashboardMetricsDeps,
} from './metrics.ts';

function sentryResponse(value: number, timestamp = 1_700_000_000_000): Response {
  return new Response(
    JSON.stringify({
      timeSeries: [{ values: [{ timestamp, value, incomplete: false }] }],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

function sessionsResponse(value: number): Response {
  return new Response(
    JSON.stringify({
      end: '2023-11-14T22:13:20.000Z',
      intervals: ['2023-11-14T22:13:20.000Z'],
      groups: [{ totals: { 'crash_rate(session)': value } }],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

function makeAdminSupabase(role = 'site_admin') {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    or: vi.fn(() => query),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(resolve({ data: [{ role: { name: role } }], error: null })),
  };

  return {
    from: vi.fn((table: string) => {
      if (table === 'people') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: { id: 'person-1' }, error: null }),
              })),
            })),
          })),
        };
      }
      return query;
    }),
  };
}

function makeDeps(fetch: SentryDashboardMetricsDeps['fetch']): SentryDashboardMetricsDeps {
  return {
    fetch,
    now: () => 1_700_000_100_000,
    organization: 'myk9',
    apiToken: 'sentry-secret-token',
    cache: new Map(),
  };
}

function makeContext(supabase: unknown, userId = 'auth-1') {
  return {
    user: { id: userId },
    supabase,
    body: {},
    req: new Request('https://example.test', { method: 'POST' }),
  } as unknown as HandlerCtx<Record<string, never>>;
}

describe('sentryDashboardMetricsHandler', () => {
  it('authorizes site admins and returns normalized metrics without the API token', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return url.includes('/sessions/') ? sessionsResponse(2.5) : sentryResponse(640);
    });

    const result = await createSentryDashboardMetricsHandler(
      makeContext(makeAdminSupabase()),
      makeDeps(fetch)
    );

    expect(result).toEqual({
      generatedAt: '2023-11-14T22:15:00.000Z',
      window: '24h',
      errorRate: {
        value: 2.5,
        unit: 'percent',
        status: 'fresh',
        observedAt: '2023-11-14T22:13:20.000Z',
      },
      apiP95: {
        value: 640,
        unit: 'milliseconds',
        status: 'fresh',
        observedAt: '2023-11-14T22:13:20.000Z',
      },
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    const errorRequest = fetch.mock.calls.find(([input]) => String(input).includes('/sessions/'));
    const p95Request = fetch.mock.calls.find(([input]) =>
      String(input).includes('events-timeseries')
    );
    expect(String(errorRequest?.[0])).toContain('/api/0/organizations/myk9/sessions/');
    expect(String(errorRequest?.[0])).toContain('field=crash_rate%28session%29');
    expect(String(p95Request?.[0])).toContain('yAxis=p95%28transaction.duration%29');
    expect(errorRequest?.[1]).toEqual({
      headers: { Authorization: 'Bearer sentry-secret-token' },
    });
    expect(JSON.stringify(result)).not.toContain('sentry-secret-token');
  });

  it('caches both metrics for the configured refresh window', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('/sessions/') ? sessionsResponse(10) : sentryResponse(10)
    );
    const deps = makeDeps(fetch);
    const context = makeContext(makeAdminSupabase());

    await createSentryDashboardMetricsHandler(context, deps);
    await createSentryDashboardMetricsHandler(context, deps);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(CACHE_TTL_MS).toBe(60_000);
  });

  it('serves a cached metric as stale when only that upstream query fails', async () => {
    let shouldFailErrorRate = false;
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/sessions/') && shouldFailErrorRate) {
        throw new Error('Sentry is unavailable');
      }
      return String(input).includes('/sessions/') ? sessionsResponse(2.5) : sentryResponse(640);
    });
    const deps = makeDeps(fetch);
    const context = makeContext(makeAdminSupabase());

    await createSentryDashboardMetricsHandler(context, deps);
    shouldFailErrorRate = true;
    deps.now = () => 1_700_000_200_001;

    const result = await createSentryDashboardMetricsHandler(context, deps);

    expect(result.errorRate).toMatchObject({
      value: 2.5,
      status: 'stale',
      observedAt: '2023-11-14T22:13:20.000Z',
      error: 'Sentry metric unavailable',
    });
    expect(result.apiP95).toMatchObject({ value: 640, status: 'fresh' });
  });

  it('fails closed for a non-site-admin caller', async () => {
    const fetch = vi.fn(async () => sentryResponse(1));

    await expect(
      createSentryDashboardMetricsHandler(
        makeContext(makeAdminSupabase('club_admin')),
        makeDeps(fetch)
      )
    ).rejects.toThrow('Unauthorized: requires site_admin role');
    expect(fetch).not.toHaveBeenCalled();
  });
});
