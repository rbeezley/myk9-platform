import { describe, expect, it } from 'vitest';
import { isAccountSession, isPublicGuest } from '../guestServerRead';

// The one public-page guest rule. Owner decision: a ringside passcode session
// (an anonymous auth user) reads public pages like a signed-out guest.
describe('isPublicGuest / isAccountSession', () => {
  it.each([
    ['signed out', null, false, true, false],
    ['a ringside passcode session', { is_anonymous: true }, false, true, false],
    ['a signed-in account', { is_anonymous: false }, false, false, true],
    // The raw session user carries no is_anonymous for some providers; a
    // session whose roles have not resolved is still an account, not a guest.
    ['a session user without the flag', {}, false, false, true],
    ['auth still resolving, signed out', null, true, false, false],
    ['auth still resolving, passcode', { is_anonymous: true }, true, false, false],
  ])('%s', (_label, user, authLoading, guest, account) => {
    expect(isPublicGuest(user, authLoading)).toBe(guest);
    expect(isAccountSession(user)).toBe(account);
  });
});
