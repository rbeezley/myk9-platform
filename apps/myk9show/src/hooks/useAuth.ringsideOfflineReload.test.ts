/**
 * MYK9-834 — pins the ringside passcode offline-reload contract against a
 * REAL `@supabase/supabase-js` client (the same `createClient` production
 * uses in `services/database/supabaseClient.ts`), so `useAuth`'s
 * `getSession()` / `onAuthStateChange` behavior is the library's actual
 * behavior, not a hand-rolled guess at it. Only the network transport
 * (`fetch`) and the storage backing (an in-memory stand-in for localStorage,
 * pre-seeded to simulate "already signed in before this reload") are
 * substituted; time is controlled via fake timers because a real offline
 * refresh attempt retries with exponential backoff for up to
 * `AUTO_REFRESH_TICK_DURATION_MS` (30s) before giving up.
 *
 * Findings pinned here (see `ringsideClaimCache.ts` for the full mechanism):
 * - Scenario 1 (offline reload, still-valid token): `getSession()` resolves
 *   with the user intact — no refresh is even attempted.
 * - Scenario 2 (offline reload, genuinely EXPIRED token): `@supabase/auth-js`
 *   2.116.0 returns `session: null` from `getSession()` even though the
 *   session was never removed from storage and no SIGNED_OUT ever fired —
 *   this is the exact gap `useRehydrateRingsideGrant`'s offline fallback
 *   closes (see `AtShowAccessGate.offlineReload.test.tsx`).
 * - Scenario 3 (back online): a subsequent refresh succeeds and the user
 *   resolves again via TOKEN_REFRESHED, with no sign-out in between.
 * - Scenario 4: an offline refresh failure never calls `signOut()`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useAuth } from '@/hooks/useAuth';

const currentClient = vi.hoisted(() => ({
  value: undefined as unknown as SupabaseClient,
}));

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return currentClient.value;
  },
  default: undefined,
}));

const SHOW_ID = 'show-oct10';
const RINGSIDE_CLAIM = { kind: 'ringside_passcode', show_id: SHOW_ID, ringside_role: 'judge' };

interface FakeResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

/** In-memory stand-in for `window.localStorage` — same string-keyed contract. */
function createFakeStorage(seed: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

function seededSession(expiresInSeconds: number) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    access_token: 'seed-access-token',
    refresh_token: 'seed-refresh-token',
    expires_at: nowSeconds + expiresInSeconds,
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: 'anon-judge-1',
      aud: 'authenticated',
      role: 'authenticated',
      is_anonymous: true,
      app_metadata: RINGSIDE_CLAIM,
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
}

/** A fetch that always fails the way a real offline browser fetch does. */
function offlineFetch() {
  return vi.fn(async () => {
    throw new TypeError('Failed to fetch');
  });
}

