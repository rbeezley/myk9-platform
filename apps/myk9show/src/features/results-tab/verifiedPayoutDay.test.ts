import { describe, expect, it } from 'vitest';

import { verifiedPayoutDay } from './verifiedPayoutDay';

const show = { endDate: '2026-12-02T00:00:00Z' };

describe('verifiedPayoutDay', () => {
  it('withholds the date while the show is a cached placeholder, then returns it once verified', () => {
    expect(verifiedPayoutDay({ show, isFromCache: true, refreshFailed: false })).toBeNull();
    expect(verifiedPayoutDay({ show, isFromCache: false, refreshFailed: false })).toBe(
      '2026-12-02'
    );
  });

  it('withholds the date after a failed refresh', () => {
    expect(verifiedPayoutDay({ show, isFromCache: false, refreshFailed: true })).toBeNull();
  });

  it('has no date for no show or no end date', () => {
    expect(verifiedPayoutDay({ show: null, isFromCache: false, refreshFailed: false })).toBeNull();
    expect(
      verifiedPayoutDay({ show: { endDate: null }, isFromCache: false, refreshFailed: false })
    ).toBeNull();
  });
});
