/**
 * MYK9-2073: which armband labels the panel prints, beyond the scope it opened on.
 *
 * - A day: every trial on that calendar date, one label per dog (a dog in two trials that day is
 *   one label, as `selectArmbandLabelEntries` already guarantees for a dog-day).
 * - One dog: that dog's label for the chosen day (a lost label or a late entry).
 * - Only labels added since the last print: drops every dog-day already in a recorded, not undone,
 *   armband label print. The print record already lists its dog-days
 *   (`coverage.subjectFingerprints`, keyed by `buildArmbandPaperworkDescriptor`), so no new storage.
 */
import type { ReportScope } from '@/lib/reports/types';
import type { ArmbandLabelEntry } from './armbandLabelTypes';
import { armbandDogKey, armbandLabelSubjectKey } from './armbandSubjectKey';

export interface ArmbandLabelChoice {
  /** `YYYY-MM-DD`; null keeps the scope the panel opened on. */
  day: string | null;
  /** The dog's identity (`dogKeyOf`); null is every dog. */
  dogKey: string | null;
  addedOnly: boolean;
}

export const DEFAULT_LABEL_CHOICE: ArmbandLabelChoice = {
  day: null,
  dogKey: null,
  addedOnly: false,
};

export interface ArmbandPrintRecordLike {
  reportId: string;
  coverage: Record<string, unknown>;
  printedAt: string;
  voidedAt?: string | undefined;
}

export const dogKeyOf = armbandDogKey;

/** The subject key `buildArmbandPaperworkDescriptor` writes for this dog on this day. */
export const labelKeyOf = (entry: ArmbandLabelEntry): string => armbandLabelSubjectKey(entry);

/** The entries the panel's day and dog choice (or, with no day, its scope) leaves in play. */
export function entriesForChoice(
  entries: readonly ArmbandLabelEntry[],
  scope: ReportScope,
  choice: Pick<ArmbandLabelChoice, 'day' | 'dogKey'>
): ArmbandLabelEntry[] {
  return entries.filter(entry => {
    if (choice.day) {
      if (entry.calendarDay !== choice.day) return false;
    } else if (scope.kind === 'class') {
      if (entry.classId !== scope.classId) return false;
    } else if (scope.kind === 'trial' && entry.trialId !== scope.trialId) {
      return false;
    }
    return choice.dogKey === null || dogKeyOf(entry) === choice.dogKey;
  });
}

function printedSubjects(record: ArmbandPrintRecordLike): string[] {
  const fingerprints = record.coverage.subjectFingerprints;
  return fingerprints && typeof fingerprints === 'object' ? Object.keys(fingerprints) : [];
}

/** Every dog-day in a label print that was not undone. */
export function printedLabelKeys(records: readonly ArmbandPrintRecordLike[]): Set<string> {
  const keys = new Set<string>();
  for (const record of records) {
    if (record.reportId !== 'armband-labels' || record.voidedAt) continue;
    for (const key of printedSubjects(record)) keys.add(key);
  }
  return keys;
}

/** When this dog-day's label last printed, or null when it has not. */
export function lastLabelPrintedAt(
  records: readonly ArmbandPrintRecordLike[],
  key: string
): string | null {
  let latest: string | null = null;
  for (const record of records) {
    if (record.reportId !== 'armband-labels' || record.voidedAt) continue;
    if (!printedSubjects(record).includes(key)) continue;
    if (latest === null || record.printedAt > latest) latest = record.printedAt;
  }
  return latest;
}

/** The labels still to print: those whose dog-day is not in an earlier print. */
export function withoutPrintedLabels(
  entries: readonly ArmbandLabelEntry[],
  printed: ReadonlySet<string>
): ArmbandLabelEntry[] {
  return entries.filter(entry => !printed.has(labelKeyOf(entry)));
}

/** The show's label days, earliest first. */
export function listLabelDays(entries: readonly ArmbandLabelEntry[]): string[] {
  return [...new Set(entries.map(entry => entry.calendarDay).filter(Boolean))].sort();
}

export interface ArmbandLabelDog {
  dogKey: string;
  label: string;
  callName: string;
  armband: number;
}

/** One option per dog, by armband. */
export function listLabelDogs(entries: readonly ArmbandLabelEntry[]): ArmbandLabelDog[] {
  const dogs = new Map<string, ArmbandLabelEntry>();
  for (const entry of entries) if (!dogs.has(dogKeyOf(entry))) dogs.set(dogKeyOf(entry), entry);
  return [...dogs.values()]
    .sort((a, b) => a.armband - b.armband)
    .map(entry => ({
      dogKey: dogKeyOf(entry),
      label: `#${entry.armband} ${entry.callName}`.trim(),
      callName: entry.callName,
      armband: entry.armband,
    }));
}

/** "Monday, Dec 7" for a `YYYY-MM-DD` label day. */
export function formatLabelDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? day
    : date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });
}

/** The choice a dog's row opens on: that dog, on that entry's day. */
export function choiceForEntry(
  entries: readonly ArmbandLabelEntry[],
  entryId: string | undefined
): ArmbandLabelChoice | null {
  const entry = entryId ? entries.find(item => item.id === entryId) : undefined;
  return entry
    ? { day: entry.calendarDay || null, dogKey: dogKeyOf(entry), addedOnly: false }
    : null;
}
