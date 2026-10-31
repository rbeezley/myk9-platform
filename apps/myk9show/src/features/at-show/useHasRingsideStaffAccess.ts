/**
 * Is this viewer admitted to ringside for THIS show by staff standing alone (no entry needed)?
 *
 * Three show-scoped clauses: a show-scoped passcode grant (`AtShowAccessGate`'s first clause); an
 * account staff role scoped to this show or its club (`hasRingsideAccountShowAccess`); or a judge
 * with an active assignment at this show, class-level or show-level (the same
 * affiliation source `useMyJudgedShows` reads). A staff role held for another show or club does not count, so
 * browsing an unrelated show keeps the public landing. The show page uses it so a judge, steward or
 * passcode user reaches the Results tab during the show (MYK9-1544).
 *
 * A judge whose assignments cannot be known yet (offline cold boot: roles cached, identity not) is
 * admitted rather than shown the wrong surface; the Results tab's release gate still applies.
 */
import { useMyJudgedShows } from '@/features/messages/hooks/useMyJudgedShows';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { hasRingsideAccountShowAccess } from './ringsideAccountAccess';
import { useRehydrateRingsideGrant } from './useRehydrateRingsideGrant';

export function useHasRingsideStaffAccess(
  showId: string | undefined,
  clubId: string | undefined
): boolean {
  const { hasRole, userWithRoles } = useAuthContext();
  const grantRole = useRehydrateRingsideGrant(showId);
  const judged = useMyJudgedShows(true);
  if (grantRole) return true;
  if (
    showId &&
    clubId &&
    hasRingsideAccountShowAccess(userWithRoles, hasRole, { id: showId, clubId })
  )
    return true;
  if (!hasRole(UserRole.JUDGE)) return false;
  if (judged.status === 'not-judge') return false;
  if (judged.status !== 'known') return true;
  return judged.shows.some(show => show.showId === showId);
}
