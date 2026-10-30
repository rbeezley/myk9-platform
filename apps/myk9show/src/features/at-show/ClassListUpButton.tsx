/**
 * The class list's Up control, and the one way out of Ringside (MYK9-1500).
 *
 * Ringside mounts outside the app shell, so the Up chain (scoresheet -> entries
 * -> classes -> here) ends at the show page. The destination is PREDICTED from
 * the caller's roles and must mirror ShowManagementSectionRoute's admission
 * exactly -- see the comment inside.
 */
import { useNavigate } from 'react-router-dom';
import { RingsideUpButton } from '@myk9/ui';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { hasScopedClubRole } from '@/utils/roleScopes';

export function ClassListUpButton({
  showId,
  clubId,
}: {
  showId: string | undefined;
  clubId: string | undefined;
}) {
  const navigate = useNavigate();
  const { hasRole, userWithRoles } = useAuthContext();
  // Mirror ShowManagementSectionRoute's admission exactly: secretary/site-admin
  // pass unconditionally, but a club admin only reaches show-desk when scoped to
  // THIS show's club. Predicting with a coarser check (any club admin) would
  // send a cross-club admin to a route that then bounces them to the public
  // show page — the ringside eject this button exists to avoid.
  const canUseShowDesk =
    hasRole(UserRole.SECRETARY) ||
    hasRole(UserRole.SITE_ADMIN) ||
    (hasRole(UserRole.CLUB_ADMIN) && hasScopedClubRole(userWithRoles, UserRole.CLUB_ADMIN, clubId));
  // The show home (MYK9-957) is where the desk lives now.
  const label = canUseShowDesk ? 'Show' : 'Ringside';
  const target = canUseShowDesk && showId ? `/shows/${showId}` : '/at-show';

  return <RingsideUpButton label={label} onClick={() => navigate(target)} />;
}
