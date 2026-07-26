/**
 * Server mirror of at-show dog favorites (MYK9-79).
 *
 * The guarantees under test:
 *   - first sync SEEDS the server from localStorage (nothing starred pre-sign-in
 *     is lost); every sync after that the SERVER wins so an unstar propagates
 *   - a signed-out user performs no server write at all
 *   - an offline/failed server write leaves the local favorite intact
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const authState: { user: { id: string; is_anonymous?: boolean } | null } = { user: null };
const supabaseCalls: { op: string; args: unknown }[] = [];
let failServerWrites = false;
let serverRows: { show_id: string; armband: number }[] = [];
let failServerRead = false;
let holdServerWrites = false;
let releaseServerWrites: (() => void) | null = null;

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => authState,
}));

vi.mock('@/lib/supabase', () => {
  const table = {
    select: () => ({
      eq: () => ({
        in: async () => {
          supabaseCalls.push({ op: 'select', args: null });
          if (failServerRead) return { data: null, error: new Error('offline') };
          return { data: serverRows, error: null };
        },
      }),
    }),
    upsert: async (rows: unknown) => {
      supabaseCalls.push({ op: 'upsert', args: rows });
      if (holdServerWrites) {
        await new Promise<void>(resolve => {
          releaseServerWrites = resolve;
        });
      }
      return { error: failServerWrites ? new Error('offline') : null };
    },
    delete: () => ({
      eq: () => ({
        eq: () => ({
          eq: async (_column: string, armband: number) => {
            supabaseCalls.push({ op: 'delete', args: armband });
            return { error: failServerWrites ? new Error('offline') : null };
          },
        }),
      }),
    }),
  };
  return { supabase: { from: () => table } };
});

import {
  reconcileFavorites,
  toFavoriteArmbandsByShow,
  persistFavorite,
  removeFavorite,
  useAtShowDogFavoritesSynced,
  buildFavoritesSeededKey,
} from './dogFavoritesSync';
import {
  migrateAnonymousDogFavorites,
  readDogFavoriteArmbands,
  writeDogFavoriteArmbands,
} from './ringsideDogFavorites';

const SHOW_ID = 'show-1';
const USER_ID = 'user-1';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

const renderFavorites = () => renderHook(() => useAtShowDogFavoritesSynced(SHOW_ID), { wrapper });

beforeEach(() => {
  localStorage.clear();
  supabaseCalls.length = 0;
  serverRows = [];
  failServerWrites = false;
  failServerRead = false;
  holdServerWrites = false;
  releaseServerWrites = null;
  authState.user = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reconcileFavorites', () => {
  it('seeds the server from localStorage on the first sync', () => {
    expect(reconcileFavorites([10, 20], [20, 30], false)).toEqual({
      resolved: [10, 20, 30],
      toInsert: [10],
    });
  });

  it('lets the server win after the first sync, so an unstar propagates', () => {
    expect(reconcileFavorites([10, 20], [20], true)).toEqual({
      resolved: [20],
      toInsert: [],
    });
  });

  it('is a no-op when both sides already agree', () => {
    expect(reconcileFavorites([20], [20], true)).toEqual({ resolved: [20], toInsert: [] });
  });
});

describe('toFavoriteArmbandsByShow', () => {
  it('groups rows into per-show armband sets and drops malformed rows', () => {
    const byShow = toFavoriteArmbandsByShow([
      { show_id: 'a', armband: 1 },
      { show_id: 'a', armband: 2 },
      { show_id: 'b', armband: 1 },
      { show_id: '', armband: 9 },
      { show_id: 'a', armband: Number.NaN },
    ]);

    expect([...(byShow.get('a') ?? [])]).toEqual([1, 2]);
    expect([...(byShow.get('b') ?? [])]).toEqual([1]);
    expect(byShow.has('')).toBe(false);
  });
});

describe('best-effort server writes', () => {
  it('reports failure instead of throwing when the write fails', async () => {
    failServerWrites = true;
    await expect(persistFavorite(USER_ID, SHOW_ID, 10)).resolves.toBe(false);
    await expect(removeFavorite(USER_ID, SHOW_ID, 10)).resolves.toBe(false);
  });
});

describe('useAtShowDogFavoritesSynced', () => {
  it('makes no server call at all when signed out', async () => {
    authState.user = null;
    const { result } = renderFavorites();

    act(() => result.current.toggleFavoriteArmband(42));

    await waitFor(() => expect(readDogFavoriteArmbands(SHOW_ID)).toEqual([42]));
    expect(supabaseCalls).toEqual([]);
  });

  it('keeps anonymous passcode favorites in the legacy ringside store', async () => {
    authState.user = { id: 'anonymous-user', is_anonymous: true };
    const { result } = renderFavorites();

    act(() => result.current.toggleFavoriteArmband(42));

    await waitFor(() => expect(readDogFavoriteArmbands(SHOW_ID)).toEqual([42]));
    expect(readDogFavoriteArmbands(SHOW_ID, 'anonymous-user')).toEqual([]);
    expect(supabaseCalls).toEqual([]);
  });

  it('keeps the local favorite when the server write fails offline', async () => {
    authState.user = { id: USER_ID };
    failServerWrites = true;
    const { result } = renderFavorites();

    act(() => result.current.toggleFavoriteArmband(42));

    await waitFor(() => expect(supabaseCalls.some(call => call.op === 'upsert')).toBe(true));
    expect(readDogFavoriteArmbands(SHOW_ID, USER_ID)).toEqual([42]);
    expect(localStorage.getItem(buildFavoritesSeededKey(USER_ID, SHOW_ID))).toBeNull();
  });

  it('leaves local favorites untouched when the initial server read fails', async () => {
    authState.user = { id: USER_ID };
    failServerRead = true;
    writeDogFavoriteArmbands(SHOW_ID, [7, 8]);

    renderFavorites();

    await waitFor(() => expect(supabaseCalls.some(call => call.op === 'select')).toBe(true));
    expect(readDogFavoriteArmbands(SHOW_ID, USER_ID)).toEqual([7, 8]);
    expect(readDogFavoriteArmbands(SHOW_ID)).toEqual([]);
    expect(localStorage.getItem(buildFavoritesSeededKey(USER_ID, SHOW_ID))).toBeNull();
  });

  it('seeds the server on first sync and marks the pair seeded', async () => {
    authState.user = { id: USER_ID };
    serverRows = [{ show_id: SHOW_ID, armband: 30 }];
    writeDogFavoriteArmbands(SHOW_ID, [10]);

    renderFavorites();

    await waitFor(() =>
      expect(localStorage.getItem(buildFavoritesSeededKey(USER_ID, SHOW_ID))).toBe('1')
    );
    expect(readDogFavoriteArmbands(SHOW_ID, USER_ID)).toEqual([10, 30]);
    expect(readDogFavoriteArmbands(SHOW_ID)).toEqual([]);
    expect(supabaseCalls.filter(call => call.op === 'upsert')).toHaveLength(1);
  });

  it('merges anonymous favorites into an existing user scope before cleanup', () => {
    writeDogFavoriteArmbands(SHOW_ID, [10]);
    writeDogFavoriteArmbands(SHOW_ID, [20], USER_ID);

    migrateAnonymousDogFavorites(SHOW_ID, USER_ID);

    expect(readDogFavoriteArmbands(SHOW_ID, USER_ID)).toEqual([20, 10]);
    expect(readDogFavoriteArmbands(SHOW_ID)).toEqual([]);
  });

  it("keeps one account from inheriting another account's device favorites", async () => {
    authState.user = { id: 'user-a' };
    writeDogFavoriteArmbands(SHOW_ID, [10]);
    const { rerender } = renderFavorites();

    await waitFor(() => expect(readDogFavoriteArmbands(SHOW_ID, 'user-a')).toEqual([10]));
    expect(readDogFavoriteArmbands(SHOW_ID)).toEqual([]);

    authState.user = { id: 'user-b' };
    rerender();

    await waitFor(() => expect(readDogFavoriteArmbands(SHOW_ID, 'user-b')).toEqual([]));
    expect(readDogFavoriteArmbands(SHOW_ID, 'user-a')).toEqual([10]);
    expect(supabaseCalls.filter(call => call.op === 'upsert')).toHaveLength(1);
  });

  it('does not overwrite a toggle made while reconciliation is awaiting a server write', async () => {
    authState.user = { id: USER_ID };
    holdServerWrites = true;
    writeDogFavoriteArmbands(SHOW_ID, [10], USER_ID);
    const { result } = renderFavorites();

    await waitFor(() => expect(supabaseCalls.filter(call => call.op === 'upsert')).toHaveLength(1));
    act(() => result.current.toggleFavoriteArmband(20));
    expect(readDogFavoriteArmbands(SHOW_ID, USER_ID)).toEqual([10, 20]);

    holdServerWrites = false;
    releaseServerWrites?.();

    await waitFor(() => expect(supabaseCalls.filter(call => call.op === 'upsert')).toHaveLength(2));
    expect(readDogFavoriteArmbands(SHOW_ID, USER_ID)).toEqual([10, 20]);
  });
});
