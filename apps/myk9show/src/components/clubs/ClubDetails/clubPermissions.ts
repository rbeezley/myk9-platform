/**
 * Club-profile permission rules for `/clubs/:id`.
 *
 * Extracted from `useClubDetailsState` so the rules can be unit-tested without
 * mocking the auth context, and so the hook stays under the 500-line ceiling.
 */
import { ScopeType, UserRole } from '@/types/auth-types';
import type { RoleScope, UserWithRoles } from '@/types/auth-types';
import { hasClubStaffGrant } from '@/utils/roleScopes';

export interface ClubPermissions {
  /** Mirrors clubs_update RLS — site_admin or club_admin for this club. */
  canEditClub: boolean;
  canManageMembers: boolean;
  canEditBranding: boolean;
  /** Mirrors the clubs_delete RLS policy — only site_admin can delete clubs. */
  canDeleteClub: boolean;
}

/**
 * True when the signed-in user holds an ACTIVE club-scoped `club_admin` grant
 * for this club.
 *
 * Mirrors `is_club_admin(check_club_id)` (migration 155), the SECURITY DEFINER
 * helper behind the `clubs_update` RLS policy, so the affordances this page
 * shows match the writes the server will actually accept. `buildActiveRoleScopes`
 * has already dropped inactive rows and maps `roleId` to the role NAME.
 *
 * Do NOT reintroduce a lookup keyed on a user id here: the previous
 * implementation searched the eight hand-written `MOCK_USERS` fixtures, whose
 * ids are literals like 'club-admin-user' and never a real `people.id`, so it
 * returned false for every real account (MYK9-359).
 */
export function hasClubAdminScope(scopes: RoleScope[] | undefined, clubId: string): boolean {
  return (scopes ?? []).some(
    scope =>
      scope.scopeType === ScopeType.CLUB &&
      scope.scopeId === clubId &&
      scope.roleId === UserRole.CLUB_ADMIN
  );
}

/**
 * True when the signed-in user already holds an ACTIVE club-scoped
 * `secretary` grant for this club — i.e. appointment, mirroring
 * `is_trial_secretary(check_club_id)` (migration 20260830210000). Used to
 * hide the "Request show access" affordance for someone who already has it;
 * do not use this for authorization decisions, which stay server-side.
 */
export function hasClubSecretaryScope(scopes: RoleScope[] | undefined, clubId: string): boolean {
  return (scopes ?? []).some(
    scope =>
      scope.scopeType === ScopeType.CLUB &&
      scope.scopeId === clubId &&
      scope.roleId === UserRole.SECRETARY
  );
}

/**
 * Pure permission helper — extracted so it can be unit-tested without mocking
 * the auth context, club store, etc. Mirrors the RLS policies in
 * supabase/migrations/016_fix_permissive_rls_policies.sql.
 */
export function computeClubPermissions(args: {
  isClubAdmin: boolean;
  isSiteAdmin: boolean;
}): ClubPermissions {
  const { isClubAdmin, isSiteAdmin } = args;
  return {
    canEditClub: isSiteAdmin || isClubAdmin,
    canManageMembers: isClubAdmin,
    canEditBranding: isSiteAdmin || isClubAdmin,
    canDeleteClub: isSiteAdmin,
  };
}

/**
 * The ONE client-side answer to "can this user create a show for this club?"
 * (MYK9-887, MYK9-890), mirroring `create_show_with_children`
 * (`is_site_admin() OR is_club_admin(club) OR is_trial_secretary(club)`): used by the
 * wizard's Basics step and the club page's Add Show buttons. The club rule is
 * `hasClubStaffGrant`, shared with show management and show deletion. This is
 * permission to CREATE a draft, deliberately not the club's approval to publish
 * (`clubs.authorized_at`). UI guidance only; the RPC remains the authority on submit.
 */
export function canCreateShowForClub(
  user: { roles?: readonly UserRole[]; scopes?: RoleScope[] } | null | undefined,
  clubId: string | undefined
): boolean {
  if (!user || !clubId) return false;
  if (user.roles?.includes(UserRole.SITE_ADMIN)) return true;
  return hasClubStaffGrant(user as UserWithRoles, { clubId });
}

/**
 * Who may delete a show, mirroring `soft_delete_show` (migration 20261001235300):
 * `is_club_admin(club) OR is_trial_secretary(club) OR is_site_admin()`. `showId` lets a
 * club_admin grant pinned to this show count, as `is_club_admin` accepts it; a show-pinned
 * secretary does not (`is_trial_secretary` needs `show_id IS NULL`). A show with no club
 * is a site-admin matter, as on the server.
 */
export function canDeleteShowForClub(
  user: { roles?: readonly UserRole[]; scopes?: RoleScope[] } | null | undefined,
  ids: { clubId?: string | undefined; showId?: string | undefined }
): boolean {
  if (!user) return false;
  if (user.roles?.includes(UserRole.SITE_ADMIN)) return true;
  return hasClubStaffGrant(user as UserWithRoles, ids);
}
