/**
 * Sign-out guard decision (MYK9-202).
 *
 * Signing out destroys the two things a venue with no internet cannot give
 * back: the Supabase session and the persisted RBAC cache (cleared on
 * sign-out by design for shared devices). Sign-in requires the auth server,
 * so a signed-out device at an offline show site is locked out of a show
 * that is fully replicated on its own disk. The guard puts that consequence
 * at the click instead of in documentation.
 */
import { UserRole } from '@/types/auth-types';

export type SignOutGuardMode = 'none' | 'staff-online' | 'offline';

/** Roles whose holders plausibly run a device at a connectivity-poor venue. */
export const STAFF_SIGN_OUT_ROLES: readonly string[] = [
  UserRole.SITE_ADMIN,
  UserRole.SECRETARY,
  UserRole.JUDGE,
  UserRole.STEWARD,
  UserRole.CLUB_ADMIN,
];

export function getSignOutGuardMode({
  isOffline,
  roles,
}: {
  isOffline: boolean;
  roles: readonly string[];
}): SignOutGuardMode {
  // Offline sign-out is immediately irreversible for everyone — signing back
  // in is impossible until connectivity returns.
  if (isOffline) return 'offline';
  if (roles.some(role => STAFF_SIGN_OUT_ROLES.includes(role))) return 'staff-online';
  return 'none';
}
