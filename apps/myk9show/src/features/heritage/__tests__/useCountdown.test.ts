import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCountdown } from '../hooks/useCountdown';

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns hasTarget: false when targetIso is null', () => {
    const { result } = renderHook(() => useCountdown(null, 'America/New_York'));
    expect(result.current.hasTarget).toBe(false);
    expect(result.current.closed).toBe(false);
    expect(result.current.days).toBe(0);
  });

  it('returns hasTarget: true and closed: false for a future target', () => {
    const future = new Date(Date.now() + 2 * 86400 * 1000).toISOString();
    const { result } = renderHook(() => useCountdown(future, 'America/Chicago'));
    expect(result.current.hasTarget).toBe(true);
    expect(result.current.closed).toBe(false);
    expect(result.current.days).toBe(2);
  });

  it('returns closed: true and hasTarget: true for a past target', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const { result } = renderHook(() => useCountdown(past, 'America/New_York'));
    expect(result.current.hasTarget).toBe(true);
    expect(result.current.closed).toBe(true);
    expect(result.current.days).toBe(0);
  });

  it('decomposes a future date into correct days/hours/minutes/seconds', () => {
    const ms = (2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000;
    const future = new Date(Date.now() + ms).toISOString();
    const { result } = renderHook(() => useCountdown(future, 'America/New_York'));
    expect(result.current.days).toBe(2);
    expect(result.current.hours).toBe(3);
    expect(result.current.minutes).toBe(4);
    expect(result.current.seconds).toBe(5);
  });
});
