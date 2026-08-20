import { beforeEach, describe, expect, it } from 'vitest';
import {
  fetchSentryDashboardMetrics,
  formatSentryMetricValue,
  getSentryMetricTileState,
  parseSentryDashboardMetrics,
  SENTRY_NOT_CONFIGURED,
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

  it('rejects a metric with the wrong unit or a non-finite value', () => {
    expect(() =>
      parseSentryDashboardMetrics({
        generatedAt: '2026-08-04T18:00:00.000Z',
        window: '24h',
        errorRate: metric({ unit: 'milliseconds' }),
        apiP95: metric({ value: 640, unit: 'milliseconds' }),
      })
    ).toThrow('Invalid Sentry error rate metric');

    expect(() =>
      parseSentryDashboardMetrics({
        generatedAt: '2026-08-04T18:00:00.000Z',
        window: '24h',
        errorRate: metric(),
        apiP95: metric({ value: Number.NaN, unit: 'milliseconds' }),
      })
    ).toThrow('Invalid Sentry client p95 metric');
  });

  it('formats the two metric units honestly', () => {
    expect(formatSentryMetricValue(metric())).toBe('2.5%');
    expect(formatSentryMetricValue(metric({ value: 639.6, unit: 'milliseconds' }))).toBe('640 ms');
  });

  it('warns when the deployed trace sample is too low for a reliable tail', () => {
    expect(
      getSentryMetricTileState(
        metric({ value: 640, unit: 'milliseconds' }),
        'Client p95',
        false,
        null
      )
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

  // MYK9-213: the endpoint degrades on a missing secret rather than 500ing, so
  // the tile is now the only place a misconfiguration is visible. It must not
  // claim a retry will fix something that needs a human to provision a secret.
  it('says a missing config is not configured, rather than promising a retry', () => {
    const state = getSentryMetricTileState(
      metric({ value: null, status: 'unavailable', error: SENTRY_NOT_CONFIGURED }),
      'Client p95',
      false,
      null
    );

    expect(state).toEqual({
      value: '—',
      context: 'not configured — add Sentry credentials',
      isError: true,
      isStale: false,
    });
    expect(state.context).not.toContain('will retry');
  });

  // Regression: the config check must sit ABOVE the status branching. A stale
  // cached value carrying the not-configured reason previously fell through to
  // the stale branch and rendered as a non-error ("using an older reading"),
  // hiding the misconfiguration behind a number that can never refresh.
  it('still flags a missing config when a stale cached value is being served', () => {
    const state = getSentryMetricTileState(
      metric({ value: 640, unit: 'milliseconds', status: 'stale', error: SENTRY_NOT_CONFIGURED }),
      'Client p95',
      false,
      null
    );

    expect(state.isError).toBe(true);
    expect(state.context).toBe('not configured — add Sentry credentials');
    expect(state.context).not.toBe('using an older reading');
    // The cached reading is real data, so it is still shown — just marked stale.
    expect(state.value).toBe('640 ms');
    expect(state.isStale).toBe(true);
  });

  it('still promises a retry when Sentry is merely erroring', () => {
    const state = getSentryMetricTileState(
      metric({ value: null, status: 'unavailable', error: 'Sentry metric unavailable' }),
      'Client p95',
      false,
      null
    );

    // Same status, different cause: this one genuinely can resolve on its own.
    expect(state.context).toBe("couldn't read client p95; will retry");
  });

  it('does not turn unavailable data into zero', () => {
    expect(
      getSentryMetricTileState(
        metric({ value: null, status: 'unavailable' }),
        'Client p95',
        false,
        null
      )
    ).toEqual({
      value: '—',
      context: "couldn't read client p95; will retry",
      isError: true,
      isStale: false,
    });
  });
});
