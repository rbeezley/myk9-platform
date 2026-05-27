/**
 * Tests for useFavoriteClasses.
 *
 * History: this file was rewritten during PR E1c. The previous test
 * (in `apps/myk9q/src/hooks/useFavoriteClasses.test.ts`) targeted a
 * SECOND, orphaned implementation of `useFavoriteClasses` that took
 * an options object and exposed `addFavorite`/`removeFavorite`/
 * `clearFavorites`/`onFavoritesChange`. That orphan hook was only
 * imported by its own test file — ClassList.tsx always used the live
 * implementation now in this directory.
 *
 * The live hook's API is narrower (`useFavoriteClasses(licenseKey, trialId)`,
 * returns `{ favoriteClasses, favoritesLoaded, isFavorite, toggleFavorite }`)
 * and adds **paired-class toggling** (toggle Novice A + B together) that
 * the orphan didn't have. The orphan's tests didn't fit cleanly, so this
 * file targets the live behavior contracts directly instead of porting
 * line-by-line.
 *
 * Behavior contracts under test:
 *   1. Initial state — empty set, favoritesLoaded flips to true after mount
 *   2. localStorage read on mount — uses the documented key shape
 *   3. localStorage read handles missing key + malformed JSON without crashing
 *   4. localStorage write on toggle — only after initial load completes
 *   5. localStorage write skips when licenseKey/trialId are missing
 *   6. toggleFavorite (single) — flips membership
 *   7. toggleFavorite with pairedClassId — A and B move together
 *   8. isFavorite — reads the current set
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useFavoriteClasses } from './useFavoriteClasses';

const LICENSE = 'myK9Q1-test-abc-123';
const TRIAL = 'trial-789';
const storageKey = (lk: string | undefined, tid: string | undefined) =>
  `favorites_${lk || 'default'}_${tid}`;

beforeEach(() => {
  localStorage.clear();
  // Silence the hook's logger.error inside negative-path tests so the
  // test output stays readable.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── 1. Initial state ─────────────────────────────────────────────────────

describe('initial state', () => {
  test('starts with empty favorites and favoritesLoaded=true after mount', async () => {
    const { result } = renderHook(() => useFavoriteClasses(LICENSE, TRIAL));

    // Initially empty before the mount effect runs.
    expect(result.current.favoriteClasses).toEqual(new Set());

    await waitFor(() => expect(result.current.favoritesLoaded).toBe(true));
    expect(result.current.favoriteClasses).toEqual(new Set());
  });

  test('does not load (favoritesLoaded stays false) when licenseKey is undefined', () => {
    const { result } = renderHook(() => useFavoriteClasses(undefined, TRIAL));
    expect(result.current.favoritesLoaded).toBe(false);
  });

  test('does not load (favoritesLoaded stays false) when trialId is undefined', () => {
    const { result } = renderHook(() => useFavoriteClasses(LICENSE, undefined));
    expect(result.current.favoritesLoaded).toBe(false);
  });
});

// ── 2. localStorage read on mount ────────────────────────────────────────

describe('localStorage read', () => {
  test('hydrates favorites from the documented storage key', async () => {
    localStorage.setItem(storageKey(LICENSE, TRIAL), JSON.stringify([1, 2, 3]));

    const { result } = renderHook(() => useFavoriteClasses(LICENSE, TRIAL));

    await waitFor(() => expect(result.current.favoritesLoaded).toBe(true));
    expect(result.current.favoriteClasses).toEqual(new Set([1, 2, 3]));
  });

  test('missing key produces an empty set, still marks loaded', async () => {
    // No localStorage entry written.
    const { result } = renderHook(() => useFavoriteClasses(LICENSE, TRIAL));

    await waitFor(() => expect(result.current.favoritesLoaded).toBe(true));
    expect(result.current.favoriteClasses).toEqual(new Set());
  });

  test('malformed JSON does not crash; falls back to empty (loaded flag remains false on error)', async () => {
    localStorage.setItem(storageKey(LICENSE, TRIAL), '{not valid json');

    const { result } = renderHook(() => useFavoriteClasses(LICENSE, TRIAL));

    // The hook catches the parse error and logs — favorites stays empty,
    // favoritesLoaded stays false because the error path returns before
    // setFavoritesLoaded(true). Documenting current behavior.
    await waitFor(() => {
      expect(result.current.favoriteClasses).toEqual(new Set());
    });
    expect(console.error).toHaveBeenCalled();
  });
});

// ── 3. localStorage write on changes ─────────────────────────────────────

describe('localStorage write', () => {
  test('writes the JSON array after a toggle, once load has completed', async () => {
    const { result } = renderHook(() => useFavoriteClasses(LICENSE, TRIAL));
    await waitFor(() => expect(result.current.favoritesLoaded).toBe(true));

    act(() => result.current.toggleFavorite(42));

    expect(localStorage.getItem(storageKey(LICENSE, TRIAL))).toBe(
      JSON.stringify([42])
    );
  });

  test('preserves IDs across multiple toggles', async () => {
    const { result } = renderHook(() => useFavoriteClasses(LICENSE, TRIAL));
    await waitFor(() => expect(result.current.favoritesLoaded).toBe(true));

    act(() => result.current.toggleFavorite(1));
    act(() => result.current.toggleFavorite(2));
    act(() => result.current.toggleFavorite(3));

    const stored = JSON.parse(localStorage.getItem(storageKey(LICENSE, TRIAL))!) as number[];
    expect(new Set(stored)).toEqual(new Set([1, 2, 3]));
  });

  test('does NOT write before favoritesLoaded becomes true', () => {
    // Render with undefined trialId so the load effect short-circuits and
    // favoritesLoaded stays false. The save effect should ALSO short-circuit.
    const { result } = renderHook(() => useFavoriteClasses(LICENSE, undefined));

    // Hook never enters the writable state — toggleFavorite still updates
    // local state but the persistence guard `licenseKey && trialId && favoritesLoaded`
    // prevents writes.
    act(() => result.current.toggleFavorite(99));

    expect(localStorage.getItem(storageKey(LICENSE, undefined))).toBeNull();
  });
});

// ── 4. toggleFavorite — single ───────────────────────────────────────────

describe('toggleFavorite (single)', () => {
  test('adds an absent class to the set', async () => {
    const { result } = renderHook(() => useFavoriteClasses(LICENSE, TRIAL));
    await waitFor(() => expect(result.current.favoritesLoaded).toBe(true));

    act(() => result.current.toggleFavorite(7));

    expect(result.current.favoriteClasses.has(7)).toBe(true);
  });

  test('removes a present class from the set', async () => {
    localStorage.setItem(storageKey(LICENSE, TRIAL), JSON.stringify([7]));
    const { result } = renderHook(() => useFavoriteClasses(LICENSE, TRIAL));
    await waitFor(() => expect(result.current.favoritesLoaded).toBe(true));

    act(() => result.current.toggleFavorite(7));

    expect(result.current.favoriteClasses.has(7)).toBe(false);
  });
});

// ── 5. toggleFavorite — paired class ─────────────────────────────────────

describe('toggleFavorite (paired class — Novice A/B)', () => {
  test('toggles BOTH ids on when neither is present', async () => {
    const { result } = renderHook(() => useFavoriteClasses(LICENSE, TRIAL));
    await waitFor(() => expect(result.current.favoritesLoaded).toBe(true));

    act(() => result.current.toggleFavorite(10, 11));

    expect(result.current.favoriteClasses.has(10)).toBe(true);
    expect(result.current.favoriteClasses.has(11)).toBe(true);
  });

  test('toggles BOTH ids off when the primary class is present', async () => {
    localStorage.setItem(storageKey(LICENSE, TRIAL), JSON.stringify([10, 11]));
    const { result } = renderHook(() => useFavoriteClasses(LICENSE, TRIAL));
    await waitFor(() => expect(result.current.favoritesLoaded).toBe(true));

    act(() => result.current.toggleFavorite(10, 11));

    expect(result.current.favoriteClasses.has(10)).toBe(false);
    expect(result.current.favoriteClasses.has(11)).toBe(false);
  });

  test('decision is driven by the PRIMARY classId (not the paired one)', async () => {
    // Only the paired class is favorited — primary is not. Toggle should ADD
    // (because primary classId 20 is absent), giving us both.
    localStorage.setItem(storageKey(LICENSE, TRIAL), JSON.stringify([21]));
    const { result } = renderHook(() => useFavoriteClasses(LICENSE, TRIAL));
    await waitFor(() => expect(result.current.favoritesLoaded).toBe(true));

    act(() => result.current.toggleFavorite(20, 21));

    expect(result.current.favoriteClasses.has(20)).toBe(true);
    expect(result.current.favoriteClasses.has(21)).toBe(true);
  });
});

// ── 6. isFavorite ────────────────────────────────────────────────────────

describe('isFavorite', () => {
  test('returns true for ids in the set, false otherwise', async () => {
    localStorage.setItem(storageKey(LICENSE, TRIAL), JSON.stringify([100, 200]));
    const { result } = renderHook(() => useFavoriteClasses(LICENSE, TRIAL));
    await waitFor(() => expect(result.current.favoritesLoaded).toBe(true));

    expect(result.current.isFavorite(100)).toBe(true);
    expect(result.current.isFavorite(200)).toBe(true);
    expect(result.current.isFavorite(300)).toBe(false);
  });

  test('reflects updates after a toggle', async () => {
    const { result } = renderHook(() => useFavoriteClasses(LICENSE, TRIAL));
    await waitFor(() => expect(result.current.favoritesLoaded).toBe(true));

    expect(result.current.isFavorite(7)).toBe(false);
    act(() => result.current.toggleFavorite(7));
    expect(result.current.isFavorite(7)).toBe(true);
  });
});
