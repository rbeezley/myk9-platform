import { UserRole } from '@/types/auth-types';

/**
 * SA-008 (people over-fetch) — fetch-gating half.
 *
 * The people directory is bulk-loaded via `useUserStore.loadUsers()`
 * (`getAllUsers()` → the `people` table). Only management surfaces render a
 * people directory (owner pickers, user management, judge assignment, club
 * membership). A plain-exhibitor session has no consumer for it, so it must not
 * fire the fetch at login — that avoids shipping the directory (and, absent a
 * column allowlist, its PII) to the largest, least-privileged user population,
 * and removes the client's blind reliance on the `people_select` RLS policy
 * staying strict.
 *
 * INTENT: this is the single authoritative gate for whether a session loads the
 * people directory. Keep the initializer wiring a thin `if (shouldLoad) load()`
 * — do not inline a second role check elsewhere, or the two can silently
 * diverge (see the shared-priority-function lesson in the show-map work).
 */

/**
 * Roles whose surfaces consume the bulk people directory. Judges/stewards score
 * via ringside surfaces (not the userStore); exhibitors have no consumer at all.
 */
export const PEOPLE_DIRECTORY_ROLES: readonly UserRole[] = [
  UserRole.SITE_ADMIN,
  UserRole.SECRETARY,
  UserRole.CLUB_ADMIN,
  UserRole.CHAIRMAN,
];

/**
 * True when a session holding `roles` has a surface that needs the people
 * directory. A user with ANY management role qualifies (a dual
 * exhibitor+secretary still needs it); a session with only exhibitor / judge /
 * steward roles (or none) does not.
 */
export function shouldLoadPeopleDirectory(
  roles: readonly (UserRole | string)[] | null | undefined
): boolean {
  if (!roles || roles.length === 0) return false;
  const needed = PEOPLE_DIRECTORY_ROLES as readonly string[];
  return roles.some(role => needed.includes(role as string));
}
