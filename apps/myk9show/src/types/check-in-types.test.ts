import { describe, it, expect } from 'vitest';
import {
  getCheckInStatusConfig,
  CHECK_IN_STATUS_CONFIG,
  type CheckInStatus,
} from './check-in-types';

describe('getCheckInStatusConfig', () => {
  it('returns the matching config for a known status', () => {
    expect(getCheckInStatusConfig('checked-in')).toBe(CHECK_IN_STATUS_CONFIG['checked-in']);
    expect(getCheckInStatusConfig('no-status')).toBe(CHECK_IN_STATUS_CONFIG['no-status']);
  });

  it('returns a defined config (never undefined) for every known status', () => {
    for (const status of Object.keys(CHECK_IN_STATUS_CONFIG) as CheckInStatus[]) {
      const config = getCheckInStatusConfig(status);
      expect(config).toBeDefined();
      // The styling fields the UI dereferences must always be present.
      expect(config.backgroundColor).toBeTruthy();
      expect(config.borderColor).toBeTruthy();
      expect(config.color).toBeTruthy();
    }
  });

  it('falls back to the neutral no-status config for an unmapped value', () => {
    // Simulate a legacy DB row / future status / coerced null that escapes the union.
    const rogue = 'totally-unknown-status' as CheckInStatus;
    const config = getCheckInStatusConfig(rogue);

    expect(config).toBeDefined();
    expect(config).toBe(CHECK_IN_STATUS_CONFIG['no-status']);
    // Crash site in CheckInStatusIndicator: these reads must not throw.
    expect(config.backgroundColor).toBe('bg-gray-100');
    expect(config.borderColor).toBe('border-gray-200');
    expect(config.color).toBe('text-gray-500');
  });

  it('falls back for empty / null-coerced values', () => {
    expect(getCheckInStatusConfig('' as CheckInStatus)).toBe(CHECK_IN_STATUS_CONFIG['no-status']);
    expect(getCheckInStatusConfig(null as unknown as CheckInStatus)).toBe(
      CHECK_IN_STATUS_CONFIG['no-status']
    );
    expect(getCheckInStatusConfig(undefined as unknown as CheckInStatus)).toBe(
      CHECK_IN_STATUS_CONFIG['no-status']
    );
  });
});
