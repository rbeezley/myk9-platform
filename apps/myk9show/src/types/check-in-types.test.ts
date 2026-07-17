import { describe, it, expect } from 'vitest';
import {
  getCheckInStatusMetadata,
  CHECK_IN_STATUS_METADATA,
  type CheckInStatus,
} from './check-in-types';

describe('getCheckInStatusMetadata', () => {
  it('returns the matching metadata for a known status', () => {
    expect(getCheckInStatusMetadata('checked-in')).toBe(CHECK_IN_STATUS_METADATA['checked-in']);
    expect(getCheckInStatusMetadata('no-status')).toBe(CHECK_IN_STATUS_METADATA['no-status']);
  });

  it('keeps only workflow metadata for every known status', () => {
    for (const status of Object.keys(CHECK_IN_STATUS_METADATA) as CheckInStatus[]) {
      const metadata = getCheckInStatusMetadata(status);
      expect(metadata).toMatchObject({ status });
      expect(metadata.description).toBeTruthy();
      expect(metadata.priority).toEqual(expect.any(Number));
      expect(metadata).not.toHaveProperty('label');
      expect(metadata).not.toHaveProperty('color');
      expect(metadata).not.toHaveProperty('backgroundColor');
      expect(metadata).not.toHaveProperty('borderColor');
      expect(metadata).not.toHaveProperty('icon');
    }
  });

  it('falls back to neutral no-status metadata for an unmapped value', () => {
    const rogue = 'totally-unknown-status' as CheckInStatus;
    const metadata = getCheckInStatusMetadata(rogue);

    expect(metadata).toBe(CHECK_IN_STATUS_METADATA['no-status']);
  });

  it('falls back for empty / null-coerced values', () => {
    expect(getCheckInStatusMetadata('' as CheckInStatus)).toBe(
      CHECK_IN_STATUS_METADATA['no-status']
    );
    expect(getCheckInStatusMetadata(null as unknown as CheckInStatus)).toBe(
      CHECK_IN_STATUS_METADATA['no-status']
    );
    expect(getCheckInStatusMetadata(undefined as unknown as CheckInStatus)).toBe(
      CHECK_IN_STATUS_METADATA['no-status']
    );
  });
});
