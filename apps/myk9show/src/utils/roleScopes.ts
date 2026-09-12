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
 * this gate, and it must deny by default.
 *
 * Only `site_admin` is global. BOTH staff roles are club-scoped, because that is
 * what the server enforces: `_can_manage_show_passcodes` (and every predicate
 * built on it) resolves to `is_site_admin() or is_club_admin(club) or
 * is_trial_secretary(club)`, and `is_trial_secretary` matches on `ur.club_id`.
 * A global `hasRole(SECRETARY)` therefore rendered manage controls that the
 * database then refused — Club A's secretary was offered "Generate new codes"
 * on Club B's show and got "You don't have permission to make that change".
 * MYK9-123 scoped `club_admin` for exactly this reason and left `secretary`
 * global by omission; the same argument always applied to both.
 *
 * Extracted because the identical expression was being re-typed at every
 * operational surface, and each copy was one omission away from either leaking
 * staff controls to exhibitors (MYK9-123) or dropping the club scope.
 */
export function canManageShowSurface({
  isSecretary,
  isAdmin,
  hasRole,
  userWithRoles,
  clubId,
}: ShowSurfaceViewer): boolean {
  if (isAdmin) return true;
  // The club id is unknown while the show is still resolving. Deny by default:
  // a control that flashes in and then disappears is the same mistake-anxiety
  // bug as never gating it at all.
  if (!clubId) return false;
  if (isSecretary && hasScopedClubRole(userWithRoles, UserRole.SECRETARY, clubId)) return true;
  return (
    hasRole(UserRole.CLUB_ADMIN) && hasScopedClubRole(userWithRoles, UserRole.CLUB_ADMIN, clubId)
  );
}

/** Secretary/admin management shell access for a specific show's owning club. */
export function canManageShowAsSecretaryOrAdmin({
  isSecretary,
  isAdmin,
  userWithRoles,
  clubId,
}: Pick<ShowSurfaceViewer, 'isSecretary' | 'isAdmin' | 'userWithRoles' | 'clubId'>): boolean {
  if (isAdmin) return true;
  return isSecretary && hasScopedClubRole(userWithRoles, UserRole.SECRETARY, clubId);
}

/** The staff roles that carry show-management rights over their club's shows. */
const CLUB_STAFF_ROLES: readonly UserRole[] = [UserRole.SECRETARY, UserRole.CLUB_ADMIN];

/**
 * Clubs whose shows this viewer may operate, or `null` for "every club" —
 * which only a site admin gets.
 *
 * For narrowing a LIST of shows to the ones a viewer actually manages, where
 * calling {@link canManageShowSurface} per row would mean re-deriving the same
 * scope set on every element.
 */
export function managedClubIds(viewer: {
  isAdmin: boolean;
  userWithRoles: UserWithRoles | null | undefined;
}): Set<string> | null {
  if (viewer.isAdmin) return null;
  return new Set(
    (viewer.userWithRoles?.scopes ?? [])
      .filter(
        scope =>
          scope.scopeType === ScopeType.CLUB && CLUB_STAFF_ROLES.includes(scope.roleId as UserRole)
      )
      .map(scope => scope.scopeId)
  );
}

/**
 * Narrow a list of shows to the ones this viewer may operate.
 *
 * A show whose `clubId` has not loaded yet is excluded: an unowned show in a
 * "my shows" list is worse than a briefly short list, because every affordance
 * downstream of it (Show Desk, Setup) will be refused by the server.
 */
export function filterManagedShows<T extends { clubId?: string | null | undefined }>(
  shows: readonly T[],
  managed: Set<string> | null
): T[] {
  if (managed === null) return [...shows];
  return shows.filter((show): boolean => !!show.clubId && managed.has(show.clubId));
}
