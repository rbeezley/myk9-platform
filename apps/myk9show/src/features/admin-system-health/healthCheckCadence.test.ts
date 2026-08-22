import { describe, expect, it } from 'vitest';

import {
  CONTINUOUS_HEALTH_CHECK_KEYS,
  isDailyMonitorRun,
  shouldRunHealthCheck,
} from './healthCheckCadence';

describe('isDailyMonitorRun', () => {
  it('reports the 07:00 UTC scheduled full run', () => {
    expect(isDailyMonitorRun('full', null)).toBe(true);
  });

  it('excludes every five-minute continuous run', () => {
    expect(isDailyMonitorRun('continuous', null)).toBe(false);
  });

  it('excludes a manual Run now full run, which carries a run token', () => {
    expect(isDailyMonitorRun('full', '8b0f1f4e-1f2a-4a3b-9c0d-6f5e4d3c2b1a')).toBe(false);
    // An empty header value is not a real token; treat it as the scheduled run.
    expect(isDailyMonitorRun('full', '')).toBe(true);
  });
});

describe('shouldRunHealthCheck', () => {
  it('runs every key on a full run', () => {
    expect(shouldRunHealthCheck('anon_grants', 'full')).toBe(true);
    expect(shouldRunHealthCheck('applied_acl_grants', 'full')).toBe(true);
  });

  it('runs only the continuous keys on a continuous run', () => {
    for (const key of CONTINUOUS_HEALTH_CHECK_KEYS) {
      expect(shouldRunHealthCheck(key, 'continuous')).toBe(true);
    }
    expect(shouldRunHealthCheck('anon_grants', 'continuous')).toBe(false);
    expect(shouldRunHealthCheck('applied_acl_grants', 'continuous')).toBe(false);
  });
});
