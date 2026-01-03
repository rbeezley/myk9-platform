/**
 * Authentication utilities for myK9Q passcode system
 * Handles parsing mobile_app_lic_key into role-based passcodes
 */

export type UserRole = 'admin' | 'judge' | 'steward' | 'exhibitor';

export interface PasscodeResult {
  role: UserRole;
  licenseKey: string;
  isValid: boolean;
}

export interface UserPermissions {
  canViewPasscodes: boolean;
  canAccessScoresheet: boolean;
  canChangeRunOrder: boolean;
  canCheckInDogs: boolean;
  canScore: boolean;
  canManageClasses: boolean;
}

/**
 * Parses a 5-character passcode to extract role and license key parts
 * Format: [Role Prefix][4 digits from license key]
 * 
 * @param passcode - 5 character passcode (e.g., "ad860", "j9f3b")
 * @returns PasscodeResult with role, license key parts, and validity
 */
export function parsePasscode(passcode: string): PasscodeResult {
  if (!passcode || passcode.length !== 5) {
    return {
      role: 'exhibitor',
      licenseKey: '',
      isValid: false
    };
  }

  const rolePrefix = passcode.charAt(0).toLowerCase();
  const digits = passcode.slice(1);

  let role: UserRole;
  switch (rolePrefix) {
    case 'a':
      role = 'admin';
      break;
    case 'j':
      role = 'judge';
      break;
    case 's':
      role = 'steward';
      break;
    case 'e':
      role = 'exhibitor';
      break;
    default:
      return {
        role: 'exhibitor',
        licenseKey: '',
        isValid: false
      };
  }

  return {
    role,
    licenseKey: digits,
    isValid: true
  };
}

/**
 * Generates all 4 passcodes from a mobile_app_lic_key
 * Format: myK9Q1-d8609f3b-d3fd43aa-6323a604
 * Extracts: d860, 9f3b, d3fd, 6323
 * 
 * @param mobileAppLicKey - Full license key from database
 * @returns Object with all 4 passcodes
 */
export function generatePasscodesFromLicenseKey(mobileAppLicKey: string): {
  admin: string;
  judge: string;
  steward: string;
  exhibitor: string;
} | null {
  if (!mobileAppLicKey) return null;

  // Split by hyphens: ["myK9Q1", "d8609f3b", "d3fd43aa", "6323a604"]
  const parts = mobileAppLicKey.split('-');
  
  if (parts.length !== 4) return null;

  // Extract 4 digits from each part
  const adminDigits = parts[1].slice(0, 4);    // "d860"
  const judgeDigits = parts[1].slice(4, 8);    // "9f3b" 
  const stewardDigits = parts[2].slice(0, 4);  // "d3fd"
  const exhibitorDigits = parts[3].slice(0, 4); // "6323"

  return {
    admin: `a${adminDigits}`,      // "ad860"
    judge: `j${judgeDigits}`,      // "j9f3b"
    steward: `s${stewardDigits}`,  // "sd3fd"
    exhibitor: `e${exhibitorDigits}` // "e6323"
  };
}

/**
 * Validates if a passcode matches any of the generated passcodes from a license key
 * 
 * @param passcode - User entered passcode
 * @param mobileAppLicKey - License key from database
 * @returns PasscodeResult if valid, null if invalid
 */
export function validatePasscodeAgainstLicenseKey(
  passcode: string, 
  mobileAppLicKey: string
): PasscodeResult | null {
  const parsedPasscode = parsePasscode(passcode);
  if (!parsedPasscode.isValid) return null;

  const generatedPasscodes = generatePasscodesFromLicenseKey(mobileAppLicKey);
  if (!generatedPasscodes) return null;

  // Check if entered passcode matches any of the generated ones
  const isValidPasscode = Object.values(generatedPasscodes).includes(passcode.toLowerCase());
  
  if (!isValidPasscode) return null;

  return {
    ...parsedPasscode,
    licenseKey: mobileAppLicKey
  };
}

/**
 * Gets user permissions based on role
 * 
 * @param role - User role
 * @returns UserPermissions object
 */
export function getPermissionsForRole(role: UserRole): UserPermissions {
  switch (role) {
    case 'admin':
      return {
        canViewPasscodes: true,
        canAccessScoresheet: true,
        canChangeRunOrder: true,
        canCheckInDogs: true,
        canScore: true,
        canManageClasses: true
      };
    case 'judge':
      return {
        canViewPasscodes: false,
        canAccessScoresheet: true,
        canChangeRunOrder: true,
        canCheckInDogs: true,
        canScore: true,
        canManageClasses: true
      };
    case 'steward':
      return {
        canViewPasscodes: false,
        canAccessScoresheet: false,
        canChangeRunOrder: true,
        canCheckInDogs: true,
        canScore: false,
        canManageClasses: false
      };
    case 'exhibitor':
      return {
        canViewPasscodes: false,
        canAccessScoresheet: false,
        canChangeRunOrder: false,
        canCheckInDogs: true,
        canScore: false,
        canManageClasses: false
      };
    default:
      return {
        canViewPasscodes: false,
        canAccessScoresheet: false,
        canChangeRunOrder: false,
        canCheckInDogs: false,
        canScore: false,
        canManageClasses: false
      };
  }
}