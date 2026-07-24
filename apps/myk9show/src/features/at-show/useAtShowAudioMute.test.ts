/**
 * Tests for useAtShowAudioMute — persisted mute preference for the ringside
 * timer chime/voice announcements (MYK9-76).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useAtShowAudioMute } from './useAtShowAudioMute';

const KEY = 'at-show-audio-muted';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('useAtShowAudioMute', () => {
  it('defaults to unmuted when nothing is stored', () => {
    const { result } = renderHook(() => useAtShowAudioMute());
    expect(result.current[0]).toBe(false);
  });

  it('toggling flips the muted state and persists it', () => {
    const { result } = renderHook(() => useAtShowAudioMute());

    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('true');

    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('false');
  });

  it('reads a previously persisted muted preference on mount', () => {
    localStorage.setItem(KEY, 'true');
    const { result } = renderHook(() => useAtShowAudioMute());
    expect(result.current[0]).toBe(true);
  });

  it('syncs across hook instances (same-tab, cross-component)', () => {
    const a = renderHook(() => useAtShowAudioMute());
    const b = renderHook(() => useAtShowAudioMute());

    act(() => a.result.current[1]());

    expect(a.result.current[0]).toBe(true);
    expect(b.result.current[0]).toBe(true);
  });

  it('still mutes for the session when localStorage is unavailable', () => {
    // Simulate a locked-down browser (private mode / disabled storage): both
    // reads and writes throw. The toggle must still TAKE EFFECT via the
    // in-memory fallback, otherwise the mute button does nothing. Assert the
    // transition (flip, then flip back) rather than an absolute baseline, since
    // the module-level in-memory value can carry over from a prior test.
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    try {
      const { result } = renderHook(() => useAtShowAudioMute());
      const initial = result.current[0];

      act(() => result.current[1]());
      expect(result.current[0]).toBe(!initial);

      act(() => result.current[1]());
      expect(result.current[0]).toBe(initial);
    } finally {
      getSpy.mockRestore();
      setSpy.mockRestore();
    }
  });
});
