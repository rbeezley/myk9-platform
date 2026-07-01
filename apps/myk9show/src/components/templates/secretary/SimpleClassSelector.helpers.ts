import { ClassDefinition } from '@/types/template.types';

export function formatJudgeName(name: string | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return 'Unknown Judge';
  return trimmed
    .replace(/\s*\(\s*-\s*\)\s*$/u, '')
    .replace(/\s*\(\s*\)\s*$/u, '')
    .trim();
}

/**
 * Ordering comparator for classes within an element group.
 *
 * Honors the seeded `displayOrder` (from `sport_class_rules.display_order`,
 * carried through by `mapSportTemplateToClassTemplate`), with `section` as a
 * tiebreaker. This replaces a hardcoded `['Novice','Advanced','Excellent','Master']`
 * level array that mis-sorted any level not in the list (ASCA `Open`, UKC
 * `Superior`/`Elite`) to the TOP of each group because `indexOf` returned `-1`.
 * Sorting by `displayOrder` makes the grid honor the intended order for every
 * registry with no registry-specific hardcoding.
 */
export function compareClassesForGrid(a: ClassDefinition, b: ClassDefinition): number {
  // `displayOrder` is required on ClassDefinition, but guard against nullish
  // values from any hand-built definitions so they sort last rather than first.
  const aOrder = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
  const bOrder = b.displayOrder ?? Number.MAX_SAFE_INTEGER;

  if (aOrder !== bOrder) return aOrder - bOrder;

  // Same display order: fall back to section (A before B).
  return (a.section || '').localeCompare(b.section || '');
}

/**
 * Group class definitions by element, with each group ordered by
 * {@link compareClassesForGrid}. Pure and side-effect free so it can be unit
 * tested directly.
 */
export function groupClassesByElement(
  classes: ClassDefinition[]
): Record<string, ClassDefinition[]> {
  const grouped: Record<string, ClassDefinition[]> = {};

  for (const cls of classes) {
    (grouped[cls.element] ??= []).push(cls);
  }

  for (const element of Object.keys(grouped)) {
    grouped[element].sort(compareClassesForGrid);
  }

  return grouped;
}
