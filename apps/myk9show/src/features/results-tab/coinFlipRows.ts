/**
 * MYK9-1473: dogs tied for a ribbon are placed by a coin flip the secretary records. The tie state
 * is replicated data (`placement_tie`, derived by the server's placement recalculation and carried
 * on every entry row), so the tie groups are derived here from the class's own rows: a score
 * correction moves them with no extra read, and they show offline. Saving a flip is the only part
 * that needs the server.
 *
 * The grouping mirrors `recalculate_class_placements` exactly (eligibility, then points at
 * nationals or faults otherwise, then time), so a group sent to `set_class_tie_order` is the
 * server's own tie group and not a partial one (MK016).
 */
import type { ResultsEntryRow } from './buildResultsClassRows';

/** One dog in a tie group. */
export interface ClassTieEntry {
  entryId: string;
  armband: string;
  dogName: string;
  /** Faults at an ordinary show, points at nationals (the tie is on whichever the class ranks by). */
  totalFaults: number | null;
  pointsEarned: number | null;
  timeSeconds: number | null;
}

/** One group of dogs sharing a score and time, all tied for `rank`. */
export interface ClassTieGroup {
  rank: number;
  /** Nationals rank by points then time; every other show by faults then time. */
  byPoints: boolean;
  entries: ClassTieEntry[];
}

/** True when any entry of the class still owes a coin flip for a ribbon. */
export function hasUnresolvedTie(entries: readonly Pick<ResultsEntryRow, 'placementTie'>[]) {
  return entries.some(entry => entry.placementTie === 'unresolved');
}

/** Placement-eligible exactly as the recalculator reads it: scored and qualified. */
function isRankEligible(entry: ResultsEntryRow): boolean {
  return entry.scored && entry.qualified;
}

/**
 * The class's unresolved ribbon ties, in finishing order. A group's rank is the place its dogs
 * share (the best placement any of them currently holds). A tie below 4th is `shared`, never
 * `unresolved`, so it is never offered.
 */
export function deriveClassTies(
  entries: readonly ResultsEntryRow[],
  isNationals: boolean | null
): ClassTieGroup[] {
  // Until the show row says which key it ranks by, no group is offered rather than a group on the
  // wrong key.
  if (isNationals === null) return [];
  const byKey = new Map<string, ResultsEntryRow[]>();
  for (const entry of entries) {
    if (entry.placementTie !== 'unresolved' || !isRankEligible(entry)) continue;
    const score = isNationals ? entry.pointsEarned : entry.faults;
    const key = `${score ?? 'none'}|${entry.timeSeconds ?? 'none'}`;
    const members = byKey.get(key);
    if (members) members.push(entry);
    else byKey.set(key, [entry]);
  }
  const groups: ClassTieGroup[] = [];
  for (const members of byKey.values()) {
    const placements = members
      .map(entry => entry.placement)
      .filter((place): place is number => place !== null);
    groups.push({
      rank: placements.length > 0 ? Math.min(...placements) : 0,
      byPoints: isNationals,
      entries: members
        .sort(
          (a, b) =>
            (a.placement ?? Number.MAX_SAFE_INTEGER) - (b.placement ?? Number.MAX_SAFE_INTEGER) ||
            a.armband.localeCompare(b.armband, undefined, { numeric: true })
        )
        .map(entry => ({
          entryId: entry.entryId,
          armband: entry.armband,
          dogName: entry.dogName,
          totalFaults: entry.faults,
          pointsEarned: entry.pointsEarned,
          timeSeconds: entry.timeSeconds,
        })),
    });
  }
  return groups.sort((a, b) => a.rank - b.rank);
}
