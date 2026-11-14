import { describe, it, expect, afterEach } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { deriveDefaultAuthStorageKey } from '@/services/database/persistedAuthUserId';
import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { OFFLINE_SESSION_CACHE_TTL_MS } from '@/context/offlineSessionCacheTtl';
import {
  isNetworkClassAuthError,
  readPersistedAuthUser,
  resolveGetSessionUser,
  resolveSessionUser,
} from './authSessionUser';

const KEY = deriveDefaultAuthStorageKey(import.meta.env.VITE_SUPABASE_URL || '');

function persist(value: unknown) {
  window.localStorage.setItem(KEY, typeof value === 'string' ? value : JSON.stringify(value));
}

const stored = {
  access_token: 'a',
  refresh_token: 'r',
  expires_at: Math.floor(Date.now() / 1000) - 3_600,
  user: { id: 'u-1', email: 'x@example.com' },
};

afterEach(() => {
  window.localStorage.clear();
});

describe('readPersistedAuthUser', () => {
  it('returns the stored session user', () => {
    persist(stored);
    expect(readPersistedAuthUser()?.id).toBe('u-1');
  });

  it.each([
    ['nothing stored', undefined],
    ['unparseable', 'not json'],
    ['no user', { ...stored, user: null }],
    ['user without an id', { ...stored, user: { email: 'x' } }],
    ['no refresh token', { ...stored, refresh_token: '' }],
  ])('returns null for %s', (_label, value) => {
    if (value !== undefined) persist(value);
    expect(readPersistedAuthUser()).toBeNull();
  });
});

describe('readPersistedAuthUser bound', () => {
  const expiredAgo = (ms: number) => Math.floor((Date.now() - ms) / 1000);

  it('still resolves just inside the saved-permissions window', () => {
    persist({ ...stored, expires_at: expiredAgo(OFFLINE_SESSION_CACHE_TTL_MS - 60_000) });
    expect(readPersistedAuthUser()?.id).toBe('u-1');
  });

  it('stops once identity would outlive the saved permissions', () => {
    persist({ ...stored, expires_at: expiredAgo(OFFLINE_SESSION_CACHE_TTL_MS + 60_000) });
    expect(readPersistedAuthUser()).toBeNull();
  });

  it('is null when the session has no expires_at', () => {
    persist({ ...stored, expires_at: undefined });
    expect(readPersistedAuthUser()).toBeNull();
  });
});

describe('resolveGetSessionUser', () => {
  it('keeps the persisted user for a network-class error and for a null with no error', () => {
    persist(stored);
    const offline = new AuthRetryableFetchError('Failed to fetch', 0);
    expect(resolveGetSessionUser(null, offline)?.id).toBe('u-1');
    expect(resolveGetSessionUser(null, null)?.id).toBe('u-1');
  });

  it('does not fall back for a definitive auth error', () => {
    persist(stored);
    expect(resolveGetSessionUser(null, new Error('invalid_grant'))).toBeNull();
  });

  it('classifies network errors', () => {
    expect(isNetworkClassAuthError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkClassAuthError(new Error('boom'))).toBe(false);
  });
});

describe('resolveSessionUser', () => {
  const live = { user: { id: 'live' } } as Session;

  it('prefers the live session', () => {
    persist(stored);
    expect(resolveSessionUser('TOKEN_REFRESHED', live)?.id).toBe('live');
  });

  it.each(['INITIAL_SESSION', 'GET_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED'] as const)(
    'a null session on %s keeps the persisted user (a refresh that failed, not a sign-out)',
    event => {
      persist(stored);
      expect(resolveSessionUser(event, null)?.id).toBe('u-1');
    }
  );

  it('SIGNED_OUT is definitive even if storage still holds a session', () => {
    persist(stored);
    expect(resolveSessionUser('SIGNED_OUT', null)).toBeNull();
  });

  it('is null when nothing is persisted', () => {
    expect(resolveSessionUser('INITIAL_SESSION', null)).toBeNull();
  });
});
