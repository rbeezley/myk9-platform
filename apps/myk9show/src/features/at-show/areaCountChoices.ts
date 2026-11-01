/**
 * Which classes let the judge or secretary choose the number of search areas
 * (MYK9-1625), and which counts they may choose.
 *
 * A rule that fixes the count (AKC Interior Excellent is 2 areas, Master 3,
 * Handler Discrimination Master 2) is copied onto the class when it is created,
 * and is not named here, so its class offers no choice. There is no registry or
 * `sport_class_rules` column for an allowed range today (`area_count` is one
 * number, the starting count), so this table is the one declared source: add a
 * row, keyed `Registry|Element|Level`, when a rulebook allows a choice. Keyed by
 * registry because the same element and level can be fixed in one rulebook and
 * a choice in another.
 *
 * A class seeded with a count is never prompted (owner, 2026-11-01: ASCA starts
 * at 1); the class menu's Search areas tile changes it. Only a class whose count
 * is unset asks.
 */
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';

export interface AreaCountRange {
  min: number;
  max: number;
}

export const FLEXIBLE_AREA_COUNTS: Readonly<Record<string, AreaCountRange>> = {
  // ASCA Scent Detection rules §7.7.1 and §8.7.1: 1 or 2 areas, the judge's choice.
  'ASCA|Interior|Advanced': { min: 1, max: 2 },
  'ASCA|Interior|Excellent': { min: 1, max: 2 },
};

/** The counts a class may choose between, or null when its area count is not a choice. */
export function areaCountRangeFor(
  registry: string | null | undefined,
  element: string | null | undefined,
  level: string | null | undefined,
  table: Readonly<Record<string, AreaCountRange>> = FLEXIBLE_AREA_COUNTS
): AreaCountRange | null {
  if (!registry) return null;
  return table[`${registry}|${element ?? ''}|${level ?? ''}`] ?? null;
}

/** A flexible class, still to be run, with no area count chosen. */
export function needsAreaCount(
  registry: string | null | undefined,
  cls: Pick<ReplicatedClass, 'element' | 'level' | 'areaCount' | 'classStatus'>,
  table: Readonly<Record<string, AreaCountRange>> = FLEXIBLE_AREA_COUNTS
): boolean {
  const status = cls.classStatus?.toLowerCase();
  if (status === 'completed' || status === 'cancelled') return false;
  return !!areaCountRangeFor(registry, cls.element, cls.level, table) && !cls.areaCount;
}
