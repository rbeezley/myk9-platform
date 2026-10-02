/**
 * The ONE move-up target rule, shared by every surface that offers targets
 * (Entries Management approve dialog, Show Map, Show Desk) so none can drift
 * (MYK9-920). A target is a class that is `isEligibleMoveUpTarget` (same trial,
 * same element, strictly higher level), carrying whether it is known full.
 *
 * Capacity is ADVISORY: `availableSpots` returns undefined when a surface has
 * no capacity data (still loading, read failed). The write path (`moveUpShowMapEntry`) and the server's capacity gate
 * refuse a full class either way, so a client count is never a money claim.
 */
import { isEligibleMoveUpTarget, type MoveUpClassIdentity } from './moveUpEligibility';
import type { RegistryId } from '@/features/registries';

export interface MoveUpTargetClass extends MoveUpClassIdentity {
  id: string;
}

export interface SelectedMoveUpTarget<T> {
  cls: T;
  /** Known to have no free seat. Never true when capacity is unknown. */
  isFull: boolean;
  /** Whether `availableSpots` returned a number for this class. */
  spotsKnown: boolean;
}

/**
 * Capacity never REMOVES a target here: a class that is full (or fills while a
 * dialog is open) stays in the list flagged `isFull`, so a surface can show it
 * disabled and a stale selection is visibly refused. Surfaces that prefer to
 * hide full classes filter on `isFull` in their own view layer.
 */
export function selectMoveUpTargetClasses<T extends MoveUpTargetClass>(
  classes: readonly T[],
  currentClassId: string | null | undefined,
  registryId: RegistryId,
  availableSpots: (cls: T) => number | null | undefined
): SelectedMoveUpTarget<T>[] {
  if (!currentClassId) return [];
  const current = classes.find(cls => cls.id === currentClassId);
  if (!current) return [];

  return classes
    .filter(cls => cls.id !== currentClassId && isEligibleMoveUpTarget(current, cls, registryId))
    .map(cls => {
      const spots = availableSpots(cls);
      const spotsKnown = typeof spots === 'number';
      return { cls, spotsKnown, isFull: spotsKnown && spots <= 0 };
    });
}
