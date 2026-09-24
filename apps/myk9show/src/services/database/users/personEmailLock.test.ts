import { describe, it, expect } from 'vitest';
import { decidePersonEmailLock, type PersonEmailLockFacts } from './personEmailLock';

const none: PersonEmailLockFacts = { hasSignIn: false, hasRoles: false, hasEntries: false };

// Mirrors people_guard_identity_columns() (20260923211700) and
// enforce_sign_in_email_match() (MYK9-136). One row per database branch.
describe('decidePersonEmailLock', () => {
  it.each([
    // [label, isSiteAdmin, facts, expected]
    ['signed-in person, secretary', false, { ...none, hasSignIn: true }, 'sign-in'],
    ['signed-in person, site admin', true, { ...none, hasSignIn: true }, 'sign-in'],
    ['role holder, secretary', false, { ...none, hasRoles: true }, 'site-admin-only'],
    ['person with entries, secretary', false, { ...none, hasEntries: true }, 'site-admin-only'],
    ['role holder, site admin', true, { ...none, hasRoles: true }, null],
    ['person with entries, site admin', true, { ...none, hasEntries: true }, null],
    ['plain mail-in person, secretary', false, none, null],
    ['plain mail-in person, site admin', true, none, null],
  ] as const)('%s', (_label, isSiteAdmin, facts, expected) => {
    const decision = decidePersonEmailLock({ isSiteAdmin, facts });
    if (expected === null) {
      expect(decision).toEqual({ locked: false });
    } else {
      expect(decision).toEqual({ locked: true, reason: expected });
    }
  });

  it('treats unknown facts as editable (the database still refuses)', () => {
    expect(decidePersonEmailLock({ isSiteAdmin: false, facts: null })).toEqual({ locked: false });
  });
});
