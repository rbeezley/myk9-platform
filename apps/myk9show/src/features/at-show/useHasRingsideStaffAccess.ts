/**
 * Is this viewer admitted to ringside for THIS show by staff standing alone (no entry needed)?
 *
 * Three show-scoped clauses: a show-scoped passcode grant (`AtShowAccessGate`'s first clause); an
 * account staff role scoped to this show or its club (`hasRingsideAccountShowAccess`); or a judge
 * assigned to classes in this show. A staff role held for another show or club does not count, so
 * browsing an unrelated show keeps the public landing. The show page uses it so a judge, steward or
 * passcode user reaches the Results tab during the show (MYK9-1544).
 *
 * A judge whose assignments cannot be known yet (offline cold boot: roles cached, identity not) is
 * admitted rather than shown the wrong surface; the Results tab's release gate still applies.
 */
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { hasRingsideAccountShowAccess } from './ringsideAccountAccess';
import { useMyAtShowJudgeAssignments } from './useMyAtShowJudgeAssignments';
import { useRehydrateRingsideGrant } from './useRehydrateRingsideGrant';

export function useHasRingsideStaffAccess(
  showId: string | undefined,
  clubId: string | undefined
): boolean {
  const { hasRole, userWithRoles } = useAuthContext();
  const grantRole = useRehydrateRingsideGrant(showId);
  const judgeAssignments = useMyAtShowJudgeAssignments(showId);
  if (grantRole) return true;
  if (
    showId &&
    clubId &&
    hasRingsideAccountShowAccess(userWithRoles, hasRole, { id: showId, clubId })
  )
    return true;
  return (
    hasRole(UserRole.JUDGE) &&
    (judgeAssignments.isUnknown || judgeAssignments.assignedClassIds.size > 0)
  );
}
