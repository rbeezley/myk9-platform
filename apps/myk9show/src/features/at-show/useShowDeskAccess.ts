import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { hasScopedClubRole } from '@/utils/roleScopes';

/**
 * True when the caller reaches the show page's management tabs. Mirrors
 * ShowManagementSectionRoute's admission exactly: secretary/site-admin pass
 * unconditionally, but a club admin only reaches show-desk when scoped to THIS
 * show's club. Predicting with a coarser check (any club admin) would send a
 * cross-club admin to a route that then bounces them to the public show page.
 */
export function useShowDeskAccess(clubId: string | undefined): boolean {
  const { hasRole, userWithRoles } = useAuthContext();
  return (
    hasRole(UserRole.SECRETARY) ||
    hasRole(UserRole.SITE_ADMIN) ||
    (hasRole(UserRole.CLUB_ADMIN) && hasScopedClubRole(userWithRoles, UserRole.CLUB_ADMIN, clubId))
  );
}
