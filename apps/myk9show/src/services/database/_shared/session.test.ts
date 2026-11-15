import { describe, it, expect, vi, afterEach } from 'vitest';
import { deriveDefaultAuthStorageKey } from '@/services/database/persistedAuthUserId';

const getSession = vi.hoisted(() => vi.fn());
vi.mock('../supabaseClient', () => ({ supabase: { auth: { getSession } } }));

import { hasAuthenticatedSession } from './session';

function persist(user: Record<string, unknown>) {
  window.localStorage.setItem(
    deriveDefaultAuthStorageKey(import.meta.env.VITE_SUPABASE_URL || ''),
    JSON.stringify({
      access_token: 'a',
      refresh_token: 'r',
      expires_at: Math.floor(Date.now() / 1000) - 3_600,
      user,
    })
  );
}

afterEach(() => {
  window.localStorage.clear();
  getSession.mockReset();
});

describe('hasAuthenticatedSession (MYK9-1992)', () => {
  it('is true for a live account session', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u' } } }, error: null });
    expect(await hasAuthenticatedSession()).toBe(true);
  });

  it('stays true offline with an expired token: the saved account still reads the replica', async () => {
    persist({ id: 'u', is_anonymous: false });
    getSession.mockResolvedValue({
      data: { session: null },
      error: new TypeError('Failed to fetch'),
    });
    expect(await hasAuthenticatedSession()).toBe(true);
  });

  it('is false for a saved passcode (anonymous) session', async () => {
    persist({ id: 'anon', is_anonymous: true });
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    expect(await hasAuthenticatedSession()).toBe(false);
  });

  it('is false with nothing saved', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    expect(await hasAuthenticatedSession()).toBe(false);
  });
});
