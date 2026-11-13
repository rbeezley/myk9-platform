/**
 * The exhibitor's "First class" line on the Check-in desk (MYK9-1786): answers "what's first?"
 * at the front door without leaving the desk. Pure, over the rows the desk already holds.
 */
import { compareClassSchedule } from '@/features/_shared/classScheduleOrder';
import { isTrialDateToday } from '@/features/_shared/trialDateEligibility';
import type { PeopleRosterClassInfo, PeopleRosterClassRow } from './peopleRoster';
import { deskClassLine } from './deskClassLine';

/** The ids of the show's classes whose trial runs on the desk's day (today, by the trial's clock). */
export function classIdsOnDay(
  classes: readonly PeopleRosterClassInfo[],
  currentDate: Date
): Set<string> {
  return new Set(
    classes
      .filter(
        cls => Boolean(cls.trialDate) && isTrialDateToday(cls.trialDate, cls.timezone, currentDate)
      )
      .map(cls => cls.id)
  );
}

/**
 * Still to run: the desk can still set its status (accepted, not scored, not scratched, withdrawn
 * or absent, not in the ring or completed) and nobody has pulled or flagged it pulled. The same
 * rule (`deskStatusEditable`) that decides whether the desk offers a status change at all.
 */
function stillToRun(row: PeopleRosterClassRow): boolean {
  return row.deskStatusEditable && row.checkInStatus !== 'pulled';
}

/**
 * The exhibitor's earliest class still to run on the desk's day, across all their dogs: by start
 * time, untimed classes last, ties in the desk's own row order. Null when nothing is left that day.
 */
export function firstClassForExhibitor(
  rows: readonly PeopleRosterClassRow[],
  dayClassIds: ReadonlySet<string>
): PeopleRosterClassRow | null {
  const left = rows.filter(
    row => dayClassIds.has(row.sourceClass.classId ?? row.sourceClass.id) && stillToRun(row)
  );
  // Array sort is stable, so a tie keeps the desk's order (dog, then schedule).
  return (
    [...left].sort((a, b) => compareClassSchedule({ time: a.time }, { time: b.time }))[0] ?? null
  );
}

/** "First class: Container Novice A · Trial 1 · 8:00 AM (Cooper)", or null when nothing is left. */
export function firstClassLine(
  rows: readonly PeopleRosterClassRow[],
  dayClassIds: ReadonlySet<string>
): string | null {
  const first = firstClassForExhibitor(rows, dayClassIds);
  return first ? `First class: ${deskClassLine(first)} (${first.dogName})` : null;
}
