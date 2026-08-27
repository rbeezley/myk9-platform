/**
 * The way out of the full-screen ringside surface.
 *
 * Ringside mounts outside the app shell, so this is the only chrome offering a
 * route back. The destination is PREDICTED from the caller's roles and must
 * mirror ShowManagementSectionRoute's admission exactly -- see the comment
 * inside.
 */
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { hasScopedClubRole } from '@/utils/roleScopes';

export function BackToRingsideExitButton({
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
  const label = canUseShowDesk ? 'Back to Show Desk' : 'Back to Ringside';
  const target = canUseShowDesk && showId ? `/shows/${showId}/show-desk` : '/at-show';

  return (
    <Button variant="ghost" className="min-h-11 gap-2 px-3" onClick={() => navigate(target)}>
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {label}
    </Button>
  );
}
