/**
 * Move-up target eligibility for the Entries Management approve dialog.
 *
 * The same-element + strictly-higher-level rule lives in
 * `@/utils/moveUpEligibility` so every move-up surface (Entries Management,
 * Show Map, Show Desk) and the write-path mutation share one definition. This
 * module just adds the capacity filter and the ClassWithCapacity shape.
 */
import { isEligibleMoveUpTarget } from '@/utils/moveUpEligibility';
import type { ClassWithCapacity } from '@/services/database/day-of-operations';
import type { RegistryId } from '@/features/registries';

/**
 * Given the full set of classes for a show and the id of the request's current
 * class, return the classes a dog may legitimately move up into:
 *   - same element as the current class
 *   - a strictly higher level than the current class
 *   - with at least one available spot
 *
 * Returns [] when the current class can't be resolved (the conservative
 * choice — never offer a target we can't validate). `registryId` defaults to
 * AKC for any caller not yet updated — pass the show's actual registry so
 * UKC/ASCA-only levels (Superior/Elite, Open/Champion) are recognized.
 */
export function getAvailableMoveUpTargets(
  classes: ClassWithCapacity[],
  currentClassId: string | null,
  registryId: RegistryId = 'AKC'
): ClassWithCapacity[] {
  if (!currentClassId) return [];

  const current = classes.find(cls => cls.id === currentClassId);
  if (!current) return [];

  return classes.filter(cls => {
    if (cls.id === currentClassId) return false;
    if (cls.available_spots <= 0) return false;
    return isEligibleMoveUpTarget(current, cls, registryId);
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
