/**
 * Which classes let the judge or secretary choose the number of search areas
 * (MYK9-1625), and which counts they may choose.
 *
 * A rule that fixes the count (AKC Interior Excellent is 2 areas, Master 3,
 * Handler Discrimination Master 2) is copied onto the class when it is created,
 * so those classes are never asked. Only a class named here is flexible. There is
 * no registry or `sport_class_rules` column for an allowed range today
 * (`sport_class_rules.area_count` is one number), so this table is the one
 * declared source: add a row, keyed `Element|Level`, when a rulebook allows a
 * choice. A class absent from it never prompts.
 */
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';

export interface AreaCountRange {
  min: number;
  max: number;
}

export const FLEXIBLE_AREA_COUNTS: Readonly<Record<string, AreaCountRange>> = {};

/** The counts a class may choose between, or null when its area count is not a choice. */
export function areaCountRangeFor(
  element: string | null | undefined,
  level: string | null | undefined,
  table: Readonly<Record<string, AreaCountRange>> = FLEXIBLE_AREA_COUNTS
): AreaCountRange | null {
  return table[`${element ?? ''}|${level ?? ''}`] ?? null;
}

/** A flexible class, still to be run, with no area count chosen. */
export function needsAreaCount(
  cls: Pick<ReplicatedClass, 'element' | 'level' | 'areaCount' | 'classStatus'>,
  table: Readonly<Record<string, AreaCountRange>> = FLEXIBLE_AREA_COUNTS
): boolean {
  const status = cls.classStatus?.toLowerCase();
  if (status === 'completed' || status === 'cancelled') return false;
  return !!areaCountRangeFor(cls.element, cls.level, table) && !cls.areaCount;
}
