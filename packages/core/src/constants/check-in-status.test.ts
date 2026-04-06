import { describe, it, expect } from 'vitest';
import {
  CHECKIN_STATUSES,
  EXHIBITOR_ALLOWED_STATUSES,
  getCheckinStatusConfig,
  isCheckInStatus,
  isExhibitorAllowedStatus,
  isEntryStatus,
} from './check-in-status';
import type { CheckInStatus } from './check-in-status';

describe('getCheckinStatusConfig', () => {
  it('returns config for a valid status value', () => {
    const config = getCheckinStatusConfig('checked-in');
    expect(config).toBeDefined();
    expect(config?.value).toBe('checked-in');
  });

  it('returns undefined for an unknown status', () => {
    expect(getCheckinStatusConfig('not-a-status')).toBeUndefined();
  });

  it('returns config for every known status', () => {
    for (const status of CHECKIN_STATUSES) {
      expect(getCheckinStatusConfig(status)).toBeDefined();
    }
  });
});

describe('isCheckInStatus', () => {
  it('returns true for all valid statuses', () => {
    for (const status of CHECKIN_STATUSES) {
      expect(isCheckInStatus(status)).toBe(true);
    }
  });

  it('returns false for an unknown string', () => {
    expect(isCheckInStatus('unknown-status')).toBe(false);
    expect(isCheckInStatus('')).toBe(false);
  });
});

describe('isEntryStatus (deprecated alias)', () => {
  it('behaves identically to isCheckInStatus', () => {
    expect(isEntryStatus('checked-in')).toBe(true);
    expect(isEntryStatus('bogus')).toBe(false);
  });
});

describe('isExhibitorAllowedStatus', () => {
  it('returns true for exhibitor-allowed statuses', () => {
    for (const status of EXHIBITOR_ALLOWED_STATUSES) {
      expect(isExhibitorAllowedStatus(status)).toBe(true);
    }
  });

  it('returns false for statuses that are not exhibitor-allowed', () => {
    const notAllowed = CHECKIN_STATUSES.filter(
      s => !(EXHIBITOR_ALLOWED_STATUSES as readonly CheckInStatus[]).includes(s)
    );
    for (const status of notAllowed) {
      expect(isExhibitorAllowedStatus(status)).toBe(false);
    }
  });
});
