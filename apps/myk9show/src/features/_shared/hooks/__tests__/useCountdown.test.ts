import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCountdown } from '../useCountdown';

const originalTimezone = process.env.TZ;

beforeEach(() => {
  process.env.TZ = 'America/Chicago';
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
  it('is not closed at noon local time on the close date itself', () => {
    // Regression: new Date('2026-08-01') parses as UTC midnight, which is
    // already the evening of Jul 31 in America/Chicago — reporting "closed"
    // a day early. Entries should stay open through the full close day.
    vi.setSystemTime(new Date('2026-08-01T12:00:00'));
    const { result } = renderHook(() => useCountdown('2026-08-01', 'America/Chicago'));
    expect(result.current.closed).toBe(false);
    expect(result.current.hasTarget).toBe(true);
  });

  it('is not closed one second before local end-of-day on the close date', () => {
    vi.setSystemTime(new Date('2026-08-01T23:59:59'));
    const { result } = renderHook(() => useCountdown('2026-08-01', 'America/Chicago'));
    expect(result.current.closed).toBe(false);
  });

  it('is closed the moment local end-of-day on the close date has passed', () => {
    vi.setSystemTime(new Date('2026-08-02T00:00:00'));
    const { result } = renderHook(() => useCountdown('2026-08-01', 'America/Chicago'));
    expect(result.current.closed).toBe(true);
  });

  it('treats a full ISO instant as an exact cutoff, not end-of-day', () => {
    vi.setSystemTime(new Date('2026-08-01T13:00:00Z'));
    const { result } = renderHook(() =>
      useCountdown('2026-08-01T12:00:00Z', 'America/Chicago')
    );
    expect(result.current.closed).toBe(true);
  });

  it('reports no target when entryCloseDate is null', () => {
    const { result } = renderHook(() => useCountdown(null, 'America/Chicago'));
    expect(result.current.hasTarget).toBe(false);
    expect(result.current.closed).toBe(false);
  });
});
