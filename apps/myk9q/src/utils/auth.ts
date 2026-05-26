/**
 * Legacy passcode derivation utilities for myK9Q.
 *
 * The functions below derive a show's 4 passcodes from its
 * `mobile_app_lic_key` (legacy) or show UUID. This is the
 * pre-`validate_passcode` path — superseded by the HMAC-pepper RPC
 * deployed in 2026-05 (see show_passcodes table + validate_passcode
 * Edge Function). They remain in place because `services/authService.ts`
 * still calls `validatePasscodeAgainstLicenseKey` as an offline-mode
 * fallback. Once that fallback is reworked to consume the
 * server-side `show_passcodes` cache (separate task), these can be
 * deleted along with the legacy derivation entirely.
 *
 * Pure types / parsing helpers / permissions moved to `@myk9/ringside`
 * (PR C of the ringside extraction). This file re-exports them for
 * backwards compatibility — any new code should import from
 * `@myk9/ringside` directly.
 */

import { generatePasscodesFromShowId } from '@myk9/core';
import { parsePasscode } from '@myk9/ringside';

// ── Re-exports from @myk9/ringside ──────────────────────────────────────
// Kept so existing `import { UserRole } from '@/utils/auth'` callsites
// outside the consumers updated in PR C continue to resolve. Drop in a
// follow-up cleanup PR once we've audited that no third-party / dynamic
// imports rely on this file.
export type { UserRole, UserPermissions, PasscodeResult } from '@myk9/ringside';
export { parsePasscode, getPermissionsForRole } from '@myk9/ringside';

// ── Legacy derivation (myK9Q-only, staged for removal) ──────────────────

/**
 * Generates all 4 passcodes from a mobile_app_lic_key
 * Supports two formats:
 * 1. Legacy: myK9Q1-d8609f3b-d3fd43aa-6323a604 (4 parts)
 * 2. UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (5 parts)
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

  // UUID format (5 segments): delegate to the canonical implementation in @myk9/core
  const uuidPasscodes = generatePasscodesFromShowId(mobileAppLicKey);
  if (uuidPasscodes) return uuidPasscodes;

  // Legacy format: myK9Q1-8hex-8hex-8hex (two roles share parts[1], sliced at different offsets)
  const parts = mobileAppLicKey.split('-');
  if (parts.length === 4) {
    return {
      admin: `a${parts[1].slice(0, 4)}`,
      judge: `j${parts[1].slice(4, 8)}`,
      steward: `s${parts[2].slice(0, 4)}`,
      exhibitor: `e${parts[3].slice(0, 4)}`,
    };
  }

  return null;
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
) {
  const parsedPasscode = parsePasscode(passcode);
  if (!parsedPasscode.isValid) return null;

  const generatedPasscodes = generatePasscodesFromLicenseKey(mobileAppLicKey);
  if (!generatedPasscodes) return null;

  // Check if entered passcode matches any of the generated ones
  const isValidPasscode = Object.values(generatedPasscodes).includes(passcode.toLowerCase());

  if (!isValidPasscode) return null;

  return {
    ...parsedPasscode,
    licenseKey: mobileAppLicKey,
  };
}
