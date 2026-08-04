import { beforeEach, describe, expect, it } from 'vitest';
import {
  fetchSentryDashboardMetrics,
  formatSentryMetricValue,
  getSentryMetricTileState,
  parseSentryDashboardMetrics,
  type SentryMetricResult,
} from './sentryDashboardMetrics';
import { mockSupabase } from '@/test/mocks/supabase';

const metric = (overrides: Partial<SentryMetricResult> = {}): SentryMetricResult => ({
  value: 2.5,
  unit: 'percent',
  status: 'fresh',
  observedAt: '2026-08-04T18:00:00.000Z',
  ...overrides,
});

describe('sentryDashboardMetrics', () => {
  beforeEach(() => {
    mockSupabase.functions.invoke.mockReset();
  });

  it('invokes the authenticated proxy and validates its response', async () => {
    mockSupabase.functions.invoke.mockResolvedValue({
      data: {
        generatedAt: '2026-08-04T18:00:00.000Z',
        window: '24h',
        errorRate: metric(),
        apiP95: metric({ value: 640, unit: 'milliseconds' }),
      },
      error: null,
    });

    await expect(fetchSentryDashboardMetrics()).resolves.toMatchObject({ window: '24h' });
    expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('sentry-dashboard-metrics', {
      body: {},
    });
  });

  it('validates the normalized proxy response', () => {
    expect(
      parseSentryDashboardMetrics({
        generatedAt: '2026-08-04T18:00:00.000Z',
        window: '24h',
        errorRate: metric(),
        apiP95: metric({ value: 640, unit: 'milliseconds' }),
      })
    ).toMatchObject({ window: '24h', errorRate: { value: 2.5 }, apiP95: { value: 640 } });
  });

  it('rejects malformed or unitless metrics', () => {
    expect(() => parseSentryDashboardMetrics({ window: '24h' })).toThrow(
      'Invalid Sentry metrics response'
    );
    expect(formatSentryMetricValue(metric({ value: null }))).toBe('—');
  });

  it('formats the two metric units honestly', () => {
    expect(formatSentryMetricValue(metric())).toBe('2.5%');
    expect(formatSentryMetricValue(metric({ value: 639.6, unit: 'milliseconds' }))).toBe('640 ms');
  });

  it('warns when the deployed trace sample is too low for a reliable tail', () => {
    expect(
      getSentryMetricTileState(metric({ value: 640, unit: 'milliseconds' }), 'API p95', false, null)
    ).toMatchObject({ context: 'time users experienced · low sampling (5%)' });
  });

  it('keeps stale data visible but explains that it is stale', () => {
    expect(
      getSentryMetricTileState(metric({ status: 'stale' }), 'Error rate', false, null)
    ).toEqual({
      value: '2.5%',
      context: 'using an older reading',
      isError: false,
      isStale: true,
    });
  });

  it('does not turn unavailable data into zero', () => {
    expect(
      getSentryMetricTileState(
        metric({ value: null, status: 'unavailable' }),
        'API p95',
        false,
        null
      )
    ).toEqual({
      value: '—',
      context: "couldn't read api p95",
      isError: true,
      isStale: false,
    });
  });
});
