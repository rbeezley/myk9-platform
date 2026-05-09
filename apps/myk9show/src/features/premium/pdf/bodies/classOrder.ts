// AKC Scent Work levels in competition-progression order. Levels not in this
// list (custom or unknown) sort to the end alphabetically.
const LEVEL_ORDER = [
  'Novice A',
  'Novice B',
  'Novice',
  'Advanced',
  'Excellent',
  'Master',
  'Detective',
] as const;

function levelIndex(level: string): number {
  const i = LEVEL_ORDER.indexOf(level as (typeof LEVEL_ORDER)[number]);
  return i === -1 ? 999 : i;
}

export function compareLevelsByProgression(a: string, b: string): number {
  const progression = levelIndex(a) - levelIndex(b);
  if (progression !== 0) return progression;
  return a.localeCompare(b);
}

export interface ClassLike {
  element: string;
  level: string;
  section: string | null;
}

/**
 * Compare two scent-work classes by progression order:
 *   1. Element (alphabetical)
 *   2. Level (Novice A → B → Advanced → Excellent → Master → Detective)
 *   3. Section (alphabetical, nulls last)
 */
export function compareClassesByProgression(a: ClassLike, b: ClassLike): number {
  if (a.element !== b.element) return a.element.localeCompare(b.element);
  const li = compareLevelsByProgression(a.level, b.level);
  if (li !== 0) return li;
  if (a.section === b.section) return 0;
  if (!a.section) return 1;
  if (!b.section) return -1;
  return a.section.localeCompare(b.section);
}
