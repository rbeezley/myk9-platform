import type { UserRole as RingsideRole } from '@myk9/ringside';
import { useRehydrateRingsideGrant } from './useRehydrateRingsideGrant';
import { useRingsideEffectiveRole } from './useRingsideEffectiveRole';

/**
 * The dog finder is for staff only (MYK9-1509): judges, stewards, secretaries and
 * club admins. An exhibitor (MYK9-1517) is a separate view, an unresolved role gets
 * nothing here. Reads the same effective role every other ringside surface does.
 */
export function isStaffRingsideRole(role: RingsideRole | null): boolean {
  return role === 'admin' || role === 'judge' || role === 'steward';
}

export function useIsStaffDogViewer(showId: string | undefined): boolean {
  return useDogViewerKind(showId) === 'staff';
}

export type DogViewerKind = 'staff' | 'exhibitor' | null;

/**
 * Which dog finder the viewer gets: staff read the replica (MYK9-1509), an exhibitor
 * reads the privacy-reviewed server list (MYK9-1517). An unresolved role gets neither.
 */
export function useDogViewerKind(showId: string | undefined): DogViewerKind {
  const { ringsideRole } = useRingsideEffectiveRole(showId);
  // A passcode-only judge or steward is admitted from the session claim before the in-memory
  // grant store is restored; `AtShowAccessGate` uses this same hook's answer on first render,
  // so the grant wins here too and a reload never bounces staff off the page.
  const rehydratedRole = useRehydrateRingsideGrant(showId);
  const role = rehydratedRole ?? ringsideRole;
  if (isStaffRingsideRole(role)) return 'staff';
  return role === 'exhibitor' ? 'exhibitor' : null;
}
