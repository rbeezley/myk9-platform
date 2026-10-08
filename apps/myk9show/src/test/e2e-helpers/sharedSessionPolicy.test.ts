import { describe, expect, it } from 'vitest';

import {
  isReusableSession,
  readSessionToken,
  SHARED_SESSION_MIN_REMAINING_MS,
  sharedSessionFileName,
} from './sharedSessionPolicy';

const KEY = 'sb-sojmvhhwsjxmfistvzbe-auth-token';
const NOW = 1_800_000_000_000;

function sessionValue(expiresAtMs: number, accessToken = 'jwt'): string {
  return JSON.stringify({ access_token: accessToken, expires_at: expiresAtMs / 1000 });
}

describe('readSessionToken', () => {
  it('reads the access token and converts expires_at from seconds', () => {
    expect(readSessionToken(sessionValue(NOW))).toEqual({ accessToken: 'jwt', expiresAtMs: NOW });
  });

  it.each([
    ['not JSON', 'nope'],
    ['no access token', JSON.stringify({ expires_at: 1 })],
    ['empty access token', JSON.stringify({ access_token: '', expires_at: 1 })],
    ['no expiry', JSON.stringify({ access_token: 'jwt' })],
  ])('returns null for %s', (_label, value) => {
    expect(readSessionToken(value)).toBeNull();
  });
});

describe('isReusableSession', () => {
  it('shares a token with at least the minimum left', () => {
    const value = sessionValue(NOW + SHARED_SESSION_MIN_REMAINING_MS);
    expect(isReusableSession({ key: KEY, value }, NOW)).toBe(true);
  });

  it('refuses a token about to expire, so no worker refreshes a shared session', () => {
    const value = sessionValue(NOW + SHARED_SESSION_MIN_REMAINING_MS - 1);
    expect(isReusableSession({ key: KEY, value }, NOW)).toBe(false);
  });

  it('refuses an entry that is not a supabase-js session key', () => {
    const value = sessionValue(NOW + 60 * 60 * 1000);
    expect(isReusableSession({ key: 'myk9:prop', value }, NOW)).toBe(false);
  });
});

describe('sharedSessionFileName', () => {
  it('gives each address its own safe file name', () => {
    expect(sharedSessionFileName('Exhibitor@myk9t.com')).toBe('exhibitor_myk9t_com.json');
    expect(sharedSessionFileName('load-secretary-1@myk9t.com')).toBe(
      'load_secretary_1_myk9t_com.json'
    );
  });
});
