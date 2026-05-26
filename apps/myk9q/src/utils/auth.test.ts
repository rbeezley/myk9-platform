/**
 * Tests for the legacy license-key derivation functions that still live
 * in apps/myk9q/src/utils/auth.ts.
 *
 * The pure-foundation tests (`parsePasscode`, `getPermissionsForRole`)
 * moved to packages/ringside/src/auth/passcodes.test.ts as part of the
 * ringside PR C extraction. They run there now.
 */

import {
  generatePasscodesFromLicenseKey,
  validatePasscodeAgainstLicenseKey,
} from './auth';

// Test data based on the example: myK9Q1-d8609f3b-d3fd43aa-6323a604
const testLicenseKey = 'myK9Q1-d8609f3b-d3fd43aa-6323a604';
const expectedPasscodes = {
  admin: 'ad860',
  judge: 'j9f3b',
  steward: 'sd3fd',
  exhibitor: 'e6323',
};

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

describe('generatePasscodesFromLicenseKey — UUID format', () => {
  const uuid = '63165809-e025-25c6-6cf9-979f63165809';

  test('derives correct passcodes from a show UUID', () => {
    expect(generatePasscodesFromLicenseKey(uuid)).toEqual({
      admin: 'ae025',
      judge: 'j25c6',
      steward: 's6cf9',
      exhibitor: 'e979f',
    });
  });

  test('legacy 4-part format still works', () => {
    expect(generatePasscodesFromLicenseKey('myK9Q1-d8609f3b-d3fd43aa-6323a604')).toEqual({
      admin: 'ad860',
      judge: 'j9f3b',
      steward: 'sd3fd',
      exhibitor: 'e6323',
    });
  });

  test('returns null for a 3-segment string', () => {
    expect(generatePasscodesFromLicenseKey('a-b-c')).toBeNull();
  });
});

describe('validatePasscodeAgainstLicenseKey', () => {
  test('validates correct admin passcode', () => {
    const result = validatePasscodeAgainstLicenseKey('ad860', testLicenseKey);
    expect(result).toEqual({
      role: 'admin',
      licenseKey: testLicenseKey,
      isValid: true,
    });
  });

  test('validates correct judge passcode', () => {
    const result = validatePasscodeAgainstLicenseKey('j9f3b', testLicenseKey);
    expect(result).toEqual({
      role: 'judge',
      licenseKey: testLicenseKey,
      isValid: true,
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
