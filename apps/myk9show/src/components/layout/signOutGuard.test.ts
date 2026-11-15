import { describe, expect, it } from 'vitest';
import { UserRole } from '@/types/auth-types';
import { getSignOutGuardMode, unsentPhrase, type SignOutUnsent } from './signOutGuard';

const NOTHING: SignOutUnsent = { scores: 0, otherChanges: 0 };

describe('getSignOutGuardMode', () => {
  it('returns "offline" whenever the device is offline, regardless of role', () => {
    for (const roles of [[UserRole.EXHIBITOR], [UserRole.SECRETARY], []]) {
      expect(getSignOutGuardMode({ isOffline: true, roles, unsent: NOTHING })).toBe('offline');
    }
  });

  it.each([
    UserRole.SECRETARY,
    UserRole.JUDGE,
    UserRole.STEWARD,
    UserRole.CLUB_ADMIN,
    UserRole.CHAIRMAN,
    UserRole.SITE_ADMIN,
  ])('returns "staff-online" online for the %s role', role => {
    expect(getSignOutGuardMode({ isOffline: false, roles: [role], unsent: NOTHING })).toBe(
      'staff-online'
    );
  });

  it('returns "staff-online" when a staff role is mixed with non-staff roles', () => {
    expect(
      getSignOutGuardMode({
        isOffline: false,
        roles: [UserRole.EXHIBITOR, UserRole.STEWARD],
        unsent: NOTHING,
      })
    ).toBe('staff-online');
  });

  it('returns "none" for a plain exhibitor online with nothing unsent', () => {
    expect(
      getSignOutGuardMode({ isOffline: false, roles: [UserRole.EXHIBITOR], unsent: NOTHING })
    ).toBe('none');
  });

  it('returns "none" for no roles online with nothing unsent', () => {
    expect(getSignOutGuardMode({ isOffline: false, roles: [], unsent: NOTHING })).toBe('none');
  });

  // MYK9-2013: a passcode session's roles are [] (RBAC not loaded) or the default exhibitor.
  it.each([[[]], [[UserRole.EXHIBITOR]]])(
    'warns online for a passcode session (roles %j) with unsent scores',
    roles => {
      expect(
        getSignOutGuardMode({ isOffline: false, roles, unsent: { scores: 2, otherChanges: 0 } })
      ).toBe('unsent');
      expect(
        getSignOutGuardMode({ isOffline: false, roles, unsent: { scores: 0, otherChanges: 1 } })
      ).toBe('unsent');
    }
  );

  it('warns when this device could not be read, never treating it as nothing unsent', () => {
    expect(getSignOutGuardMode({ isOffline: false, roles: [], unsent: null })).toBe('unsent');
  });
});

describe('unsentPhrase', () => {
  it('names the count in scores, changes, or both', () => {
    expect(unsentPhrase({ scores: 1, otherChanges: 0 })).toBe('1 score not sent');
    expect(unsentPhrase({ scores: 2, otherChanges: 0 })).toBe('2 scores not sent');
    expect(unsentPhrase({ scores: 0, otherChanges: 1 })).toBe('1 change not sent');
    expect(unsentPhrase({ scores: 0, otherChanges: 3 })).toBe('3 changes not sent');
    expect(unsentPhrase({ scores: 2, otherChanges: 1 })).toBe(
      '2 scores and 1 other change not sent'
    );
  });
});
