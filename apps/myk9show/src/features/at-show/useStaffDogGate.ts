import type { UserRole as RingsideRole } from '@myk9/ringside';
import { useRingsideEffectiveRole } from './useRingsideEffectiveRole';

/**
 * The dog finder is for staff only (MYK9-1509): judges, stewards, secretaries and
 * club admins. An exhibitor (own-dogs view, MYK9-1517) or an unresolved role gets
 * nothing here. Reads the same effective role every other ringside surface does.
 */
export function isStaffRingsideRole(role: RingsideRole | null): boolean {
  return role === 'admin' || role === 'judge' || role === 'steward';
}

export function useIsStaffDogViewer(showId: string | undefined): boolean {
  const { ringsideRole } = useRingsideEffectiveRole(showId);
  return isStaffRingsideRole(ringsideRole);
}
