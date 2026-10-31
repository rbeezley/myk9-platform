/**
 * detectStaleClass — v3's stale-class trigger rule as a pure function (MYK9-1514).
 *
 * After a judge scores a dog, another class is "stale" when ALL of these hold:
 *   - the same judge runs it,
 *   - its level differs from the class just scored (a same-level move such as
 *     Novice Buried to Novice Containers never triggers),
 *   - it is `in_progress`,
 *   - its latest result is older than 15 minutes (a class with no result yet is
 *     not stale), and
 *   - unscored dogs remain.
 *
 * v3 completed the class on the spot. Here a hit only produces a candidate the
 * judge is asked about; nothing is written from this module.
 */
import { outstandingEntries } from '@/features/_shared/entryAccounting';

/** How long a class must sit without a result before it is stale. */
export const STALE_CLASS_IDLE_MS = 15 * 60 * 1000;

export interface StaleClassFields {
  id: string;
  name: string;
  level?: string | undefined;
  judgeId?: string | undefined;
  classStatus?: string | undefined;
}

export interface StaleEntryFields {
  id: string;
  armband?: string | undefined;
  scoringCompletedAt?: string | null | undefined;
  entryStatus?: string | undefined;
  checkInStatus?: string | undefined;
  isScored?: boolean | undefined;
  resultStatus?: string | undefined;
  deletedAt?: string | null | undefined;
}

export interface StaleClassCandidate {
  classId: string;
  className: string;
  /** The dogs that would be marked absent. */
  unscoredEntryIds: string[];
  /** Latest result time in the class, epoch ms. */
  lastResultAtMs: number;
}

const sameLevel = (a: string | undefined, b: string | undefined): boolean =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/** Latest `scoringCompletedAt` among the live entries, epoch ms; null when none carries one. */
export function lastResultAtMs(entries: StaleEntryFields[]): number | null {
  let latest: number | null = null;
  for (const entry of entries) {
    if (entry.deletedAt != null || !entry.scoringCompletedAt) continue;
    const at = Date.parse(entry.scoringCompletedAt);
    if (!Number.isNaN(at) && (latest === null || at > latest)) latest = at;
  }
  return latest;
}

/** True when the class meets every clause of the rule except the class-identity ones. */
function isStaleClass(entries: StaleEntryFields[], nowMs: number): StaleClassCandidate | null {
  const last = lastResultAtMs(entries);
  if (last === null || nowMs - last <= STALE_CLASS_IDLE_MS) return null;
  const unscored = outstandingEntries(entries);
  if (unscored.length === 0) return null;
  return {
    classId: '',
    className: '',
    unscoredEntryIds: unscored.map(e => e.id),
    lastResultAtMs: last,
  };
}

export interface DetectStaleClassInput {
  /** The class the judge just scored in. */
  scoredClass: StaleClassFields;
  /** Every class to consider (the scored class's trial). */
  classes: StaleClassFields[];
  entriesByClassId: ReadonlyMap<string, StaleEntryFields[]>;
  nowMs: number;
}

/**
 * The stale class to ask about, or null. When several qualify, the one idle longest wins;
 * the rest are asked about after the judge's next score.
 */
export function detectStaleClass({
  scoredClass,
  classes,
  entriesByClassId,
  nowMs,
}: DetectStaleClassInput): StaleClassCandidate | null {
  if (!scoredClass.judgeId) return null;
  let best: StaleClassCandidate | null = null;
  for (const cls of classes) {
    if (cls.id === scoredClass.id) continue;
    if (cls.judgeId !== scoredClass.judgeId) continue;
    if (!cls.level || !scoredClass.level || sameLevel(cls.level, scoredClass.level)) continue;
    if (cls.classStatus !== 'in_progress') continue;
    const stale = isStaleClass(entriesByClassId.get(cls.id) ?? [], nowMs);
    if (!stale) continue;
    if (best === null || stale.lastResultAtMs < best.lastResultAtMs) {
      best = { ...stale, classId: cls.id, className: cls.name };
    }
  }
  return best;
}
