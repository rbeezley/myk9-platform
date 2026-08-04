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
    scope => scope.scopeType === ScopeType.CLUB && scope.scopeId === clubId && scope.roleId === role
  );
}

export function hasScopedShowRole(
  userWithRoles: UserWithRoles | null | undefined,
  role: UserRole,
  showId: string | undefined
): boolean {
  if (!showId) return false;
  return (userWithRoles?.scopes ?? []).some(
    scope => scope.scopeType === ScopeType.SHOW && scope.scopeId === showId && scope.roleId === role
  );
}

export interface ShowSurfaceViewer {
  isSecretary: boolean;
  isAdmin: boolean;
  hasRole: (role: UserRole) => boolean;
  userWithRoles: UserWithRoles | null | undefined;
  /** Club that owns the show this surface belongs to. */
  clubId: string | undefined;
}

/**
 * "May this viewer operate the staff controls on a show's public detail pages?"
 *
 * Trial detail and class detail are PUBLIC routes — exhibitors and guests reach
 * them from show landings — so every create/edit/delete affordance on them needs
 * this gate, and it must deny by default. Secretary and site admin are global;
 * `club_admin` is inherently club-scoped, so it is narrowed to the show's own
 * club (a global `hasRole()` alone would let Club A's admin manage Club B).
 *
 * Extracted because the identical three-clause expression was being re-typed at
 * every operational surface, and each copy was one omission away from either
 * leaking staff controls to exhibitors (MYK9-123) or dropping the club scope.
 */
export function canManageShowSurface({
  isSecretary,
  isAdmin,
  hasRole,
  userWithRoles,
  clubId,
}: ShowSurfaceViewer): boolean {
  if (isSecretary || isAdmin) return true;
  return (
    hasRole(UserRole.CLUB_ADMIN) && hasScopedClubRole(userWithRoles, UserRole.CLUB_ADMIN, clubId)
  );
}
