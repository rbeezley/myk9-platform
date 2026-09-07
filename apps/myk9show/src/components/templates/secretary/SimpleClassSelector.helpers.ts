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

/**
 * The label a class card actually paints in its body: the level (falling back to
 * the element for standalone classes such as AKC Detective) plus the section.
 * Deliberately mirrors the card markup — a class's on-screen identity is only
 * ever these parts, never its full `className`.
 */
function getCardVisibleLabel(cls: ClassDefinition): string {
  return [cls.element, cls.level || cls.element, cls.section || ''].join('|');
}

/**
 * Class names whose card must ALSO spell out the full name to stay tellable apart.
 *
 * The card body renders only the level (plus section), so two classes that share a
 * level paint the identical string — a template class beside a cloned, renamed one
 * carried into the show wizard, e.g. "Interior Advanced" and "Interior Advanced
 * Preliminary" both reading just `Advanced`. The distinguishing name lived only in
 * the card's aria-label, so a sighted secretary could not tell which one to remove
 * (MYK9-389).
 *
 * Computed over the WHOLE catalog rather than the filtered view, so a card keeps
 * its full name even once a search has hidden the twin that made it ambiguous.
 * Classes with a unique visible label are left alone, which is why standard
 * template cards are unchanged.
 */
export function findAmbiguousClassNames(classes: ClassDefinition[]): Set<string> {
  const namesByLabel = new Map<string, Set<string>>();

  for (const cls of classes) {
    const label = getCardVisibleLabel(cls);
    let names = namesByLabel.get(label);
    if (!names) {
      names = new Set<string>();
      namesByLabel.set(label, names);
    }
    names.add(cls.className);
  }

  const ambiguous = new Set<string>();
  for (const names of namesByLabel.values()) {
    if (names.size > 1) {
      for (const name of names) ambiguous.add(name);
    }
  }

  return ambiguous;
}
