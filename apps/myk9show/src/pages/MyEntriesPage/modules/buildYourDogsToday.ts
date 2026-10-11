/**
 * "Your dogs today": the pure ordering and filtering behind the show-day list
 * at the top of a My Shows show group (MYK9-1046).
 *
 * This only REORDERS rows the show group already holds. It computes no place
 * in line (the server counts that, MYK9-995) and no second run-order rule: the
 * tie-break inside one class is `compareStoredRunOrderNullLast`, the shared
 * comparator for stored run numbers. The data model carries no ring column, so
 * "which ring" is not a sort key; a class's start time orders the day.
 *
 * @module MyEntriesPage/modules/buildYourDogsToday
 */

import { formatAtShowClassTime } from '@/features/at-show/atShowClassTiming';
import { compareStoredRunOrderNullLast } from '@/utils/showEntryRunQueue';
import { isTrialDayToday, type DayCheckInContext } from './dayCheckIn';
import type { MyShowClass, MyShowDog } from './groupEntriesByShow';
import { deriveClassRowState, type ClassRowKind } from './myShowDogState';

/** A class's posted start, as an exhibitor may read it: an estimate, never a promise. */
export interface ClassTiming {
  /** "9:00 AM" in the trial's zone. */
  label: string;
  /** Minutes since midnight, for ordering the day. */
  sortMinutes: number;
  /** The secretary moved the start; the label is the revised estimate. */
  isRevised: boolean;
}

/** Row kinds that mean the dog is not going to run this class. */
const NOT_RUNNING: ReadonlySet<ClassRowKind> = new Set<ClassRowKind>([
  'withdrawn',
  'scratched',
  'moved',
  'not-accepted',
  'absent',
  'pulled',
]);

export interface YourDogsTodayRow {
  cls: MyShowClass;
  dog: MyShowDog;
  kind: ClassRowKind;
  timing: ClassTiming | null;
}

export interface YourDogsTodayOption {
  dogId: string;
  dogName: string;
  count: number;
}

export interface FilteredYourDogsToday {
  rows: YourDogsTodayRow[];
  /** One option per dog, counted over the WHOLE day (never the narrowed list). */
  options: YourDogsTodayOption[];
  /** Every entry once. Equals the sum of the option counts. */
  total: number;
}

function clockMinutes(label: string): number | null {
  const match = label.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (!match) return null;
  const hour = (Number(match[1]) % 12) + (match[3] === 'PM' ? 12 : 0);
  return hour * 60 + Number(match[2]);
}

/** The class's start as a clock time, or null when none (or none readable) is posted. */
export function classTimingOf(
  startTime: string | null | undefined,
  revisedExpectedStart: string | null | undefined,
  timeZone: string
): ClassTiming | null {
  const effective = revisedExpectedStart || startTime;
  const label = formatAtShowClassTime(effective, timeZone);
  const sortMinutes = label ? clockMinutes(label) : null;
  if (!label || sortMinutes === null) return null;
  return { label, sortMinutes, isRevised: Boolean(revisedExpectedStart) };
}

/**
 * Every class a dog is still due to run today, across all dogs, in day order:
 * class start (unknown last), then the shared run-order comparator, then dog
 * name and row id so the order is stable.
 */
export function buildYourDogsToday(
  dogs: readonly MyShowDog[],
  ctx: DayCheckInContext,
  timings: ReadonlyMap<string, ClassTiming>
): YourDogsTodayRow[] {
  const rows: YourDogsTodayRow[] = [];
  for (const dog of dogs) {
    for (const cls of dog.classes) {
      if (cls.status !== 'entered' || cls.unresolved) continue;
      if (!isTrialDayToday(cls.trialDate, cls.trialTimezone, ctx.now)) continue;
      const { kind } = deriveClassRowState(cls, ctx);
      if (NOT_RUNNING.has(kind)) continue;
      rows.push({ cls, dog, kind, timing: (cls.classId && timings.get(cls.classId)) || null });
    }
  }
  return rows.sort(
    (a, b) =>
      (a.timing?.sortMinutes ?? Infinity) - (b.timing?.sortMinutes ?? Infinity) ||
      (a.cls.classId ?? '').localeCompare(b.cls.classId ?? '') ||
      compareStoredRunOrderNullLast(a.cls.runOrder, b.cls.runOrder) ||
      a.dog.dogName.localeCompare(b.dog.dogName) ||
      a.cls.id.localeCompare(b.cls.id)
  );
}

/** Narrow to one dog (`null` = all dogs) without disturbing the day's counts. */
export function filterYourDogsToday(
  rows: readonly YourDogsTodayRow[],
  dogId: string | null
): FilteredYourDogsToday {
  const counts = new Map<string, YourDogsTodayOption>();
  for (const row of rows) {
    const option = counts.get(row.dog.dogId);
    if (option) option.count += 1;
    else counts.set(row.dog.dogId, { dogId: row.dog.dogId, dogName: row.dog.dogName, count: 1 });
  }
  return {
    rows: dogId === null ? [...rows] : rows.filter(row => row.dog.dogId === dogId),
    options: [...counts.values()].sort((a, b) => a.dogName.localeCompare(b.dogName)),
    total: rows.length,
  };
}

/**
 * The list earns its place only when it answers "which dog first?": two or
 * more dogs with a class to run today. One dog's day is already its own card.
 */
export function hasYourDogsToday(dogs: readonly MyShowDog[], ctx: DayCheckInContext): boolean {
  return new Set(buildYourDogsToday(dogs, ctx, new Map()).map(row => row.dog.dogId)).size >= 2;
}
