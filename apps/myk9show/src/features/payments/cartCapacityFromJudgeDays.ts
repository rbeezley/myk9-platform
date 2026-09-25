/**
 * MYK9-753: the cart split's inputs, from the server's per-judge-day read.
 *
 * `get_show_class_judge_day_availability` returns one row per (class, confirmed
 * judge day), each with that day's real self-service spots left
 * (`get_judge_day_capacity_live`, the figure payment's `evaluate_entry_capacity`
 * reads), plus the class's own spots left when it has a limit. A class with no
 * confirmed judge has one row with no day. This only regroups those rows:
 *
 *   - `judgeDays`: one bucket per (judge, date) listing every class that takes
 *     a spot on it, so a line in a two-judge class is charged against both
 *     days and several lines on one day share what is left of it;
 *   - `classSpots`: spots left in each class that has an entry limit.
 *
 * No count is made here: every number is the server's.
 */

import type { Database } from '@/types/supabase';
import type { CartClassCapacity, CartJudgeDayCapacity } from './cartCapacitySplit';

export type ClassJudgeDayAvailabilityRow =
  Database['public']['Functions']['get_show_class_judge_day_availability']['Returns'][number];

export interface CartCapacityFacts {
  judgeDays: CartJudgeDayCapacity[];
  classSpots: CartClassCapacity[];
}

export function cartCapacityFromJudgeDays(
  rows: readonly ClassJudgeDayAvailabilityRow[]
): CartCapacityFacts {
  const days = new Map<string, CartJudgeDayCapacity>();
  const classSpots = new Map<string, number>();

  for (const row of rows) {
    if (row.class_remaining !== null) {
      classSpots.set(row.class_id, row.class_full ? 0 : row.class_remaining);
    }

    if (!row.judge_id || !row.show_date) continue;
    const key = `${row.judge_id}:${row.show_date}`;
    // The server reports the same figure on every row of one day; taking the
    // smallest keeps a disagreement on the side of holding a line back.
    const remaining = row.day_remaining ?? 0;
    const day = days.get(key);
    if (!day) {
      days.set(key, {
        judgeId: row.judge_id,
        showDate: row.show_date,
        availableSpots: remaining,
        classIds: [row.class_id],
      });
      continue;
    }
    day.availableSpots = Math.min(day.availableSpots, remaining);
    if (!day.classIds.includes(row.class_id)) day.classIds.push(row.class_id);
  }

  return {
    judgeDays: Array.from(days.values()),
    classSpots: Array.from(classSpots, ([classId, availableSpots]) => ({
      classId,
      availableSpots,
    })),
  };
}
