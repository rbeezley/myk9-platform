import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildFavoriteStorageKey,
  persistAccountTodayClassFavorites,
} from '@/features/show-today/accountTodayEntries.helpers';
import type { HydratedAccountTodayEntry } from '@/features/show-today/showTodayBanner.helpers';
import { toggleClassFavorites, useAtShowClassFavorites } from './atShowClassFavorites';

const stored = (trialId: string) =>
  JSON.parse(window.localStorage.getItem(buildFavoriteStorageKey('show-1', trialId)) ?? '[]');

describe('class favorites', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('toggling a combined A/B card favorites and un-favorites both sections', () => {
    toggleClassFavorites('show-1', 'trial-1', ['class-a', 'class-b']);
    expect(stored('trial-1').sort()).toEqual(['class-a', 'class-b']);

    toggleClassFavorites('show-1', 'trial-1', ['class-a', 'class-b']);
    expect(stored('trial-1')).toEqual([]);
  });

  it('resolves a card whose sections disagree to off, then on', () => {
    window.localStorage.setItem(buildFavoriteStorageKey('show-1', 'trial-1'), '["class-a"]');
    toggleClassFavorites('show-1', 'trial-1', ['class-a', 'class-b']);
    expect(stored('trial-1')).toEqual([]);
  });

  it('keeps other classes and other trials untouched', () => {
    window.localStorage.setItem(buildFavoriteStorageKey('show-1', 'trial-1'), '["other"]');
    window.localStorage.setItem(buildFavoriteStorageKey('show-1', 'trial-2'), '["t2"]');
    toggleClassFavorites('show-1', 'trial-1', ['class-a']);
    expect(stored('trial-1').sort()).toEqual(['class-a', 'other']);
    expect(stored('trial-2')).toEqual(['t2']);
  });

  it('reports a blocked store instead of throwing, and changes nothing', () => {
    const blocked = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      expect(toggleClassFavorites('show-1', 'trial-1', ['class-a'])).toBe(false);
    } finally {
      blocked.mockRestore();
    }
    expect(stored('trial-1')).toEqual([]);
  });

  it('the hook reads the saved set after a reload and updates on a toggle', () => {
    window.localStorage.setItem(buildFavoriteStorageKey('show-1', 'trial-1'), '["class-a"]');
    const { result } = renderHook(() => useAtShowClassFavorites('show-1', ['trial-1', 'trial-2']));
    expect([...result.current.favoriteClassIds]).toEqual(['class-a']);

    act(() => {
      result.current.toggleClassFavorite('trial-2', ['class-z']);
    });
    expect([...result.current.favoriteClassIds].sort()).toEqual(['class-a', 'class-z']);
  });

  describe('with the exhibitor entry seeding', () => {
    const seeded = [
      { showId: 'show-1', trialId: 'trial-1', classId: 'class-a' },
    ] as HydratedAccountTodayEntry[];

    it('seeds a class the exhibitor entered, and tells an open picker', () => {
      const heard = vi.fn();
      window.addEventListener('myk9:class-favorites-changed', heard);
      try {
        expect(persistAccountTodayClassFavorites('show-1', seeded)).toBe(true);
      } finally {
        window.removeEventListener('myk9:class-favorites-changed', heard);
      }
      expect(stored('trial-1')).toEqual(['class-a']);
      expect(heard).toHaveBeenCalledTimes(1);
    });

    it('does not bring back a class the user hearted off', () => {
      persistAccountTodayClassFavorites('show-1', seeded);
      toggleClassFavorites('show-1', 'trial-1', ['class-a']);
      expect(stored('trial-1')).toEqual([]);

      expect(persistAccountTodayClassFavorites('show-1', seeded)).toBe(false);
      expect(stored('trial-1')).toEqual([]);
    });

    it('seeds it again once the user hearts it back on', () => {
      persistAccountTodayClassFavorites('show-1', seeded);
      toggleClassFavorites('show-1', 'trial-1', ['class-a']);
      toggleClassFavorites('show-1', 'trial-1', ['class-a']);
      expect(stored('trial-1')).toEqual(['class-a']);
      expect(persistAccountTodayClassFavorites('show-1', seeded)).toBe(false);
    });
  });
});
