// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { deriveDefaultAuthStorageKey, readPersistedAuthUserId } from '../persistedAuthUserId';

/**
 * MYK9-1133: the account stamp compares WHO is signed in, so it must not go
 * dark when the access token expires offline and `supabase.auth.getSession()`
 * errors (an hour past sign-in, jwt_expiry 3600). supabase-js keeps the session
 * in localStorage under `sb-<first hostname label>-auth-token`; the fallback
 * reads only the user id from it. It never authorizes or uploads anything.
 */

const URL_A = 'https://abcdefgh.supabase.co';
const KEY = 'sb-abcdefgh-auth-token';

function storageWith(entries: Record<string, string>) {
  return { getItem: (key: string) => entries[key] ?? null };
}

const session = (id: string) =>
  JSON.stringify({
    access_token: 'expired.jwt.token',
    refresh_token: 'r',
    expires_at: 1,
    token_type: 'bearer',
    user: { id, email: `${id}@example.com` },
  });

describe('deriveDefaultAuthStorageKey', () => {
  it('matches the key the installed supabase-js client persists its session under', () => {
    const client = createClient(URL_A, 'anon-key') as unknown as Record<string, unknown>;
    expect(deriveDefaultAuthStorageKey(URL_A)).toBe(client['storageKey']);
    expect(deriveDefaultAuthStorageKey(URL_A)).toBe(KEY);
  });
});

describe('readPersistedAuthUserId', () => {
  it('reads the user id of the persisted session, expired token and all', () => {
    expect(readPersistedAuthUserId(storageWith({ [KEY]: session('user-a') }), KEY)).toBe('user-a');
  });

  it('accepts the legacy currentSession shape', () => {
    const legacy = JSON.stringify({ currentSession: { user: { id: 'user-legacy' } } });
    expect(readPersistedAuthUserId(storageWith({ [KEY]: legacy }), KEY)).toBe('user-legacy');
  });

  it.each([
    ['no persisted session', {}],
    ['malformed JSON', { [KEY]: '{not json' }],
    ['a session with no user', { [KEY]: JSON.stringify({ access_token: 'x' }) }],
    ['a blank id', { [KEY]: JSON.stringify({ user: { id: '  ' } }) }],
    ['a non-string id', { [KEY]: JSON.stringify({ user: { id: 7 } }) }],
    ['another storage key', { 'sb-other-auth-token': session('user-x') }],
  ])('is null for %s', (_name, entries) => {
    expect(readPersistedAuthUserId(storageWith(entries), KEY)).toBeNull();
  });

  it('is null when storage throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(readPersistedAuthUserId(throwing, KEY)).toBeNull();
  });

  it('sign-out then another account sign-in replaces the persisted session', () => {
    const entries: Record<string, string> = { [KEY]: session('user-a') };
    const storage = storageWith(entries);
    expect(readPersistedAuthUserId(storage, KEY)).toBe('user-a');

    delete entries[KEY]; // auth-js removes the key on sign-out
    expect(readPersistedAuthUserId(storage, KEY)).toBeNull();

    entries[KEY] = session('user-b'); // the next sign-in overwrites it
    expect(readPersistedAuthUserId(storage, KEY)).toBe('user-b');
  });
});
