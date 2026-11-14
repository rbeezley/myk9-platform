/**
 * MYK9-1992: a signed-in account (secretary, judge, steward, exhibitor) stays signed in, with the
 * show it saved on the device, while the token refresh fails offline.
 *
 * Runs `useAuth` against a REAL supabase-js client (as useAuth.ringsideOfflineReload.test.ts does),
 * with only the transport (`fetch`) replaced. The session lives in `window.localStorage` under the
 * key the app's client uses, because that is where `readPersistedAuthUser` looks.
 *
 * What the bug was: auth-js answers `session: null` (getSession() and the INITIAL_SESSION event)
 * when the access token has expired and the refresh could not reach the server. Nothing was
 * rejected and the session is still in storage, but `useAuth` set `user = null`, so the show page
 * rendered its guest branch: "You're offline. Connect to the internet to see this show."
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useAuth } from '@/hooks/useAuth';
import { isAccountSession, isPublicGuest } from '@/hooks/guestServerRead';
import { deriveDefaultAuthStorageKey } from '@/services/database/persistedAuthUserId';

const currentClient = vi.hoisted(() => ({
  value: undefined as unknown as SupabaseClient,
}));

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return currentClient.value;
  },
  default: undefined,
}));

vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { clearCachedHideCounts: vi.fn().mockResolvedValue(undefined) },
}));

const SUPABASE_URL = 'https://test-project.supabase.co';
// The key the app's client (and readPersistedAuthUser) derives from VITE_SUPABASE_URL.
const STORAGE_KEY = deriveDefaultAuthStorageKey(import.meta.env.VITE_SUPABASE_URL || '');
const THIRTY_MINUTES_MS = 30 * 60 * 1000;

function sessionUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'secretary-1',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'jordan@example.com',
    is_anonymous: false,
    app_metadata: { provider: 'email' },
    user_metadata: {},
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function seedSession(expiresInSeconds: number, userOverrides: Record<string, unknown> = {}) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      access_token: 'seed-access-token',
      refresh_token: 'seed-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
      expires_in: 3600,
      token_type: 'bearer',
      user: sessionUser(userOverrides),
    })
  );
}

/** What a browser fetch does with the network gone (DevTools Offline or Wi-Fi off). */
function offlineFetch() {
  return vi.fn(async () => {
    throw new TypeError('Failed to fetch');
  });
}

function buildClient(fetchImpl: ReturnType<typeof vi.fn>) {
  return createClient(SUPABASE_URL, 'test-anon-key', {
    auth: {
      storage: window.localStorage,
      storageKey: STORAGE_KEY,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    global: { fetch: fetchImpl as unknown as typeof fetch },
  });
}

/** The two predicates that choose the show page's guest branch (the offline message). */
function showPageSees(user: ReturnType<typeof useAuth>['user'], loading: boolean) {
  return { guest: isPublicGuest(user, loading), account: isAccountSession(user) };
}

describe('useAuth: refresh failure while offline never signs the user out (MYK9-1992)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(async () => {
    await currentClient.value?.auth.stopAutoRefresh();
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it('stays signed in for 30 minutes offline, past the access-token expiry, with no reload', async () => {
    vi.useFakeTimers();
    seedSession(120);
    const fetchSpy = offlineFetch();
    currentClient.value = buildClient(fetchSpy);

    const { result } = renderHook(() => useAuth());
    await vi.advanceTimersByTimeAsync(1_000);
    expect(result.current.user?.id).toBe('secretary-1');

    for (let elapsed = 0; elapsed < THIRTY_MINUTES_MS; elapsed += 30_000) {
      await vi.advanceTimersByTimeAsync(30_000);
      expect(result.current.user?.id).toBe('secretary-1');
    }

    // The refresh really was attempted and failed, past the expiry.
    expect(fetchSpy).toHaveBeenCalled();
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(showPageSees(result.current.user, result.current.loading)).toEqual({
      guest: false,
      account: true,
    });
  });

  it('a mount after the token expired (reload or remount offline) resolves the saved user, not a guest', async () => {
    vi.useFakeTimers();
    seedSession(-7_200); // 2h past the real expiry; the refresh cannot reach the server
    const fetchSpy = offlineFetch();
    currentClient.value = buildClient(fetchSpy);

    const { result } = renderHook(() => useAuth());
    await vi.advanceTimersByTimeAsync(35_000); // the refresh retries with backoff for up to 30 s
    await vi.waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetchSpy).toHaveBeenCalled();
    expect(result.current.user).toMatchObject({ id: 'secretary-1', is_anonymous: false });
    // The show page keeps its replica path instead of "You're offline. Connect to the internet".
    expect(showPageSees(result.current.user, result.current.loading)).toEqual({
      guest: false,
      account: true,
    });
  });

  it('resolves a judge or steward signed in by account, and an exhibitor, the same way', async () => {
    vi.useFakeTimers();
    seedSession(-7_200, { id: 'judge-1', email: 'judge@example.com' });
    currentClient.value = buildClient(offlineFetch());

    const { result } = renderHook(() => useAuth());
    await vi.advanceTimersByTimeAsync(35_000);
    await vi.waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user?.id).toBe('judge-1');
  });

  it('keeps the user while the failure is a server error rather than a lost connection', async () => {
    vi.useFakeTimers();
    seedSession(-7_200);
    const serverDown = vi.fn(
      async () => new Response(JSON.stringify({ message: 'unavailable' }), { status: 503 })
    );
    currentClient.value = buildClient(serverDown);

    const { result } = renderHook(() => useAuth());
    await vi.advanceTimersByTimeAsync(35_000);
    await vi.waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user?.id).toBe('secretary-1');
  });

  it('a session the server rejected (SIGNED_OUT) is still a sign-out', async () => {
    vi.useFakeTimers();
    seedSession(-7_200);
    const revoked = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid Refresh Token' }),
          { status: 400 }
        )
    );
    currentClient.value = buildClient(revoked);

    const { result } = renderHook(() => useAuth());
    await vi.advanceTimersByTimeAsync(35_000);
    await vi.waitFor(() => expect(result.current.loading).toBe(false));

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it('back online, the refresh succeeds and the same user carries on', async () => {
    vi.useFakeTimers();
    seedSession(-7_200);
    currentClient.value = buildClient(offlineFetch());

    const { result } = renderHook(() => useAuth());
    await vi.advanceTimersByTimeAsync(35_000);
    await vi.waitFor(() => expect(result.current.user?.id).toBe('secretary-1'));

    // @ts-expect-error -- swapping the private transport is how a test reconnects the client.
    currentClient.value.auth.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: 'refreshed-access-token',
            refresh_token: 'refreshed-refresh-token',
            expires_in: 3600,
            token_type: 'bearer',
            user: sessionUser(),
          }),
          { status: 200 }
        )
    );
    // Past auth-js's 60 s refresh-failure cooldown, then its own 30 s ticker retries.
    await vi.advanceTimersByTimeAsync(95_000);

    await vi.waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
      expect(stored.access_token).toBe('refreshed-access-token');
    });
    expect(result.current.user?.id).toBe('secretary-1');
  });
});
