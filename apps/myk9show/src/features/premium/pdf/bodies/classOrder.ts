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

// Rank assigned to any level we don't recognize. Kept above every real index so
// unknown levels sort last in display order — but callers comparing two levels
// for move-up eligibility must treat this as "unknown", not "highest" (see
// isKnownLevel / isEligibleMoveUpTarget).
const UNKNOWN_LEVEL_RANK = 999;

// Case-insensitive lookup from a level string (incl. known aliases) to its
// canonical LEVEL_ORDER value. 'Masters' (plural) is the common alias — the DB
// stores 'Master', but scent-work-types.ts and registry copy use 'Masters'.
const CANONICAL_LEVEL_BY_KEY: Record<string, (typeof LEVEL_ORDER)[number]> = {
  ...Object.fromEntries(LEVEL_ORDER.map(level => [level.toLowerCase(), level])),
  masters: 'Master',
};

function canonicalLevel(level: string): (typeof LEVEL_ORDER)[number] | null {
  return CANONICAL_LEVEL_BY_KEY[level.trim().toLowerCase()] ?? null;
}

function levelIndex(level: string): number {
  const canonical = canonicalLevel(level);
  return canonical ? LEVEL_ORDER.indexOf(canonical) : UNKNOWN_LEVEL_RANK;
}

/**
 * Progression rank of a scent-work level (lower = earlier in the Novice →
 * Detective ladder). Unknown/custom levels rank last (UNKNOWN_LEVEL_RANK). Use
 * for SORTING. For move-up eligibility, gate on isKnownLevel first — a higher
 * rank only means "higher level" when both levels are recognized.
 */
export function levelProgressionRank(level: string): number {
  return levelIndex(level);
}

/**
 * Whether a level string maps to a recognized AKC Scent Work level (alias- and
 * case-tolerant). Move-up comparisons must reject unrecognized levels so an
 * unknown string never reads as "higher" than a known one.
 */
export function isKnownLevel(level: string): boolean {
  return canonicalLevel(level) !== null;
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
