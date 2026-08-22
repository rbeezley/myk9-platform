import { describe, expect, it } from 'vitest';

import {
  CONTINUOUS_HEALTH_MONITOR_SLUG,
  DAILY_HEALTH_MONITOR_SLUG,
  HEALTH_CHECK_MODE_HEADER,
  HEALTH_RUN_TOKEN_HEADER,
  resolveHealthCheckRun,
} from './healthCheckRun';

const run = (headers: Record<string, string>) => resolveHealthCheckRun(new Headers(headers));

describe('resolveHealthCheckRun', () => {
  it('routes the every-5-minutes continuous run to its own monitor', () => {
    expect(run({ [HEALTH_CHECK_MODE_HEADER]: 'continuous' })).toEqual({
      mode: 'continuous',
      runToken: null,
      monitorSlug: CONTINUOUS_HEALTH_MONITOR_SLUG,
    });
  });

  it('routes the 07:00 nightly full run to the daily monitor', () => {
    expect(run({ [HEALTH_CHECK_MODE_HEADER]: 'full' })).toEqual({
      mode: 'full',
      runToken: null,
      monitorSlug: DAILY_HEALTH_MONITOR_SLUG,
    });
  });

  it('routes a manual Run now full run to the daily monitor so it can clear a page', () => {
    const token = '8b0f1f4e-1f2a-4a3b-9c0d-6f5e4d3c2b1a';
    expect(
      run({ [HEALTH_CHECK_MODE_HEADER]: 'full', [HEALTH_RUN_TOKEN_HEADER]: token })
    ).toEqual({ mode: 'full', runToken: token, monitorSlug: DAILY_HEALTH_MONITOR_SLUG });
  });

  it('never leaves a run unmonitored, whatever the headers say', () => {
    const cases: Record<string, string>[] = [
      {},
      { [HEALTH_CHECK_MODE_HEADER]: '' },
      { [HEALTH_CHECK_MODE_HEADER]: 'CONTINUOUS' },
      { [HEALTH_CHECK_MODE_HEADER]: 'continous' }, // typo: reads as full, still monitored
      { [HEALTH_RUN_TOKEN_HEADER]: 'orphan-token' },
    ];
    for (const headers of cases) {
      expect(run(headers).monitorSlug).toBeTruthy();
    }
  });

  it('treats only the exact lowercase sentinel as continuous', () => {
    // Header NAMES are case-insensitive per the Headers spec; the VALUE is not.
    expect(run({ 'X-Health-Check-Mode': 'continuous' }).mode).toBe('continuous');
    expect(run({ [HEALTH_CHECK_MODE_HEADER]: 'Continuous' }).mode).toBe('full');
  });

  it('pins the header names the pg_cron job bodies actually send', () => {
    // These strings are duplicated into SQL. continuousHealthCheckContract.test.ts
    // asserts the migration side; this is the other half of that cross-check.
    expect(HEALTH_CHECK_MODE_HEADER).toBe('x-health-check-mode');
    expect(HEALTH_RUN_TOKEN_HEADER).toBe('x-health-run-token');
  });

  it('keeps the two monitor slugs distinct', () => {
    expect(DAILY_HEALTH_MONITOR_SLUG).toBe('daily-health-check');
    expect(CONTINUOUS_HEALTH_MONITOR_SLUG).toBe('continuous-health-check');
    expect(DAILY_HEALTH_MONITOR_SLUG).not.toBe(CONTINUOUS_HEALTH_MONITOR_SLUG);
  });
});
