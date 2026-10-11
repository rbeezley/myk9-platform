import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useElementMaxTimeStatus,
  type ElementMaxTimeStatusOptions,
} from './useElementMaxTimeStatus';

const base: ElementMaxTimeStatusOptions = {
  enabled: true,
  maxTimeMs: 60_000,
  elementTimeMs: 0,
  isRunning: true,
};

describe('useElementMaxTimeStatus (MYK9-1093)', () => {
  it('is inert for a single-timer class', () => {
    const { result } = renderHook(() =>
      useElementMaxTimeStatus({ ...base, enabled: false, elementTimeMs: 59_000 })
    );
    expect(result.current).toEqual({
      remainingMs: 0,
      isWarning: false,
      isExpired: false,
      warningMessage: null,
    });
  });

  it('warns at 30s left, chimes and announces once, and re-arms after a reset', () => {
    const onWarningChime = vi.fn();
    const onVoiceAnnouncement = vi.fn();
    const props = { ...base, enableVoiceAnnouncements: true, onWarningChime, onVoiceAnnouncement };
    const { result, rerender } = renderHook(
      (p: ElementMaxTimeStatusOptions) => useElementMaxTimeStatus(p),
      { initialProps: { ...props, elementTimeMs: 29_000 } }
    );
    expect(result.current.isWarning).toBe(false);

    rerender({ ...props, elementTimeMs: 31_000 });
    rerender({ ...props, elementTimeMs: 40_000 });
    expect(result.current.warningMessage).toBe('30 Second Warning');
    expect(onWarningChime).toHaveBeenCalledTimes(1);
    expect(onVoiceAnnouncement).toHaveBeenCalledWith(30);

    rerender({ ...props, elementTimeMs: 0 }); // reset
    rerender({ ...props, elementTimeMs: 31_000 });
    expect(onWarningChime).toHaveBeenCalledTimes(2);
  });

  it('reports Time Expired at the max, with no warning once stopped', () => {
    const { result } = renderHook(() =>
      useElementMaxTimeStatus({ ...base, elementTimeMs: 60_000, isRunning: false })
    );
    expect(result.current.isExpired).toBe(true);
    expect(result.current.isWarning).toBe(false);
    expect(result.current.warningMessage).toBe('Time Expired');
    expect(result.current.remainingMs).toBe(0);
  });
});