/** A fetch that answers a refresh-token POST with a fresh, valid session. */
function onlineRefreshFetch() {
  const refreshed = {
    access_token: 'refreshed-access-token',
    refresh_token: 'refreshed-refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: 'anon-judge-1',
      aud: 'authenticated',
      role: 'authenticated',
      is_anonymous: true,
      app_metadata: RINGSIDE_CLAIM,
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
  return vi.fn(async (input: unknown): Promise<FakeResponse> => {
    const url = String(input);
    if (url.includes('/token?grant_type=refresh_token')) {
      return { ok: true, status: 200, json: async () => refreshed };
    }
    throw new Error(`Unhandled fetch in test: ${url}`);
  });
}

/** Builds the same kind of client `services/database/supabaseClient.ts` builds in prod. */
function buildClient(storage: ReturnType<typeof createFakeStorage>, fetchImpl: ReturnType<typeof vi.fn>) {
  return createClient('https://test-project.supabase.co', 'test-anon-key', {
    auth: {
      storage,
      storageKey: 'sb-test-project-auth-token',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    global: { fetch: fetchImpl as unknown as typeof fetch },
  });
}

describe('useAuth — ringside passcode offline reload (MYK9-834)', () => {
  afterEach(async () => {
    await currentClient.value?.auth.stopAutoRefresh();
    vi.useRealTimers();
  });

  it('scenario 1: offline reload with a still-valid access token rehydrates the user', async () => {
    const storage = createFakeStorage({
      'sb-test-project-auth-token': JSON.stringify(seededSession(1800)), // 30 min out
    });
    currentClient.value = buildClient(storage, offlineFetch());

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toMatchObject({
      id: 'anon-judge-1',
      is_anonymous: true,
      app_metadata: RINGSIDE_CLAIM,
    });
  });

  it('scenario 2: offline reload with an EXPIRED access token loses the user (documents the auth-js gap)', async () => {
    vi.useFakeTimers();
    const storage = createFakeStorage({
      'sb-test-project-auth-token': JSON.stringify(seededSession(-7200)), // 2h past real exp
    });
    const fetchSpy = offlineFetch();
    currentClient.value = buildClient(storage, fetchSpy);

    const { result } = renderHook(() => useAuth());

    // The real client retries the refresh with exponential backoff for up to
    // AUTO_REFRESH_TICK_DURATION_MS (30s) before giving up — drain it.
    await vi.advanceTimersByTimeAsync(35_000);
    await vi.waitFor(() => expect(result.current.loading).toBe(false));

    // The bug this ticket is about: getSession() reports no user even though
    // nothing revoked the passcode and no SIGNED_OUT ever fired.
    expect(result.current.user).toBeNull();
    expect(fetchSpy).toHaveBeenCalled();

    // Prove the session was never actually wiped from storage — only the
    // client's own in-memory read of it went dark. This is exactly what
    // `ringsideClaimCache` exists to bridge around.
    expect(storage.getItem('sb-test-project-auth-token')).not.toBeNull();
  });

  it('scenario 3: back online, refresh succeeds and the user resolves again with no sign-out in between', async () => {
    vi.useFakeTimers();
    const storage = createFakeStorage({
      'sb-test-project-auth-token': JSON.stringify(seededSession(-7200)),
    });
    const signOutSpy = vi.fn();
    currentClient.value = buildClient(storage, offlineFetch());
    // Spy on the real client's signOut without replacing its behavior.
    const realSignOut = currentClient.value.auth.signOut.bind(currentClient.value.auth);
    currentClient.value.auth.signOut = (...args: Parameters<typeof realSignOut>) => {
      signOutSpy(...args);
      return realSignOut(...args);
    };

    const { result } = renderHook(() => useAuth());
    await vi.advanceTimersByTimeAsync(35_000);
    await vi.waitFor(() => expect(result.current.user).toBeNull());

    // Device comes back online: swap in a fetch that answers the refresh.
    // Don't call refreshSession() here — the just-failed refresh_token is
    // still inside auth-js's own REFRESH_FAILURE_COOLDOWN_MS (60s) and would
    // short-circuit to the cached offline failure without touching fetch at
    // all, exactly as a real reconnect-triggered refresh would. Advancing
    // past the cooldown and letting the library's OWN auto-refresh ticker
    // (30s cadence) pick up the now-online fetch is the faithful simulation.
    // @ts-expect-error -- reaching into the client's private fetch handle is
    // the only way to swap transport mid-test; a real browser just starts
    // succeeding again on the same global fetch.
    currentClient.value.auth.fetch = onlineRefreshFetch();
    await vi.advanceTimersByTimeAsync(65_000);

    await vi.waitFor(() => expect(result.current.user).not.toBeNull());
    expect(result.current.user).toMatchObject({
      id: 'anon-judge-1',
      is_anonymous: true,
      app_metadata: RINGSIDE_CLAIM,
    });
    expect(signOutSpy).not.toHaveBeenCalled();
  });

  it('scenario 4: an offline refresh failure never calls signOut()', async () => {
    vi.useFakeTimers();
    const storage = createFakeStorage({
      'sb-test-project-auth-token': JSON.stringify(seededSession(-7200)),
    });
    currentClient.value = buildClient(storage, offlineFetch());
    const signOutSpy = vi.fn();
    const realSignOut = currentClient.value.auth.signOut.bind(currentClient.value.auth);
    currentClient.value.auth.signOut = (...args: Parameters<typeof realSignOut>) => {
      signOutSpy(...args);
      return realSignOut(...args);
    };

    const { result } = renderHook(() => useAuth());
    await vi.advanceTimersByTimeAsync(35_000);
    await vi.waitFor(() => expect(result.current.loading).toBe(false));

    expect(signOutSpy).not.toHaveBeenCalled();
  });
});
