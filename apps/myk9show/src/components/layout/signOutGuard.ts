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

export type SignOutGuardMode = 'none' | 'staff-online' | 'offline' | 'unsent';

/**
 * What this device has not sent, from the one unsent-work source (MYK9-2011):
 * scores waiting or refused, and every other change. Null means the device
 * could not be read, which is never "nothing unsent".
 */
export interface SignOutUnsent {
  scores: number;
  otherChanges: number;
}

/** What the hosted warning dialog needs to render the right consequences. */
export interface SignOutWarningContext {
  mode: Exclude<SignOutGuardMode, 'none'>;
  unsent: SignOutUnsent | null;
}

/** Roles whose holders plausibly run a device at a connectivity-poor venue. */
export const STAFF_SIGN_OUT_ROLES: readonly string[] = [
  UserRole.SITE_ADMIN,
  UserRole.SECRETARY,
  UserRole.JUDGE,
  UserRole.STEWARD,
  UserRole.CLUB_ADMIN,
  UserRole.CHAIRMAN,
];

export function getSignOutGuardMode({
  isOffline,
  roles,
  unsent,
}: {
  isOffline: boolean;
  roles: readonly string[];
  unsent: SignOutUnsent | null;
}): SignOutGuardMode {
  // Offline sign-out is immediately irreversible for everyone — signing back
  // in is impossible until connectivity returns.
  if (isOffline) return 'offline';
  if (roles.some(role => STAFF_SIGN_OUT_ROLES.includes(role))) return 'staff-online';
  // MYK9-2013: a passcode session has no staff role (its roles are [] or the
  // default exhibitor), so unsent work warns on its own, whoever is signed in.
  if (unsent === null || unsentTotal(unsent) > 0) return 'unsent';
  return 'none';
}

export function unsentTotal(unsent: SignOutUnsent): number {
  return unsent.scores + unsent.otherChanges;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "2 scores not sent", "1 change not sent", "2 scores and 1 other change not sent". */
export function unsentPhrase(unsent: SignOutUnsent): string {
  const { scores, otherChanges } = unsent;
  if (scores > 0 && otherChanges > 0) {
    return `${plural(scores, 'score', 'scores')} and ${plural(otherChanges, 'other change', 'other changes')} not sent`;
  }
  if (scores > 0) return `${plural(scores, 'score', 'scores')} not sent`;
  return `${plural(otherChanges, 'change', 'changes')} not sent`;
}
