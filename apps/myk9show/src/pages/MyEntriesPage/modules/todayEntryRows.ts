/**
 * Today's class rows, read off My Shows' own view model (MYK9-1524).
 *
 * The Home "Your entries today" card derives nothing of its own: the rows come
 * from `groupEntriesByShow`, the day from the same trial-day gate the check-in
 * flow uses (`isTrialDayToday`, in the TRIAL's timezone), and the status text
 * from the row state My Shows renders (`deriveClassRowState` +
 * `classRowStatusText`). An entry My Shows says cannot check in therefore never
 * reads "Check in" here.
 *
 * @module MyEntriesPage/modules/todayEntryRows
 */

import { classRowStatusText } from './classRowStatusText';
import { isTrialDayToday, type DayCheckInContext } from './dayCheckIn';
import { groupEntriesByShow, indexOrdersById } from './groupEntriesByShow';
import { isPastShowEntry } from './myEntriesStats.helpers';
import { deriveClassRowState } from './myShowDogState';
import type { MyEntry } from './my-entries-types';

export interface TodayEntryRow {
  /** Class row id (`MyShowClass.id`); unique per row. */
  key: string;
  /** Class id the self-check-in cascade is keyed on, when known. */
  classId: string | undefined;
  showName: string;
  dogName: string;
  className: string;
  /** My Shows' status or action text for this row; never empty. */
  statusText: string;
}

/** Unscored classes whose trial day is `now` are the only ones that resolve the cascade. */
export function todayClassIds(entries: MyEntry[], now: Date): string[] {
  const ids = new Set<string>();
  for (const group of groupEntriesByShow(entries)) {
    if (isPastShowEntry(group.orders[0]!, now)) continue;
    for (const dog of group.dogs) {
      for (const cls of dog.classes) {
        if (cls.classId && !cls.isScored && isTrialDayToday(cls.trialDate, cls.trialTimezone, now))
          ids.add(cls.classId);
      }
    }
  }
  return [...ids];
}

export function selectTodayEntryRows(
  entries: MyEntry[],
  now: Date,
  selfCheckinByClassId: Record<string, boolean> | undefined
): TodayEntryRow[] {
  const rows: TodayEntryRow[] = [];
  for (const group of groupEntriesByShow(entries)) {
    const isPastShow = isPastShowEntry(group.orders[0]!, now);
    if (isPastShow) continue;
    const ctx: DayCheckInContext = {
      now,
      ordersById: indexOrdersById(group),
      selfCheckinByClassId,
      isPastShow,
    };
    for (const dog of group.dogs) {
      for (const cls of dog.classes) {
        if (!isTrialDayToday(cls.trialDate, cls.trialTimezone, now)) continue;
        const kind = deriveClassRowState(cls, ctx).kind;
        rows.push({
          key: cls.id,
          classId: cls.classId,
          showName: group.showName,
          dogName: dog.dogName,
          className: cls.name,
          statusText:
            classRowStatusText(kind) ?? (kind === 'result' ? 'Result in' : 'See My Shows'),
        });
      }
    }
  }
  return rows;
}
