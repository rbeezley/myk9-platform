/**
 * Move-up target eligibility
 *
 * A pre-show move-up promotes a dog to a HIGHER level within the SAME element
 * (AKC Scent Work: Novice → Advanced → Excellent → Master → Detective, per
 * Container / Interior / Exterior / Buried / Handler Discrimination element).
 * Moving across elements, or to a lower/equal level, is not a move-up.
 *
 * ASSUMPTION: scoped to same element + strictly higher level. AKC Scent Work
 * titles progress within an element, so cross-element "move-ups" are invalid.
 * If the rule ever needs to allow cross-element moves, relax the element check.
 */
import { levelProgressionRank } from '@/features/premium/pdf/bodies/classOrder';
import type { ClassWithCapacity } from '@/services/database/day-of-operations';

/**
 * Given the full set of classes for a show and the id of the request's current
 * class, return the classes a dog may legitimately move up into:
 *   - same element as the current class
 *   - a strictly higher level than the current class
 *   - with at least one available spot
 *
 * Returns [] when the current class can't be resolved or has no element/level
 * (the conservative choice — never offer a target we can't validate).
 */
export function getAvailableMoveUpTargets(
  classes: ClassWithCapacity[],
  currentClassId: string | null
): ClassWithCapacity[] {
  if (!currentClassId) return [];

  const current = classes.find(cls => cls.id === currentClassId);
  if (!current || !current.element || !current.level) return [];

  const currentRank = levelProgressionRank(current.level);

  return classes.filter(cls => {
    if (cls.id === currentClassId) return false;
    if (cls.available_spots <= 0) return false;
    // Same element only — a Buried dog cannot "move up" into Interior.
    if (cls.element !== current.element) return false;
    // Strictly higher level.
    if (!cls.level) return false;
    return levelProgressionRank(cls.level) > currentRank;
  });
}

/**
 * Whether a class exposes a real, configured entry cap. `getClassesWithCapacity`
 * substitutes a 999 sentinel for `available_spots` when `max_entries` is unset,
 * so the spot count is only meaningful when `max_entries` is a real number.
 */
export function hasConfiguredCapacity(cls: Pick<ClassWithCapacity, 'max_entries'>): boolean {
  return typeof cls.max_entries === 'number';
}
