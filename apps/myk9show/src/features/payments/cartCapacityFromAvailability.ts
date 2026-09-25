/**
 * MYK9-753: the facts the cart's wait-list/pay split needs, taken from the
 * server's availability read rather than counted from `entries`.
 *
 * `get_show_class_availability` counts every entry in the class (and every
 * entry on the judge day, through `get_judge_day_capacity_live`), not the rows
 * the exhibitor's RLS returns. This only reshapes its per-class verdict into
 * the two inputs `splitCartItemsByJudgeDayCapacity` already takes:
 *
 *   - `fullClassIds`: every class the server calls full, for the class count
 *     or the judge day. The split sends those lines to the wait list, or blocks
 *     them when the class takes none.
 *   - `judgeDays`: one bucket per (judge, trial date) with the server's
 *     self-service spots left, so several cart lines on one judge day are
 *     counted against what is left of it, not each against the whole.
 *
 * The server names ONE judge per class, the one whose day is tightest, but the
 * entry-capacity gate checks every confirmed judge's day. The confirmed
 * assignments restore the other associations, so a line in a two-judge class
 * uses up a spot on BOTH days (Codex P1 on PR #2461). A day's spots are exact
 * when some class names it as its tightest. When no class does, each class on
 * it is bounded by a tighter day, and the largest of their figures is a lower
 * bound: it can only hold a line back, never pass one the server refuses.
 * All of this is advisory; `submit_show_entries` and the paid-entry path
 * enforce capacity under their own locks.
 */

import type { ClassAvailability } from '@/hooks/useClassAvailability';
import type { CartJudgeDayCapacity } from './cartCapacitySplit';

export interface CartCapacityFacts {
  judgeDays: CartJudgeDayCapacity[];
  fullClassIds: string[];
}

/** A confirmed judge assignment: which judge's day a class runs on. */
export interface CartJudgeAssignment {
  classId: string;
  judgeId: string;
  date: string;
}

interface DayBucket {
  judgeId: string;
  showDate: string;
  classIds: string[];
  /** Spots when some class names this day as its tightest; exact. */
  exact: number | null;
  /** Largest figure among classes bounded by a tighter day; a lower bound. */
  lowerBound: number;
}

export function cartCapacityFromAvailability(
  classes: readonly ClassAvailability[],
  assignments: readonly CartJudgeAssignment[] = []
): CartCapacityFacts {
  const fullClassIds: string[] = [];
  const byId = new Map(classes.map(cls => [cls.classId, cls]));
  const days = new Map<string, DayBucket>();

  const bucket = (judgeId: string, showDate: string): DayBucket => {
    const key = `${judgeId}:${showDate}`;
    let day = days.get(key);
    if (!day) {
      day = { judgeId, showDate, classIds: [], exact: null, lowerBound: 0 };
      days.set(key, day);
    }
    return day;
  };

  const associate = (cls: ClassAvailability, judgeId: string, showDate: string) => {
    const day = bucket(judgeId, showDate);
    if (day.classIds.includes(cls.classId)) return;
    day.classIds.push(cls.classId);
    if (cls.judgeId === judgeId) {
      day.exact = Math.min(day.exact ?? cls.judgeDayAvailable, cls.judgeDayAvailable);
    } else {
      day.lowerBound = Math.max(day.lowerBound, cls.judgeDayAvailable);
    }
  };

  for (const cls of classes) {
    if (cls.isFull) fullClassIds.push(cls.classId);
    if (cls.judgeId) associate(cls, cls.judgeId, cls.trialDate);
  }
  for (const assignment of assignments) {
    const cls = byId.get(assignment.classId);
    // A class the server reports no judge for has no judge-day limit there.
    if (!cls?.judgeId) continue;
    associate(cls, assignment.judgeId, assignment.date);
  }

  const judgeDays = Array.from(days.values(), day => ({
    judgeId: day.judgeId,
    showDate: day.showDate,
    availableSpots: day.exact ?? day.lowerBound,
    classIds: day.classIds,
  }));

  return { judgeDays, fullClassIds };
}
