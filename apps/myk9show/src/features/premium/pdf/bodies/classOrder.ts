import { getScentWorkSport, scentWorkLevelOrder } from '@/features/registries/scentWork';
import type { RegistryId } from '@/features/registries';

// Default registry for any caller that hasn't been updated to pass one — matches the
// `getTrialRegistry` convention used everywhere else in the multi-registry layer
// (docs/plan-multi-registry-scent-work.md Phase 5b).
const DEFAULT_REGISTRY: RegistryId = 'AKC';

// Rank assigned to any level we don't recognize. Kept above every real index so
// unknown levels sort last in display order — but callers comparing two levels
// for move-up eligibility must treat this as "unknown", not "highest" (see
// isKnownLevel / isEligibleMoveUpTarget).
const UNKNOWN_LEVEL_RANK = 999;

interface LevelTables {
  /** Competition-progression order for this registry, e.g. AKC's
   *  ['Novice A', 'Novice B', 'Novice', 'Advanced', 'Excellent', 'Master', 'Detective']. */
  levelOrder: readonly string[];
  /** Case-insensitive lookup from a level string (incl. known aliases) to its canonical
   *  levelOrder value. */
  canonicalByKey: Record<string, string>;
}

// Per-registry tables are derived once and cached — each registry's level set is static
// for the life of the process (the registry config layer has no runtime mutation path).
const TABLES_CACHE = new Map<RegistryId, LevelTables>();

function tablesFor(registryId: RegistryId): LevelTables {
  const cached = TABLES_CACHE.get(registryId);
  if (cached) return cached;

  const levelOrder = scentWorkLevelOrder(getScentWorkSport(registryId));
  const canonicalByKey: Record<string, string> = Object.fromEntries(
    levelOrder.map(level => [level.toLowerCase(), level])
  );
  if (registryId === 'AKC') {
    // 'Masters' (plural) is an AKC-only legacy alias — the DB stores 'Master', but
    // scent-work-types.ts / TimerIntegration.tsx (the AKC scoring island, intentionally
    // untouched here — see docs/plan-multi-registry-scent-work.md) still emit 'Masters'.
    // Scoped to AKC only so it can't leak a false-positive match into UKC/ASCA canonicalization.
    canonicalByKey.masters = 'Master';
  }

  const tables: LevelTables = { levelOrder, canonicalByKey };
  TABLES_CACHE.set(registryId, tables);
  return tables;
}

function canonicalLevel(level: string, registryId: RegistryId): string | null {
  return tablesFor(registryId).canonicalByKey[level.trim().toLowerCase()] ?? null;
}

function levelIndex(level: string, registryId: RegistryId): number {
  const canonical = canonicalLevel(level, registryId);
  return canonical ? tablesFor(registryId).levelOrder.indexOf(canonical) : UNKNOWN_LEVEL_RANK;
}

/**
 * Progression rank of a scent-work level for the given registry (lower = earlier in the
 * ladder). Unknown/custom levels rank last (UNKNOWN_LEVEL_RANK). Use for SORTING. For move-up
 * eligibility, gate on isKnownLevel first — a higher rank only means "higher level" when both
 * levels are recognized BY THE SAME REGISTRY.
 */
export function levelProgressionRank(
  level: string,
  registryId: RegistryId = DEFAULT_REGISTRY
): number {
  return levelIndex(level, registryId);
}

/**
 * Whether a level string maps to a recognized level for the given registry (alias- and
 * case-tolerant). Move-up comparisons must reject unrecognized levels so an unknown string
 * never reads as "higher" than a known one.
 */
export function isKnownLevel(level: string, registryId: RegistryId = DEFAULT_REGISTRY): boolean {
  return canonicalLevel(level, registryId) !== null;
}

export function compareLevelsByProgression(
  a: string,
  b: string,
  registryId: RegistryId = DEFAULT_REGISTRY
): number {
  const progression = levelIndex(a, registryId) - levelIndex(b, registryId);
  if (progression !== 0) return progression;
  return a.localeCompare(b);
}

export interface ClassLike {
  element: string;
  level: string;
  section: string | null;
}

/**
 * Compare two scent-work classes by progression order for the given registry:
 *   1. Element (alphabetical)
 *   2. Level (registry-specific ladder, e.g. AKC's Novice A → B → Advanced → Excellent → Master → Detective)
 *   3. Section (alphabetical, nulls last)
 */
export function compareClassesByProgression(
  a: ClassLike,
  b: ClassLike,
  registryId: RegistryId = DEFAULT_REGISTRY
): number {
  if (a.element !== b.element) return a.element.localeCompare(b.element);
  const li = compareLevelsByProgression(a.level, b.level, registryId);
  if (li !== 0) return li;
  if (a.section === b.section) return 0;
  if (!a.section) return 1;
  if (!b.section) return -1;
  return a.section.localeCompare(b.section);
}

/**
 * Bind a registry once and get back a `.sort()`-ready comparator — avoids repeating
 * `(a, b) => compareClassesByProgression(a, b, registryId)` at every premium-PDF call site.
 */
export function makeClassComparator(
  registryId: RegistryId = DEFAULT_REGISTRY
): (a: ClassLike, b: ClassLike) => number {
  return (a, b) => compareClassesByProgression(a, b, registryId);
}
