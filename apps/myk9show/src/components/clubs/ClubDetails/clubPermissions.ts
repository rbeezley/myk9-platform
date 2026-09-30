/**
 * Club-profile permission rules for `/clubs/:id`.
 *
 * Extracted from `useClubDetailsState` so the rules can be unit-tested without
 * mocking the auth context, and so the hook stays under the 500-line ceiling.
 */
import { ScopeType, UserRole } from '@/types/auth-types';
import type { RoleScope } from '@/types/auth-types';

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
 * Roles whose club-scoped grant lets the holder create a show for that club.
 * Mirrors the gate in `create_show_with_children` (migration 20260929233100):
 * `is_site_admin() OR is_club_admin(club) OR is_trial_secretary(club)`, where
 * `is_trial_secretary` accepts the `secretary` and `trial_secretary` role names.
 *
 * This is permission to CREATE a draft. It is deliberately not the club's
 * approval to publish (`clubs.authorized_at`), which gates publishing only.
 */
const CLUB_SHOW_CREATOR_ROLE_NAMES: readonly string[] = [
  UserRole.CLUB_ADMIN,
  UserRole.SECRETARY,
  'trial_secretary',
];

/**
 * The ONE client-side answer to "can this user create a show for this club?"
 * (MYK9-887, MYK9-890): used by the wizard's Basics step and the club page's
 * Add Show buttons. UI guidance only; the RPC remains the authority on submit.
 */
export function canCreateShowForClub(
  user: { roles?: readonly UserRole[]; scopes?: RoleScope[] } | null | undefined,
  clubId: string | undefined
): boolean {
  if (!user || !clubId) return false;
  if (user.roles?.includes(UserRole.SITE_ADMIN)) return true;
  // Only CLUB-scoped rows count. A show-scoped row (user_roles.show_id set) never grants
  // club-level create, matching is_trial_secretary's `show_id IS NULL`.
  return (user.scopes ?? []).some(
    scope =>
      scope.scopeType === ScopeType.CLUB &&
      scope.scopeId === clubId &&
      CLUB_SHOW_CREATOR_ROLE_NAMES.includes(scope.roleId)
  );
}
