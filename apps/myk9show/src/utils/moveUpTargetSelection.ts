/**
 * The ONE move-up target rule, shared by every surface that offers targets
 * (Entries Management approve dialog, Show Map, Show Desk) so none can drift
 * (MYK9-920). A target is a class that is `isEligibleMoveUpTarget` (same trial,
 * same element, strictly higher level) and is not known to be full.
 *
 * Capacity is ADVISORY here: `availableSpots` returns undefined when a surface
 * has no capacity data (still loading, read failed), which keeps the target
 * offered. The write path (`moveUpShowMapEntry`) and the server's capacity gate
 * refuse a full class either way, so a client count is never a money claim.
 */
import { isEligibleMoveUpTarget, type MoveUpClassIdentity } from './moveUpEligibility';
import type { RegistryId } from '@/features/registries';

export interface MoveUpTargetClass extends MoveUpClassIdentity {
  id: string;
}

export function selectMoveUpTargetClasses<T extends MoveUpTargetClass>(
  classes: readonly T[],
  currentClassId: string | null | undefined,
  registryId: RegistryId,
  availableSpots: (cls: T) => number | null | undefined
): T[] {
  if (!currentClassId) return [];
  const current = classes.find(cls => cls.id === currentClassId);
  if (!current) return [];

  return classes.filter(cls => {
    if (cls.id === currentClassId) return false;
    const spots = availableSpots(cls);
    if (typeof spots === 'number' && spots <= 0) return false;
    return isEligibleMoveUpTarget(current, cls, registryId);
  });
}
