/**
 * Is this viewer admitted to ringside for the show by staff standing alone (no entry needed)?
 *
 * The same two clauses `AtShowAccessGate` admits on first: a show-scoped passcode grant, or an
 * account staff role. The show page uses it so a judge, steward or passcode user reaches the
 * Results tab during the show instead of the public landing (MYK9-1544).
 */
import { useAuthContext } from '@/hooks/useAuthContext';
import { hasRingsideStaffRole } from './ringsideAccountAccess';
import { useRehydrateRingsideGrant } from './useRehydrateRingsideGrant';

export function useHasRingsideStaffAccess(showId: string | undefined): boolean {
  const { hasRole } = useAuthContext();
  const grantRole = useRehydrateRingsideGrant(showId);
  return Boolean(grantRole) || hasRingsideStaffRole(hasRole);
}
