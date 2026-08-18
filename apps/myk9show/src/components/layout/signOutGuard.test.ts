import { describe, expect, it } from 'vitest';
import { UserRole } from '@/types/auth-types';
import { getSignOutGuardMode } from './signOutGuard';

describe('getSignOutGuardMode', () => {
  it('returns "offline" whenever the device is offline, regardless of role', () => {
    expect(getSignOutGuardMode({ isOffline: true, roles: [UserRole.EXHIBITOR] })).toBe('offline');
    expect(getSignOutGuardMode({ isOffline: true, roles: [UserRole.SECRETARY] })).toBe('offline');
    expect(getSignOutGuardMode({ isOffline: true, roles: [] })).toBe('offline');
  });

  it.each([
    UserRole.SECRETARY,
    UserRole.JUDGE,
    UserRole.STEWARD,
    UserRole.CLUB_ADMIN,
    UserRole.SITE_ADMIN,
  ])('returns "staff-online" online for the %s role', role => {
    expect(getSignOutGuardMode({ isOffline: false, roles: [role] })).toBe('staff-online');
  });

  it('returns "staff-online" when a staff role is mixed with non-staff roles', () => {
    expect(
      getSignOutGuardMode({ isOffline: false, roles: [UserRole.EXHIBITOR, UserRole.STEWARD] })
    ).toBe('staff-online');
  });

  it('returns "none" for a plain exhibitor online', () => {
    expect(getSignOutGuardMode({ isOffline: false, roles: [UserRole.EXHIBITOR] })).toBe('none');
  });

  it('returns "none" for no roles online', () => {
    expect(getSignOutGuardMode({ isOffline: false, roles: [] })).toBe('none');
  });
});
