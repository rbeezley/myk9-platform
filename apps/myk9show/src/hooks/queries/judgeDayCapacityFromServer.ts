/**
 * The secretary's judge-day cards (MYK9-1005): every figure on them is the server's.
 *
 * `get_show_judge_day_capacity_for_manager` returns one row per confirmed judge day with the
 * numbers payment and the waitlist offer decide on (`get_judge_day_capacity_live`): capacity,
 * taken (every account's held spots included, the secretary's own too), mail-in reserve and
 * self-service remaining, plus the judge's name, the day's classes and the dogs waiting. Nothing
 * is recomputed here, so the card cannot disagree with the gate that decides whether a dog is
 * accepted.
 */

import type { JudgeDayCapacity } from '@/types/waitlist-types';

/**
 * One row of `get_show_judge_day_capacity_for_manager` (migration 20261005163700). Declared here
 * until the generated `Database` types include the function.
 */
export interface ManagerJudgeDayRow {
  judge_id: string;
  judge_full_name: string | null;
  show_date: string;
  class_ids: string[] | null;
  class_names: string[] | null;
  day_capacity: number | null;
  day_taken: number | null;
  day_mail_in_reserved: number | null;
  day_remaining: number | null;
  waitlist_count: number | null;
}

export const JUDGE_DAY_CAPACITY_UNREADABLE =
  'Judge-day capacity could not be read for this show. Please try again.';

export function judgeDayCapacityFromServer(
  rows: readonly ManagerJudgeDayRow[]
): JudgeDayCapacity[] {
  return rows.map(day => {
    // A day without the server's figures is unreadable, never "0 taken of 0".
    if (day.day_capacity === null || day.day_taken === null || day.day_remaining === null) {
      throw new Error(JUDGE_DAY_CAPACITY_UNREADABLE);
    }
    return {
      judgeId: day.judge_id,
      judgeName: day.judge_full_name ?? '',
      showDate: day.show_date,
      capacity: day.day_capacity,
      confirmedCount: day.day_taken,
      waitlistCount: day.waitlist_count ?? 0,
      mailInReserved: day.day_mail_in_reserved ?? 0,
      availableSpots: day.day_remaining,
      classIds: day.class_ids ?? [],
      classNames: day.class_names ?? [],
    };
  });
}
