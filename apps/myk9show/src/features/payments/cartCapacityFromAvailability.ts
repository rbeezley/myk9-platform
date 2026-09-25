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
 * The server reports one judge per class: the one whose day is tightest. A
 * class with several confirmed judges is therefore counted against that day
 * only. This is advisory; `submit_show_entries` and the paid-entry path
 * enforce capacity under their own locks.
 */

import type { ClassAvailability } from '@/hooks/useClassAvailability';
import type { CartJudgeDayCapacity } from './cartCapacitySplit';

export interface CartCapacityFacts {
  judgeDays: CartJudgeDayCapacity[];
  fullClassIds: string[];
}

export function cartCapacityFromAvailability(
  classes: readonly ClassAvailability[]
): CartCapacityFacts {
  const fullClassIds: string[] = [];
  const judgeDays = new Map<string, CartJudgeDayCapacity>();

  for (const cls of classes) {
    if (cls.isFull) fullClassIds.push(cls.classId);
    if (!cls.judgeId) continue;

    const key = `${cls.judgeId}:${cls.trialDate}`;
    const day = judgeDays.get(key);
    if (day) {
      day.classIds.push(cls.classId);
      day.availableSpots = Math.min(day.availableSpots, cls.judgeDayAvailable);
    } else {
      judgeDays.set(key, {
        judgeId: cls.judgeId,
        showDate: cls.trialDate,
        availableSpots: cls.judgeDayAvailable,
        classIds: [cls.classId],
      });
    }
  }

  return { judgeDays: Array.from(judgeDays.values()), fullClassIds };
}
