/**
 * MYK9-2007: a UKC dual run restored inside the last 30 seconds was warned
 * before the restart; the chime and voice must not fire a second time.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useElementMaxTimeStatus } from './useElementMaxTimeStatus';

const base = { enabled: true, maxTimeMs: 60_000, isRunning: true };

describe('useElementMaxTimeStatus after a restore', () => {
  it('mounting inside the 30-second window does not chime again', () => {
    const onWarningChime = vi.fn();
    const onVoiceAnnouncement = vi.fn();
    renderHook(() =>
      useElementMaxTimeStatus({
        ...base,
        elementTimeMs: 40_000,
        enableVoiceAnnouncements: true,
        onWarningChime,
        onVoiceAnnouncement,
      })
    );
    expect(onWarningChime).not.toHaveBeenCalled();
    expect(onVoiceAnnouncement).not.toHaveBeenCalled();
  });

  it('a run that crosses into the window after mounting still chimes once', () => {
    const onWarningChime = vi.fn();
    const { rerender } = renderHook(
      ({ elementTimeMs }) => useElementMaxTimeStatus({ ...base, elementTimeMs, onWarningChime }),
      { initialProps: { elementTimeMs: 10_000 } }
    );
    act(() => rerender({ elementTimeMs: 35_000 }));
    expect(onWarningChime).toHaveBeenCalledTimes(1);
  });
});
