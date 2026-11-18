import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import {
  computeClubPermissions,
  hasClubAdminScope,
} from '@/components/clubs/ClubDetails/clubPermissions';

/** The club's Payments tab (the old /club-admin/payments page now lives there). */
export function clubPaymentsHref(clubId: string): string {
  return `/clubs/${clubId}?tab=payments`;
}

export const CLUB_PAYMENTS_LINK_LABEL = 'Open Payments';

/**
 * Whether the signed-in person can open this club's Payments tab: the same rule the club page
 * uses to show it (`canManageMembers`, i.e. club admin for THIS club, or a site admin). A show
 * secretary who is not a club admin cannot, so links to the tab must not be offered to her.
 * Read from the cached role scopes, so it also answers offline.
 */
export function useCanOpenClubPayments(clubId: string | undefined): boolean {
  const { userWithRoles } = useAuthContext();
  if (!clubId || !userWithRoles) return false;
  const isSiteAdmin = userWithRoles.roles?.includes(UserRole.SITE_ADMIN) ?? false;
  const { canManageMembers } = computeClubPermissions({
    isClubAdmin: hasClubAdminScope(userWithRoles.scopes, clubId),
    isSiteAdmin,
  });
  return canManageMembers || isSiteAdmin;
}
