import { UserRole } from '@/types/auth-types';

/**
 * Roles that get the FULL class picker at a show, so their view does not
 * depend on judge assignments even when the account also holds JUDGE.
 */
const BROADER_STAFF_ROLES = [
  UserRole.SITE_ADMIN,
  UserRole.SECRETARY,
  UserRole.CLUB_ADMIN,
  UserRole.CHAIRMAN,
  UserRole.STEWARD,
] as const;

/**
 * True when the account's at-show view is driven ONLY by judge assignments.
 * Shared by AtShowClassListPage (which filters classes) and the offline
 * readiness badge (which must require the assignment cache for exactly these
 * users, and must not demand it from a secretary who also judges).
 */
export function isJudgeOnlyAtShow({
  isAnonymous,
  hasRole,
}: {
  isAnonymous: boolean;
  hasRole: (role: UserRole) => boolean;
}): boolean {
  if (isAnonymous || !hasRole(UserRole.JUDGE)) return false;
  return !BROADER_STAFF_ROLES.some(role => hasRole(role));
}
