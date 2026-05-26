/**
 * @myk9/ringside — passcode auth foundation.
 *
 * Pure types and functions that any ringside-mounting host needs to make
 * sense of a 5-character role passcode (`aXXXX` admin, `jXXXX` judge,
 * `sXXXX` steward, `eXXXX` exhibitor) and translate roles into
 * permissions.
 *
 * What's NOT here (intentional):
 * - The `usePasscodeAuth()` hook that talks to the validate_passcode
 *   Edge Function — deferred to a later PR when a real ringside
 *   consumer exists to wire it to (per the plan §3 Q3, the host owns
 *   the AuthProvider).
 * - License-key derivation (`generatePasscodesFromLicenseKey`,
 *   `validatePasscodeAgainstLicenseKey`) — those are the legacy
 *   pre-validate_passcode path. They stay in apps/myk9q/src/utils/auth.ts
 *   until the authService offline fallback is rewritten. Moving them
 *   into the shared package would enshrine an outgoing API into the
 *   canonical surface.
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
 * Parse a 5-character passcode to extract its role prefix and the
 * trailing 4 digits.
 *
 * Format: `[role-letter][4 chars]` where role-letter is one of `a`
 * (admin), `j` (judge), `s` (steward), `e` (exhibitor). Case-insensitive
 * on input.
 *
 * @param passcode - 5-character passcode (e.g. `aa260`, `j9f3b`)
 * @returns role + the 4-digit suffix + an `isValid` flag. Invalid
 *   inputs return `{ role: 'exhibitor', licenseKey: '', isValid: false }`
 *   rather than throwing — callers always discriminate on `isValid`.
 */
export function parsePasscode(passcode: string): PasscodeResult {
  if (!passcode || passcode.length !== 5) {
    return {
      role: 'exhibitor',
      licenseKey: '',
      isValid: false,
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
        isValid: false,
      };
  }

  return {
    role,
    licenseKey: digits,
    isValid: true,
  };
}

/**
 * Translate a user role into a permissions matrix. The canonical source
 * of "what can each role do" in the ringside experience.
 *
 * Unknown roles fall through to an all-`false` matrix (safe default).
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
        canManageClasses: true,
      };
    case 'judge':
      return {
        canViewPasscodes: false,
        canAccessScoresheet: true,
        canChangeRunOrder: true,
        canCheckInDogs: true,
        canScore: true,
        canManageClasses: true,
      };
    case 'steward':
      return {
        canViewPasscodes: false,
        canAccessScoresheet: false,
        canChangeRunOrder: true,
        canCheckInDogs: true,
        canScore: false,
        canManageClasses: false,
      };
    case 'exhibitor':
      return {
        canViewPasscodes: false,
        canAccessScoresheet: false,
        canChangeRunOrder: false,
        canCheckInDogs: true,
        canScore: false,
        canManageClasses: false,
      };
    default:
      return {
        canViewPasscodes: false,
        canAccessScoresheet: false,
        canChangeRunOrder: false,
        canCheckInDogs: false,
        canScore: false,
        canManageClasses: false,
      };
  }
}
