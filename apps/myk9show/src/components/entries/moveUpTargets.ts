/**
 * Move-up target eligibility for the Entries Management approve dialog.
 *
 * The same-element + strictly-higher-level rule lives in
 * `@/utils/moveUpTargetSelection` so every move-up surface (Entries Management,
 * Show Map, Show Desk) and the write-path mutation share one definition. This
 * module just binds it to the ClassWithCapacity shape.
 */
import { selectMoveUpTargetClasses } from '@/utils/moveUpTargetSelection';
import type { ClassWithCapacity } from '@/services/database/day-of-operations';
import type { RegistryId } from '@/features/registries';

/**
 * Given the full set of classes for a show and the id of the request's current
 * class, return the classes a dog may legitimately move up into:
 *   - in the same trial as the current class (MYK9-920)
 *   - same element as the current class
 *   - a strictly higher level than the current class
 *   - with at least one available spot
 *
 * Returns [] when the current class can't be resolved (the conservative
 * choice — never offer a target we can't validate). `registryId` defaults to
 * AKC for any caller not yet updated — pass the show's actual registry so
 * UKC/ASCA-only levels (Superior/Elite, Open) are recognized. See
 * isEligibleMoveUpTarget's NOT COVERED note re: ASCA's standalone Champion class.
 */
export function getAvailableMoveUpTargets(
  classes: ClassWithCapacity[],
  currentClassId: string | null,
  registryId: RegistryId = 'AKC'
): ClassWithCapacity[] {
  return selectMoveUpTargetClasses(classes, currentClassId, registryId, cls => cls.available_spots);
}

/**
 * Whether a class exposes a real, configured entry cap. `getClassesWithCapacity`
 * substitutes a 999 sentinel for `available_spots` when `max_entries` is unset,
 * so the spot count is only meaningful when `max_entries` is a real number.
 */
export function hasConfiguredCapacity(cls: Pick<ClassWithCapacity, 'max_entries'>): boolean {
  return typeof cls.max_entries === 'number';
}
