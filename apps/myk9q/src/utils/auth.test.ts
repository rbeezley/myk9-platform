/**
 * Tests for authentication utilities
 */

import {
  parsePasscode,
  generatePasscodesFromLicenseKey,
  validatePasscodeAgainstLicenseKey,
  getPermissionsForRole
} from './auth';

// Test data based on the example: myK9Q1-d8609f3b-d3fd43aa-6323a604
const testLicenseKey = 'myK9Q1-d8609f3b-d3fd43aa-6323a604';
const expectedPasscodes = {
  admin: 'ad860',
  judge: 'j9f3b', 
  steward: 'sd3fd',
  exhibitor: 'e6323'
};

describe('parsePasscode', () => {
  test('parses admin passcode correctly', () => {
    const result = parsePasscode('ad860');
    expect(result).toEqual({
      role: 'admin',
      licenseKey: 'd860',
      isValid: true
    });
  });

  test('parses judge passcode correctly', () => {
    const result = parsePasscode('j9f3b');
    expect(result).toEqual({
      role: 'judge',
      licenseKey: '9f3b',
      isValid: true
    });
  });

  test('parses steward passcode correctly', () => {
    const result = parsePasscode('sd3fd');
    expect(result).toEqual({
      role: 'steward',
      licenseKey: 'd3fd',
      isValid: true
    });
  });

  test('parses exhibitor passcode correctly', () => {
    const result = parsePasscode('e6323');
    expect(result).toEqual({
      role: 'exhibitor',
      licenseKey: '6323',
      isValid: true
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

describe('generatePasscodesFromLicenseKey', () => {
  test('generates correct passcodes from license key', () => {
    const result = generatePasscodesFromLicenseKey(testLicenseKey);
    expect(result).toEqual(expectedPasscodes);
  });

  test('handles invalid license key format', () => {
    const result = generatePasscodesFromLicenseKey('invalid-key');
    expect(result).toBeNull();
  });

  test('handles empty license key', () => {
    const result = generatePasscodesFromLicenseKey('');
    expect(result).toBeNull();
  });
});

describe('validatePasscodeAgainstLicenseKey', () => {
  test('validates correct admin passcode', () => {
    const result = validatePasscodeAgainstLicenseKey('ad860', testLicenseKey);
    expect(result).toEqual({
      role: 'admin',
      licenseKey: testLicenseKey,
      isValid: true
    });
  });

  test('validates correct judge passcode', () => {
    const result = validatePasscodeAgainstLicenseKey('j9f3b', testLicenseKey);
    expect(result).toEqual({
      role: 'judge',
      licenseKey: testLicenseKey,
      isValid: true
    });
  });

  test('rejects incorrect passcode', () => {
    const result = validatePasscodeAgainstLicenseKey('a1234', testLicenseKey);
    expect(result).toBeNull();
  });

  test('rejects invalid passcode format', () => {
    const result = validatePasscodeAgainstLicenseKey('invalid', testLicenseKey);
    expect(result).toBeNull();
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
      canManageClasses: true
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
      canManageClasses: true
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
      canManageClasses: false
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
      canManageClasses: false
    });
  });
});