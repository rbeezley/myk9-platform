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

/** Secretary role names `is_trial_secretary` accepts (`trial_secretary` is not a `UserRole`). */
const CLUB_SECRETARY_ROLE_NAMES: readonly string[] = [UserRole.SECRETARY, 'trial_secretary'];

/**
 * THE one club_admin rule. Mirrors `is_club_admin(club)` / `is_show_club_admin(show)`
 * (migration 156, MYK9-1886): an active club_admin grant whose `club_id` is this club,
 * WHETHER OR NOT `show_id` is set, so a club admin granted for one show manages every show
 * of that club. The client scope list keeps one id per grant, so a show-pinned grant is a
 * SHOW scope on its own show's id and carries its club as `scope.clubId`
 * (`user_roles.club_id`), which needs no live show: a soft-deleted anchoring show does not
 * revoke it. `showId` also counts the grant on that exact show, and `shows` is the fallback
 * for a grant whose club could not be read.
 */
export function hasClubAdminGrant(
  user: UserWithRoles | null | undefined,
  {
    clubId,
    showId,
    shows,
  }: {
    clubId?: string | undefined;
    showId?: string | undefined;
    shows?: readonly { id: string; clubId?: string | null }[] | undefined;
  }
): boolean {
  if (hasScopedShowRole(user, UserRole.CLUB_ADMIN, showId)) return true;
  if (!clubId) return false;
  return (user?.scopes ?? []).some(scope => {
    if (scope.roleId !== UserRole.CLUB_ADMIN) return false;
    if (scope.scopeType === ScopeType.CLUB) return scope.scopeId === clubId;
    if (scope.scopeType !== ScopeType.SHOW) return false;
    if (scope.clubId) return scope.clubId === clubId;
    return !!shows?.some(s => s.id === scope.scopeId && s.clubId === clubId);
  });
}

/**
 * Mirrors `is_trial_secretary(club)` (migration 20260830210000): an active
 * `secretary` or `trial_secretary` grant at CLUB level (`show_id IS NULL`). A
 * secretary appointed to one show holds a SHOW scope and does not qualify.
 */
export function hasClubSecretaryGrant(
  user: UserWithRoles | null | undefined,
  clubId: string | undefined,
  roleNames: readonly string[] = CLUB_SECRETARY_ROLE_NAMES
): boolean {
  if (!clubId) return false;
  return (user?.scopes ?? []).some(
    scope =>
      scope.scopeType === ScopeType.CLUB &&
      scope.scopeId === clubId &&
      roleNames.includes(scope.roleId)
  );
}

/**
 * THE one club-staff rule: `is_club_admin(club) OR is_trial_secretary(club)`. Show
 * management, show creation and show deletion all read it, so a role added to either
 * server helper is added here once.
 */
export function hasClubStaffGrant(
  user: UserWithRoles | null | undefined,
  ids: { clubId?: string | undefined; showId?: string | undefined }
): boolean {
  return hasClubAdminGrant(user, ids) || hasClubSecretaryGrant(user, ids.clubId);
}

export interface ShowSurfaceViewer {
  isSecretary: boolean;
  isAdmin: boolean;
  hasRole: (role: UserRole) => boolean;
  userWithRoles: UserWithRoles | null | undefined;
  /** Club that owns the show this surface belongs to. */
  clubId: string | undefined;
  /** Replicated shows, the fallback for a show-pinned club_admin grant with no `clubId`. */
  shows?: readonly { id: string; clubId?: string | null }[] | undefined;
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
  shows,
}: ShowSurfaceViewer): boolean {
  if (isAdmin) return true;
  // The club id is unknown while the show is still resolving. Deny by default:
  // a control that flashes in and then disappears is the same mistake-anxiety
  // bug as never gating it at all.
  if (!clubId) return false;
  // Each scope check is paired with the global role the user must also hold, so a stale or
  // fixture scope with no role (a guest) grants nothing. `trial_secretary` is not a UserRole,
  // so it has no global role to pair with; it is the same server helper, and counts on its scope.
  if (isSecretary && hasClubSecretaryGrant(userWithRoles, clubId)) return true;
  if (hasRole(UserRole.CLUB_ADMIN) && hasClubAdminGrant(userWithRoles, { clubId, shows }))
    return true;
  return hasClubSecretaryGrant(userWithRoles, clubId, ['trial_secretary']);
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
  const managed = new Set<string>();
  for (const scope of viewer.userWithRoles?.scopes ?? []) {
    if (scope.scopeType === ScopeType.CLUB && CLUB_STAFF_ROLES.includes(scope.roleId as UserRole)) {
      managed.add(scope.scopeId);
    } else if (
      scope.scopeType === ScopeType.SHOW &&
      scope.roleId === UserRole.CLUB_ADMIN &&
      scope.clubId
    ) {
      // A show-pinned club_admin grant manages every show of its club (MYK9-1886).
      managed.add(scope.clubId);
    }
  }
  return managed;
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
