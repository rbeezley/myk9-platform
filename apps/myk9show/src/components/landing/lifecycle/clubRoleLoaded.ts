import { ScopeType, UserRole, type RoleScope } from '@/types/auth-types';

/**
 * MYK9-2214: true when the roles held in the auth context include a club admin or secretary
 * grant for this club. The dashboard reads the same scopes, so this is the proof that it will see
 * the new club (a resolved refresh is not: it resolves even when its fetch failed). Kept apart
 * from the dashboard's own helper so the landing page does not pull the app into its light start.
 */
export function scopesHoldClubRole(
  scopes: readonly Pick<RoleScope, 'scopeType' | 'scopeId' | 'roleId'>[] | undefined,
  clubId: string
): boolean {
  return (scopes ?? []).some(
    s =>
      s.scopeType === ScopeType.CLUB &&
      s.scopeId === clubId &&
      (s.roleId === UserRole.CLUB_ADMIN || s.roleId === UserRole.SECRETARY)
  );
}
