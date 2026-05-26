/**
 * Tests for the moved passcode auth foundation.
 *
 * The two legacy-derivation describe blocks (`generatePasscodesFromLicenseKey`
 * and `validatePasscodeAgainstLicenseKey`) stayed in
 * apps/myk9q/src/utils/auth.test.ts alongside their source functions —
 * those don't live in ringside.
 */

import { parsePasscode, getPermissionsForRole } from './passcodes';

describe('parsePasscode', () => {
  test('parses admin passcode correctly', () => {
    const result = parsePasscode('ad860');
    expect(result).toEqual({
      role: 'admin',
      licenseKey: 'd860',
      isValid: true,
    });
  });

  test('parses judge passcode correctly', () => {
    const result = parsePasscode('j9f3b');
    expect(result).toEqual({
      role: 'judge',
      licenseKey: '9f3b',
      isValid: true,
    });
  });

  test('parses steward passcode correctly', () => {
    const result = parsePasscode('sd3fd');
    expect(result).toEqual({
      role: 'steward',
      licenseKey: 'd3fd',
      isValid: true,
    });
  });

  test('parses exhibitor passcode correctly', () => {
    const result = parsePasscode('e6323');
    expect(result).toEqual({
      role: 'exhibitor',
      licenseKey: '6323',
      isValid: true,
    });
  });

  test('handles invalid passcode length', () => {
    const result = parsePasscode('a123');
    expect(result.isValid).toBe(false);
  });

  test('handles invalid role prefix', () => {
    const result = parsePasscode('x1234');
    expect(result.isValid).toBe(false);
  });

  test('handles empty passcode', () => {
    const result = parsePasscode('');
    expect(result.isValid).toBe(false);
  });
});

describe('getPermissionsForRole', () => {
  test('admin has all permissions', () => {
    const permissions = getPermissionsForRole('admin');
    expect(permissions).toEqual({
      canViewPasscodes: true,
      canAccessScoresheet: true,
      canChangeRunOrder: true,
      canCheckInDogs: true,
      canScore: true,
      canManageClasses: true,
    });
  });

  test('judge has most permissions except viewing passcodes', () => {
    const permissions = getPermissionsForRole('judge');
    expect(permissions).toEqual({
      canViewPasscodes: false,
      canAccessScoresheet: true,
      canChangeRunOrder: true,
      canCheckInDogs: true,
      canScore: true,
      canManageClasses: true,
    });
  });

  test('steward cannot access scoresheet or view passcodes', () => {
    const permissions = getPermissionsForRole('steward');
    expect(permissions).toEqual({
      canViewPasscodes: false,
      canAccessScoresheet: false,
      canChangeRunOrder: true,
      canCheckInDogs: true,
      canScore: false,
      canManageClasses: false,
    });
  });

  test('exhibitor can only check in dogs', () => {
    const permissions = getPermissionsForRole('exhibitor');
    expect(permissions).toEqual({
      canViewPasscodes: false,
      canAccessScoresheet: false,
      canChangeRunOrder: false,
      canCheckInDogs: true,
      canScore: false,
      canManageClasses: false,
    });
  });

  test('returns all-false permissions for an unknown role', () => {
    const permissions = getPermissionsForRole('unknown' as never);
    expect(permissions).toEqual({
      canViewPasscodes: false,
      canAccessScoresheet: false,
      canChangeRunOrder: false,
      canCheckInDogs: false,
      canScore: false,
      canManageClasses: false,
    });
  });
});
