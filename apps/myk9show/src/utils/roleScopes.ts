import { ScopeType, UserRole, type UserWithRoles } from '@/types/auth-types';

/**
 * Scoped-role predicates.
 *
 * `hasRole()` on the auth context is GLOBAL — it answers "does this user hold
 * this role anywhere?" That is wrong for inherently scoped roles like
 * `club_admin`: a club admin for Club A must not gain management rights over
 * Club B's shows/trials. These helpers narrow a role check to a specific club
 * or show by matching the user's `scopes` (scopeType + scopeId + roleId).
 *
 * Pair them with a global `hasRole()` guard so the scopes lookup only runs for
 * users who actually hold the role, e.g.
 *   hasRole(UserRole.CLUB_ADMIN) && hasScopedClubRole(user, UserRole.CLUB_ADMIN, clubId)
 */
export function hasScopedClubRole(
  userWithRoles: UserWithRoles | null | undefined,
  role: UserRole,
  clubId: string | undefined
): boolean {
  if (!clubId) return false;
  return (userWithRoles?.scopes ?? []).some(
    scope =>
      scope.scopeType === ScopeType.CLUB && scope.scopeId === clubId && scope.roleId === role
  );
}

export function hasScopedShowRole(
  userWithRoles: UserWithRoles | null | undefined,
  role: UserRole,
  showId: string | undefined
): boolean {
  if (!showId) return false;
  return (userWithRoles?.scopes ?? []).some(
    scope =>
      scope.scopeType === ScopeType.SHOW && scope.scopeId === showId && scope.roleId === role
  );
}
