/**
 * MYK9-834 (2026-11-01 reconnect failure). Real `useAuth`, real
 * `useRehydrateRingsideGrant`, real `ringsideGrantStore` and a REAL
 * `@supabase/supabase-js` client; only the network transport, the storage
 * backing and time are substituted.
 *
 * The bug: after an offline reload recovered the role from the persisted claim
 * (`unconfirmedOffline` grant), the `online` event made the hook clear the
 * grant while `user` was still the stale null from the failed offline refresh,
 * before supabase-js had a chance to refresh.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useRehydrateRingsideGrant } from './useRehydrateRingsideGrant';
import { useAuth } from '@/hooks/useAuth';
import { useRingsideGrantStore } from '@/store/ringsideGrantStore';

const currentClient = vi.hoisted(() => ({ value: undefined as unknown as SupabaseClient }));

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return currentClient.value;
  },
  default: undefined,
}));

// The real useAuth stands in for the context the hook reads.
vi.mock('@/hooks/useAuthContext', async () => {
  const { useAuth } = await import('@/hooks/useAuth');
  return { useAuthContext: useAuth };
});

const SHOW_ID = 'show-oct10';
// Unique per test: auth-js locks by storage key, so a refresh still retrying
// when a previous test ended would otherwise block the next client.
let authKey = '';
let clientSeq = 0;
const CLAIM = { kind: 'ringside_passcode', show_id: SHOW_ID, ringside_role: 'judge' };

function userFor(id: string, claim: object = CLAIM) {
  return {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    is_anonymous: true,
    app_metadata: claim,
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
}

function seededExpiredSession() {
  return {
    access_token: 'seed-access',
    refresh_token: 'seed-refresh',
    expires_at: Math.floor(Date.now() / 1000) - 7200,
    expires_in: 3600,
    token_type: 'bearer',
    user: userFor('anon-judge-1'),
  };
}

function fakeStorage(seed: Record<string, string>) {
  const store = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function setOnLine(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value: online, configurable: true });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

type Transport = (url: string) => Promise<Response>;
const offline: Transport = async () => {
  throw new TypeError('Failed to fetch');
};
const refreshAs =
  (id: string): Transport =>
  async url => {
    if (url.includes('grant_type=refresh_token')) {
      return json(200, {
        access_token: 'fresh-access',
        refresh_token: 'fresh-refresh',
        expires_in: 3600,
        token_type: 'bearer',
        user: userFor(id),
      });
    }
    throw new Error(`Unhandled fetch: ${url}`);
  };

describe('useRehydrateRingsideGrant — reconnect with a pending auth verdict (MYK9-834)', () => {
  const originalOnLine = window.navigator.onLine;
  let transport: Transport;
  let signOutSpy: Mock<(...args: unknown[]) => void>;

  async function bootOfflineAndRecoverFromClaim(options: { autoRefresh?: boolean } = {}) {
    transport = offline;
    authKey = `sb-test-project-auth-token-${++clientSeq}`;
    window.localStorage.setItem(
      'myk9:ringside-claim-cache',
      JSON.stringify({ showId: SHOW_ID, role: 'judge', authUserId: 'anon-judge-1' })
    );
    setOnLine(false);
    currentClient.value = createClient('https://test-project.supabase.co', 'test-anon-key', {
      auth: {
        storage: fakeStorage({ [authKey]: JSON.stringify(seededExpiredSession()) }),
        storageKey: authKey,
        autoRefreshToken: options.autoRefresh ?? true,
        persistSession: true,
        detectSessionInUrl: false,
      },
      global: { fetch: ((input: unknown) => transport(String(input))) as unknown as typeof fetch },
    });
    const realSignOut = currentClient.value.auth.signOut.bind(currentClient.value.auth);
    signOutSpy = vi.fn();
    currentClient.value.auth.signOut = (...args: Parameters<typeof realSignOut>) => {
      signOutSpy(...args);
      return realSignOut(...args);
    };

    const hook = renderHook(() => useRehydrateRingsideGrant(SHOW_ID));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(35_000);
    });
    expect(hook.result.current).toBe('judge');
    expect(useRingsideGrantStore.getState().activeGrant).toMatchObject({
      role: 'judge',
      unconfirmedOffline: true,
    });
    return hook;
  }

  async function reconnect() {
    await act(async () => {
      setOnLine(true);
      await vi.advanceTimersByTimeAsync(1_000);
    });
  }

  async function advance(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    useRingsideGrantStore.getState().clearGrant();
    useRingsideGrantStore.getState().setSuppressRehydration(false);
  });

  afterEach(async () => {
    cleanup();
    await currentClient.value?.auth.stopAutoRefresh();
    vi.useRealTimers();
    setOnLine(originalOnLine);
  });

  it('keeps the grant on reconnect, well past 2 minutes of a failing network, then confirms on the same-user refresh', async () => {
    const { result } = await bootOfflineAndRecoverFromClaim();

    // "Online" per the browser, but no real internet (venue wifi): no verdict.
    await reconnect();
    await advance(300_000);
    expect(useRingsideGrantStore.getState().activeGrant).toMatchObject({
      role: 'judge',
      unconfirmedOffline: true,
    });
    expect(result.current).toBe('judge');

    transport = refreshAs('anon-judge-1');
    await advance(95_000);

    expect(useRingsideGrantStore.getState().activeGrant).toMatchObject({
      role: 'judge',
      authUserId: 'anon-judge-1',
      unconfirmedOffline: false,
    });
    expect(result.current).toBe('judge');
    expect(signOutSpy).not.toHaveBeenCalled();
  });

  it('the online event alone (no auto-refresh ticker) triggers the refresh and confirms the same user', async () => {
    await bootOfflineAndRecoverFromClaim({ autoRefresh: false });
    const auth = renderHook(() => useAuth());
    await advance(35_000);
    expect(auth.result.current.user).toBeNull();

    // Let auth-js's 60s refresh-failure cooldown lapse while still offline.
    // With the ticker off, nothing refreshes unless the online event does.
    transport = refreshAs('anon-judge-1');
    await advance(61_000);
    expect(useRingsideGrantStore.getState().activeGrant).toMatchObject({
      unconfirmedOffline: true,
    });

    await reconnect();

    expect(useRingsideGrantStore.getState().activeGrant).toMatchObject({
      role: 'judge',
      authUserId: 'anon-judge-1',
      unconfirmedOffline: false,
    });
    const confirmedUser = auth.result.current.user;
    expect(confirmedUser?.id).toBe('anon-judge-1');

    // A same-id session from a later nudge must not swap the user object.
    await reconnect();
    expect(auth.result.current.user).toBe(confirmedUser);
    expect(signOutSpy).not.toHaveBeenCalled();
  });

  it('a hook instance mounted AFTER the online event, with the user still null, does not clear the grant', async () => {
    await bootOfflineAndRecoverFromClaim();
    await reconnect();

    const late = renderHook(() => useRehydrateRingsideGrant(SHOW_ID));
    await advance(35_000);

    expect(useRingsideGrantStore.getState().activeGrant).toMatchObject({
      role: 'judge',
      unconfirmedOffline: true,
    });
    expect(window.localStorage.getItem('myk9:ringside-claim-cache')).not.toBeNull();
    expect(late.result.current).toBe('judge');
    expect(signOutSpy).not.toHaveBeenCalled();
  });

  it('clears when the refresh is definitively rejected (revoked / invalid session)', async () => {
    const { result } = await bootOfflineAndRecoverFromClaim();

    transport = async () => json(400, { error: 'invalid_grant', error_description: 'revoked' });
    await reconnect();
    await advance(95_000);

    expect(useRingsideGrantStore.getState().activeGrant).toBeNull();
    expect(result.current).toBeNull();
    expect(window.localStorage.getItem('myk9:ringside-claim-cache')).toBeNull();
  });

  it('clears when a different identity signs in after the reconnect', async () => {
    const { result } = await bootOfflineAndRecoverFromClaim();

    transport = async url => {
      if (url.includes('/signup')) {
        return json(200, {
          access_token: 'other-access',
          refresh_token: 'other-refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user: userFor('anon-someone-else', {}),
        });
      }
      return offline(url);
    };
    await reconnect();
    await act(async () => {
      await currentClient.value.auth.signInAnonymously();
    });

    expect(useRingsideGrantStore.getState().activeGrant).toBeNull();
    expect(result.current).toBeNull();
  });

  it('clears on explicit sign-out after the reconnect', async () => {
    await bootOfflineAndRecoverFromClaim();
    transport = refreshAs('anon-judge-1');
    await reconnect();
    await advance(95_000);
    expect(useRingsideGrantStore.getState().activeGrant).toMatchObject({
      unconfirmedOffline: false,
    });

    await act(async () => {
      const pending = currentClient.value.auth.signOut({ scope: 'local' });
      await vi.advanceTimersByTimeAsync(1_000);
      await pending;
    });

    expect(useRingsideGrantStore.getState().activeGrant).toBeNull();
  });
});
