import { describe, expect, it } from 'vitest';
import { HEALTH_COVERAGE_SURFACES } from './healthCoverage';
import {
  HEALTH_CHECK_INTERVAL_MS,
  healthCheckStaleAfterMs,
  shouldRunHealthCheck,
} from './healthCheckCadence';

describe('daily ACL cadence', () => {
  it.each(['anon_grants', 'applied_acl_grants', 'public_schema_create_acl'])(
    '%s has a 48h stale window and stays outside continuous measurement',
    key => {
      expect(healthCheckStaleAfterMs(key)).toBe(48 * 60 * 60 * 1000);
      expect(shouldRunHealthCheck(key, 'continuous')).toBe(false);
      expect(shouldRunHealthCheck(key, 'full')).toBe(true);
    }
  );
  it('provides cadence for every scheduled coverage key', () => {
    const missing = HEALTH_COVERAGE_SURFACES.flatMap(surface =>
      surface.checkKey && !Object.hasOwn(HEALTH_CHECK_INTERVAL_MS, surface.checkKey)
        ? [surface.checkKey]
        : []
    );
    expect(missing).toEqual([]);
  });
  it('retains the legacy 26h window for unknown checks', () => {
    expect(healthCheckStaleAfterMs('legacy_probe')).toBe(26 * 60 * 60 * 1000);
  });
});
