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
export function hasClubAdminScope(
  scopes: RoleScope[] | undefined,
  clubId: string
): boolean {
  return (scopes ?? []).some(
    scope =>
      scope.scopeType === ScopeType.CLUB &&
      scope.scopeId === clubId &&
      scope.roleId === UserRole.CLUB_ADMIN
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
