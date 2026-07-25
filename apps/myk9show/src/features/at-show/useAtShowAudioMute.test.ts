/**
 * Tests for useAtShowAudioMute — persisted mute preference for the ringside
 * timer chime/voice announcements (MYK9-76).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const KEY = 'at-show-audio-muted';

/**
 * The hook keeps a MODULE-LEVEL in-memory fallback (used when localStorage is
 * unusable), which `localStorage.clear()` does not reset. Without a fresh module
 * per test, a value written by one test leaks into the next and the suite
 * becomes order-dependent — CI shuffles test order with a random seed, so that
 * surfaces as an intermittent failure rather than a local one.
 */
async function loadHook() {
  vi.resetModules();
  const mod = await import('./useAtShowAudioMute');
  return mod.useAtShowAudioMute;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('useAtShowAudioMute', () => {
  it('defaults to unmuted when nothing is stored', async () => {
    const useAtShowAudioMute = await loadHook();
    const { result } = renderHook(() => useAtShowAudioMute());
    expect(result.current[0]).toBe(false);
  });

  it('toggling flips the muted state and persists it', async () => {
    const useAtShowAudioMute = await loadHook();
    const { result } = renderHook(() => useAtShowAudioMute());

    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('true');

    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('false');
  });

  it('reads a previously persisted muted preference on mount', async () => {
    localStorage.setItem(KEY, 'true');
    const useAtShowAudioMute = await loadHook();
    const { result } = renderHook(() => useAtShowAudioMute());
    expect(result.current[0]).toBe(true);
  });

  it('syncs across hook instances (same-tab, cross-component)', async () => {
    const useAtShowAudioMute = await loadHook();
    const a = renderHook(() => useAtShowAudioMute());
    const b = renderHook(() => useAtShowAudioMute());

    act(() => a.result.current[1]());

    expect(a.result.current[0]).toBe(true);
    expect(b.result.current[0]).toBe(true);
  });

  it('still mutes for the session when only WRITES fail (readable storage, quota exhausted)', async () => {
    // The asymmetric case: getItem works, setItem throws. A read-only try/catch
    // would read the absent key as "unmuted" and the toggle would appear dead,
    // so a failed write must latch the in-memory value as the source of truth.
    const useAtShowAudioMute = await loadHook();
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    try {
      const { result } = renderHook(() => useAtShowAudioMute());
      expect(result.current[0]).toBe(false);

      act(() => result.current[1]());
      expect(result.current[0]).toBe(true);

      act(() => result.current[1]());
      expect(result.current[0]).toBe(false);
    } finally {
      setSpy.mockRestore();
    }
  });

  it('still mutes for the session when localStorage is unavailable', async () => {
    // Simulate a locked-down browser (private mode / disabled storage): both
    // reads and writes throw. The toggle must still TAKE EFFECT via the
    // in-memory fallback, otherwise the mute button does nothing.
    const useAtShowAudioMute = await loadHook();
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    try {
      const { result } = renderHook(() => useAtShowAudioMute());
      expect(result.current[0]).toBe(false);

      act(() => result.current[1]());
      expect(result.current[0]).toBe(true);

      act(() => result.current[1]());
      expect(result.current[0]).toBe(false);
    } finally {
      getSpy.mockRestore();
      setSpy.mockRestore();
    }
  });
});
