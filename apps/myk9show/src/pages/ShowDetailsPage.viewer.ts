import { useAuthContext } from '@/hooks/useAuthContext';
import { canManageShowSurface } from '@/utils/roleScopes';

/**
 * "May this viewer operate the staff controls on THIS show's detail page?"
 *
 * Club-scoped, not "is this user a secretary anywhere". `/shows/:id` is a
 * PUBLIC route — exhibitors and guests browse every club's shows from Find
 * Shows — while the server's manage predicates all resolve to
 * `is_site_admin() or is_club_admin(club) or is_trial_secretary(club)`.
 *
 * The global check disagreed with all of them: Club A's secretary was offered
 * the Show Access Codes "Generate new codes" button, schedule editing, the show
 * map and the manager tabs on Club B's show, and the database then refused every
 * one — surfacing as "You don't have permission to make that change" on a
 * control the app had just invited them to press.
 *
 * Pass the show's own `clubId`. While it is still resolving this denies, which
 * is the safe answer: a control that flashes in and then disappears is the same
 * mistake-anxiety bug as never gating it at all.
 */
export function useShowManageGate(clubId: string | undefined): boolean {
  const { isSecretary, isAdmin, hasRole, userWithRoles } = useAuthContext();
  return canManageShowSurface({ isSecretary, isAdmin, hasRole, userWithRoles, clubId });
}
