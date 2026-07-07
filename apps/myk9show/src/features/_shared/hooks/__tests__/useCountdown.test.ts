import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { isCountdownTargetClosed, useCountdown } from '../useCountdown';

const originalTimezone = process.env.TZ;

beforeEach(() => {
  // Viewer's own local timezone — deliberately different from the show
  // timezones used below, so a test that accidentally reads the viewer's
  // clock instead of the `timezone` argument would fail.
  process.env.TZ = 'America/Los_Angeles';
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  if (originalTimezone) {
    process.env.TZ = originalTimezone;
  } else {
    delete process.env.TZ;
  }
});

describe('useCountdown', () => {
  it('closes at end-of-day in the SHOW timezone, not the viewer local timezone', () => {
    // Aug 1 23:59:59 America/New_York = Aug 2 03:59:59 UTC.
    // Aug 1 23:59:59 America/Los_Angeles (viewer) = Aug 2 06:59:59 UTC.
    // Pick a system time inside that gap: the show has closed, but a
    // viewer-local calculation would still call it open for three more hours.
    vi.setSystemTime(new Date('2026-08-02T05:00:00Z'));
    const { result } = renderHook(() => useCountdown('2026-08-01', 'America/New_York'));
    expect(result.current.closed).toBe(true);
  });

  it('is not closed yet at the same instant for a show in the viewer local timezone', () => {
    // Same instant as above, but the show itself is in the viewer's zone —
    // confirms the difference above is driven by the `timezone` argument,
    // not some other side effect of the fixed system time.
    vi.setSystemTime(new Date('2026-08-02T05:00:00Z'));
    const { result } = renderHook(() => useCountdown('2026-08-01', 'America/Los_Angeles'));
    expect(result.current.closed).toBe(false);
  });

  it('is not closed at noon show-local time on the close date itself', () => {
    // Noon Aug 1 America/New_York = 16:00 UTC.
    vi.setSystemTime(new Date('2026-08-01T16:00:00Z'));
    const { result } = renderHook(() => useCountdown('2026-08-01', 'America/New_York'));
    expect(result.current.closed).toBe(false);
    expect(result.current.hasTarget).toBe(true);
  });

  it('is not closed one second before show-local end-of-day on the close date', () => {
    // Aug 1 23:59:59 America/New_York = Aug 2 03:59:59 UTC.
    vi.setSystemTime(new Date('2026-08-02T03:59:59Z'));
    const { result } = renderHook(() => useCountdown('2026-08-01', 'America/New_York'));
    expect(result.current.closed).toBe(false);
  });

  it('is closed the moment show-local end-of-day on the close date has passed', () => {
    vi.setSystemTime(new Date('2026-08-02T04:00:00Z'));
    const { result } = renderHook(() => useCountdown('2026-08-01', 'America/New_York'));
    expect(result.current.closed).toBe(true);
  });

  it('treats a full ISO instant as an exact cutoff, not end-of-day', () => {
    vi.setSystemTime(new Date('2026-08-01T13:00:00Z'));
    const { result } = renderHook(() => useCountdown('2026-08-01T12:00:00Z', 'America/New_York'));
    expect(result.current.closed).toBe(true);
  });

  it('reports no target when entryCloseDate is null', () => {
    const { result } = renderHook(() => useCountdown(null, 'America/New_York'));
    expect(result.current.hasTarget).toBe(false);
    expect(result.current.closed).toBe(false);
  });
});

describe('isCountdownTargetClosed', () => {
  it('matches the show-timezone end-of-day cutoff without mounting the countdown hook', () => {
    expect(
      isCountdownTargetClosed(
        '2026-08-01',
        'America/New_York',
        new Date('2026-08-02T04:00:00Z').getTime()
      )
    ).toBe(true);
    expect(
      isCountdownTargetClosed(
        '2026-08-01',
        'America/Los_Angeles',
        new Date('2026-08-02T04:00:00Z').getTime()
      )
    ).toBe(false);
  });

  it('fails open when no close date is set', () => {
    expect(isCountdownTargetClosed(null, 'America/New_York')).toBe(false);
  });
});
