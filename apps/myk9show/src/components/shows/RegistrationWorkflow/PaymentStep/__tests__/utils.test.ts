/**
 * Tests for PaymentStep fee calculation.
 *
 * Covers the two regressions fixed during the 2026-04-23 entries-wizard harden:
 * - A legitimately-free class (fee === 0) must not silently fall back to $25
 * - show.startDate in YYYY-MM-DD must parse as local midnight so the day-of-show
 *   tier doesn't trigger a day early in negative timezones
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { getShowEntryFee, type ShowFeeInfo } from '../utils';

describe('getShowEntryFee — zero-fee handling', () => {
  it('returns 0 (not $25) when classEntryFee is explicitly 0 and no show info', () => {
    expect(getShowEntryFee(undefined, 0)).toBe(0);
  });

  it('returns $25 default when classEntryFee is undefined and no show info', () => {
    expect(getShowEntryFee(undefined, undefined)).toBe(25);
  });

  it('respects a $0 show pre-entry fee', () => {
    const show: ShowFeeInfo = {
      startDate: '2099-01-01',
      preEntryFee: '$0',
    };
    expect(getShowEntryFee(show, 25)).toBe(0);
  });

  it('falls through to class fee when show fees parse to NaN', () => {
    const show: ShowFeeInfo = {
      startDate: '2099-01-01',
      preEntryFee: 'free',
    };
    expect(getShowEntryFee(show, 0)).toBe(0);
  });
});

describe('getShowEntryFee — timezone-safe date comparison', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('treats "YYYY-MM-DD" startDate as local midnight, not UTC', () => {
    // Simulate a negative timezone (e.g. America/Los_Angeles) where
    // `new Date("2026-05-01")` would be 2026-04-30T17:00 local. Without the
    // local-midnight fix, that would make a show "in the past" a day early.
    // We stub `Date` to run as if "today" is 2026-04-30T23:00 local.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 30, 23, 0, 0)); // month is 0-indexed: April 30

    const show: ShowFeeInfo = {
      startDate: '2026-05-01',
      preEntryFee: '$25',
      dayOfShowFee: '$40',
    };

    // On 2026-04-30 local, show hasn't started yet → pre-entry fee ($25)
    // If the bug were present, showStart would parse as 2026-05-01T00:00 UTC =
    // 2026-04-30T17:00 local, and `now >= showStart` would be true → $40.
    expect(getShowEntryFee(show)).toBe(25);
  });

  it('triggers day-of-show fee on the actual start date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 1, 9, 0, 0)); // May 1, 2026 at 9am local

    const show: ShowFeeInfo = {
      startDate: '2026-05-01',
      preEntryFee: '$25',
      dayOfShowFee: '$40',
    };

    expect(getShowEntryFee(show)).toBe(40);
  });
});
