import { rbacService } from '@/services/rbac/RBACService';

/**
 * MYK9-2199: true when the user's freshly loaded roles include an active grant scoped to this
 * club. `refreshPermissions()` resolves even when its fetch failed (the old roles stay), so a
 * resolved refresh does not prove the new club's role arrived; this reads what was actually
 * loaded (the service keeps the last successful answer) and checks for the club.
 */
export async function userHoldsClubRole(userId: string, clubId: string): Promise<boolean> {
  try {
    const { roles } = await rbacService.getUserPermissions(userId);
    return roles.some(
      role =>
        role.is_active &&
        (role.club_id === clubId || (role.scope_type === 'club' && role.scope_id === clubId))
    );
  } catch {
    return false;
  }
}
