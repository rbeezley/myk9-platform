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
  /** True when the flip is already recorded: `entries` are then in the recorded order. */
  recorded: boolean;
  entries: ClassTieEntry[];
}

/** True when a coin flip order is recorded for any dog of the class (it can still be changed). */
export function hasRecordedTie(
  entries: readonly Pick<ResultsEntryRow, 'placementTie' | 'placementTiebreak'>[]
) {
  return entries.some(isRecorded);
}

/** True when any entry of the class still owes a coin flip for a ribbon. */
export function hasUnresolvedTie(entries: readonly Pick<ResultsEntryRow, 'placementTie'>[]) {
  return entries.some(entry => entry.placementTie === 'unresolved');
}

/** Placement-eligible exactly as the recalculator reads it: scored and qualified. */
function isRankEligible(entry: ResultsEntryRow): boolean {
  return entry.scored && entry.qualified;
}

/** A recorded flip: the server stores the order and drops the `unresolved` marker. */
function isRecorded(entry: Pick<ResultsEntryRow, 'placementTie' | 'placementTiebreak'>): boolean {
  return entry.placementTie !== 'unresolved' && entry.placementTiebreak !== null;
}

function byPlacement(a: ResultsEntryRow, b: ResultsEntryRow): number {
  return (
    (a.placement ?? Number.MAX_SAFE_INTEGER) - (b.placement ?? Number.MAX_SAFE_INTEGER) ||
    a.armband.localeCompare(b.armband, undefined, { numeric: true })
  );
}

function toTieEntry(entry: ResultsEntryRow): ClassTieEntry {
  return {
    entryId: entry.entryId,
    armband: entry.armband,
    dogName: entry.dogName,
    totalFaults: entry.faults,
    pointsEarned: entry.pointsEarned,
    timeSeconds: entry.timeSeconds,
  };
}

/** Groups the matching rank-eligible entries on the key the show ranks by, finishing order first. */
function groupTies(
  entries: readonly ResultsEntryRow[],
  isNationals: boolean,
  recorded: boolean
): ClassTieGroup[] {
  const byKey = new Map<string, ResultsEntryRow[]>();
  for (const entry of entries) {
    const matches = recorded ? isRecorded(entry) : entry.placementTie === 'unresolved';
    if (!matches || !isRankEligible(entry)) continue;
    const score = isNationals ? entry.pointsEarned : entry.faults;
    const key = `${score ?? 'none'}|${entry.timeSeconds ?? 'none'}`;
    const members = byKey.get(key);
    if (members) members.push(entry);
    else byKey.set(key, [entry]);
  }
  const groups: ClassTieGroup[] = [];
  for (const members of byKey.values()) {
    // A recorded order is one tie of at least two dogs; anything less is a stale lone value.
    if (recorded && members.length < 2) continue;
    const placements = members
      .map(entry => entry.placement)
      .filter((place): place is number => place !== null);
    groups.push({
      rank: placements.length > 0 ? Math.min(...placements) : 0,
      byPoints: isNationals,
      recorded,
      entries: members
        .sort(
          recorded
            ? (a, b) => (a.placementTiebreak ?? 0) - (b.placementTiebreak ?? 0) || byPlacement(a, b)
            : byPlacement
        )
        .map(toTieEntry),
    });
  }
  return groups;
}

/**
 * The class's ribbon ties, in finishing order: the unresolved ones awaiting a flip, then the ones
 * whose flip is already recorded (so a wrong winner can be corrected). A group's rank is the place
 * its dogs share (the best placement any of them currently holds). A tie below 4th is `shared`,
 * never `unresolved`, and carries no recorded order, so it is never offered.
 */
export function deriveClassTies(
  entries: readonly ResultsEntryRow[],
  isNationals: boolean | null
): ClassTieGroup[] {
  // Until the show row says which key it ranks by, no group is offered rather than a group on the
  // wrong key.
  if (isNationals === null) return [];
  return [...groupTies(entries, isNationals, false), ...groupTies(entries, isNationals, true)].sort(
    (a, b) => a.rank - b.rank
  );
}
