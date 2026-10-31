/**
 * Today's class rows, read off My Shows' own view model (MYK9-1524).
 *
 * The Home "Your entries today" card derives nothing of its own: the rows come
 * from `groupEntriesByShow`, the day from the same trial-day gate the check-in
 * flow uses (`isTrialDayToday`, in the TRIAL's timezone), and the status text
 * from `classRowDisplay`, the function the My Shows row renders from. An entry
 * My Shows says cannot check in therefore never reads "Check in" here.
 *
 * @module MyEntriesPage/modules/todayEntryRows
 */

import { SEE_MY_SHOWS_TEXT, classRowDisplay } from './classRowStatusText';
import { buildDayCheckInContext, trialDayState } from './dayCheckIn';
import { groupEntriesByShow } from './groupEntriesByShow';
import { formatTrialLabel } from '@myk9/core';
import type { SelfCheckinState } from '@/hooks/queries/useSelfCheckinEnabled';
import type { ClassRowKind } from './myShowDogState';
import type { MyEntry } from './my-entries-types';

export interface TodayEntryRow {
  /** Class row id (`MyShowClass.id`); unique per row. */
  key: string;
  /** Class id the self-check-in cascade is keyed on, when known. */
  classId: string | undefined;
  showName: string;
  /** Show and trial, so same-named classes on one day stay tellable apart. */
  where: string;
  dogName: string;
  className: string;
  /** My Shows' status or action text for this row; never empty. */
  statusText: string;
}

/** Unscored classes whose trial day is `now` are the only ones that resolve the cascade. */
export function todayClassIds(entries: MyEntry[], now: Date): string[] {
  const ids = new Set<string>();
  for (const group of groupEntriesByShow(entries)) {
    for (const dog of group.dogs) {
      for (const cls of dog.classes) {
        if (
          cls.classId &&
          !cls.isScored &&
          trialDayState(cls.trialDate, cls.trialTimezone, now) === 'today'
        )
          ids.add(cls.classId);
      }
    }
  }
  return [...ids];
}

/** Row kinds whose text is check-in wording, which an unread setting cannot vouch for. */
const CHECK_IN_WORDING: ReadonlySet<ClassRowKind> = new Set<ClassRowKind>([
  'check-in-available',
  'opens-later',
  'closed-today',
]);

/**
 * Does any class have an unknown trial day (its trial has not replicated yet)?
 * "No rows today" is not a fact while one exists. Reads the same tri-state the
 * My Shows row and strip read.
 */
export function hasUndatedClass(entries: MyEntry[], now: Date): boolean {
  return groupEntriesByShow(entries).some(group =>
    group.dogs.some(dog =>
      dog.classes.some(cls => trialDayState(cls.trialDate, cls.trialTimezone, now) === 'unknown')
    )
  );
}

/**
 * `selfCheckinStateByClassId` is the card's extra caution. My Shows reads the
 * setting optimistically while it loads (and fails closed on error); the card
 * may only be MORE conservative, so a class whose setting is `'unknown'` never
 * gets check-in wording.
 */
export function selectTodayEntryRows(
  entries: MyEntry[],
  now: Date,
  selfCheckinByClassId: Record<string, boolean> | undefined,
  selfCheckinStateByClassId: Record<string, SelfCheckinState> | undefined = undefined
): TodayEntryRow[] {
  const rows: TodayEntryRow[] = [];
  for (const group of groupEntriesByShow(entries)) {
    const ctx = buildDayCheckInContext(group, now, selfCheckinByClassId);
    for (const dog of group.dogs) {
      for (const cls of dog.classes) {
        if (trialDayState(cls.trialDate, cls.trialTimezone, now) !== 'today') continue;
        const display = classRowDisplay(cls, ctx);
        const settingUnknown =
          cls.classId !== undefined && selfCheckinStateByClassId?.[cls.classId] === 'unknown';
        rows.push({
          key: cls.id,
          classId: cls.classId,
          showName: group.showName,
          where: [
            group.showName,
            cls.trialName || cls.trialNumber
              ? formatTrialLabel({ name: cls.trialName, trialNumber: cls.trialNumber })
              : null,
          ]
            .filter(Boolean)
            .join(' · '),
          dogName: dog.dogName,
          className: cls.name,
          statusText:
            settingUnknown && CHECK_IN_WORDING.has(display.kind) ? SEE_MY_SHOWS_TEXT : display.text,
        });
      }
    }
  }
  return rows;
}
