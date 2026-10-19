import { describe, expect, it } from 'vitest';
import { isFreshlyReauthenticated, reusableFreshToken } from './stepUpToken';
import { testJwt } from './stepUpTestTokens';

describe('reusableFreshToken', () => {
  const fresh = testJwt('u1', 5, 'fresh');
  const stale = testJwt('u1', 3_600, 'stale');

  it('reuses a newer, freshly confirmed session for the same account', () => {
    expect(reusableFreshToken(fresh, stale)).toBe(fresh);
  });

  it('never reuses the token that was just refused', () => {
    expect(reusableFreshToken(fresh, fresh)).toBeNull();
  });

  it('never reuses a stale or amr-less session', () => {
    expect(reusableFreshToken(testJwt('u1', 3_000, 'b'), stale)).toBeNull();
    expect(reusableFreshToken(testJwt('u1', null, 'c'), stale)).toBeNull();
  });

  it('never reuses another account’s session', () => {
    expect(reusableFreshToken(testJwt('u2', 5), stale)).toBeNull();
  });

  it('keeps a margin under the server’s five minutes', () => {
    expect(isFreshlyReauthenticated(testJwt('u1', 239))).toBe(true);
    expect(isFreshlyReauthenticated(testJwt('u1', 290))).toBe(false);
    expect(isFreshlyReauthenticated('garbage')).toBe(false);
  });
});
