/**
 * The secretary's judge-day cards (MYK9-1005): every figure on them is the server's.
 *
 * `get_show_class_judge_day_availability` returns, for each (class, confirmed judge day), the
 * numbers payment decides on (`get_judge_day_capacity_live`): capacity, taken (active holds
 * included, MYK9-1012), mail-in reserve and self-service remaining. `judge_day_summary` only
 * names the day (judge, classes) and counts who is waiting. Nothing is recomputed here, so the
 * card cannot disagree with the gate that decides whether a dog is accepted.
 */

import type { Database } from '@/types/supabase';
import type { JudgeDayCapacity } from '@/types/waitlist-types';

export type ClassJudgeDayAvailabilityRow =
  Database['public']['Functions']['get_show_class_judge_day_availability']['Returns'][number];

export interface JudgeDaySummaryRow {
  show_id: string;
  judge_id: string;
  judge_name: string;
  show_date: string;
  class_ids: string[];
  class_names: string[];
  waitlist_count: number;
}

export const JUDGE_DAY_CAPACITY_UNREADABLE =
  'Judge-day capacity could not be read for this show. Please try again.';

const dayKey = (judgeId: string, showDate: string) => `${judgeId}:${showDate}`;

export function judgeDayCapacityFromServer(
  summary: readonly JudgeDaySummaryRow[],
  availability: readonly ClassJudgeDayAvailabilityRow[]
): JudgeDayCapacity[] {
  // The server reports the same figures on every row of one day; the first row stands for it.
  const serverDays = new Map<string, ClassJudgeDayAvailabilityRow>();
  for (const row of availability) {
    if (!row.judge_id || !row.show_date) continue;
    const key = dayKey(row.judge_id, row.show_date);
    if (!serverDays.has(key)) serverDays.set(key, row);
  }

  return summary.map(day => {
    const server = serverDays.get(dayKey(day.judge_id, day.show_date));
    // A day the server did not report is unreadable, never "0 taken of 0".
    if (!server || server.day_capacity === null || server.day_taken === null) {
      throw new Error(JUDGE_DAY_CAPACITY_UNREADABLE);
    }
    return {
      judgeId: day.judge_id,
      judgeName: day.judge_name,
      showDate: day.show_date,
      capacity: server.day_capacity,
      confirmedCount: server.day_taken,
      waitlistCount: day.waitlist_count,
      mailInReserved: server.day_mail_in_reserved ?? 0,
      availableSpots: server.day_remaining ?? 0,
      classIds: day.class_ids,
      classNames: day.class_names,
    };
  });
}
