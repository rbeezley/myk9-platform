import { calendarDayKey } from '@/features/_shared/classScheduleOrder';
import { elementRank, levelRank } from './scentWorkMergedOrder';
import type { EntryClass, EntryManagementEntry } from '@/types/entry-management-types';

type ClassOrderKey = Pick<EntryClass, 'trialDate' | 'trialNumber' | 'element' | 'level'>;

/** "Trial 1" (seed data) and "1" (elsewhere) are the same trial; null when there is no number. */
export function trialNumberValue(value: string | null | undefined): number | null {
  const match = /\d+/.exec(value ?? '');
  return match ? Number(match[0]) : null;
}

function compareLast<T extends string | number>(a: T | null, b: T | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

function compareTrialName(a: string | null | undefined, b: string | null | undefined): number {
  // Numbered trials were already ordered (and "Trial 1" equals "1"); only names decide here.
  if (trialNumberValue(a) !== null || trialNumberValue(b) !== null) return 0;
  const left = a?.trim() || null;
  const right = b?.trim() || null;
  if (left === null || right === null) return compareLast(left, right);
  return left.localeCompare(right, undefined, { numeric: true });
}

/** Trial date, trial number, element, level. Anything unknown sorts last. */
export function compareClassOrder(a: ClassOrderKey, b: ClassOrderKey): number {
  return (
    compareLast(calendarDayKey(a.trialDate), calendarDayKey(b.trialDate)) ||
    compareLast(trialNumberValue(a.trialNumber), trialNumberValue(b.trialNumber)) ||
    // Trial names without a number ("UKC-Nosework") still keep each trial's classes together.
    compareTrialName(a.trialNumber, b.trialNumber) ||
    compareLast(elementRank(a.element), elementRank(b.element)) ||
    compareLast(levelRank(a.level), levelRank(b.level))
  );
}

/** A dog's entries in running order; an entry sorts by its earliest class. Ties keep read order. */
export function sortEntriesByClassOrder(entries: EntryManagementEntry[]): EntryManagementEntry[] {
  const first = (entry: EntryManagementEntry): ClassOrderKey =>
    [...entry.classes].sort(compareClassOrder)[0] ?? {};
  return [...entries].sort((a, b) => compareClassOrder(first(a), first(b)));
}
