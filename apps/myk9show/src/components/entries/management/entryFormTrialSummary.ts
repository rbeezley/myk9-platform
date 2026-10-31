import { formatWeekdayMonthDay } from '@/lib/format/dates';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { compareClassOrder } from './entryClassOrder';

/** One trial an entry form has entries in: "Sat, Nov 9 · Trial 1" and the classes entered there. */
export interface TrialClassLine {
  key: string;
  label: string;
  classes: string[];
}

export interface TrialClassSummary {
  /** At most `maxLines` trials, earliest first. */
  lines: TrialClassLine[];
  /** Classes on trials that did not fit. */
  hiddenClassCount: number;
}

/** "Mon, Nov 9 · Trial 1", or whatever part of it is known. */
export function formatTrialLabel(
  date: string | null | undefined,
  number: string | null | undefined
): string {
  const day = date ? formatWeekdayMonthDay(date) : '';
  // Trial numbers are free text: the seed data stores "Trial 1", other shows store just "1".
  const numberLabel = number
    ? /^trial\b/i.test(number.trim())
      ? number.trim()
      : `Trial ${number}`
    : '';
  return [day, numberLabel].filter(Boolean).join(' · ');
}

/**
 * Which trial and class each entry on a form is for, grouped by trial. A pulled or withdrawn entry
 * is no longer a class the exhibitor will run, so it only shows when nothing else does.
 */
export function summarizeTrialClasses(
  entries: readonly EntryManagementEntry[],
  maxLines = 2
): TrialClassSummary {
  const all = entries.flatMap(entry => entry.classes);
  const active = all.filter(cls => cls.status === 'entered');
  const shown = [...(active.length > 0 ? active : all)].sort(compareClassOrder);

  const buckets = new Map<string, TrialClassLine>();
  for (const cls of shown) {
    const label = formatTrialLabel(cls.trialDate, cls.trialNumber);
    const key = cls.trialId ?? (label || 'unknown');
    const bucket = buckets.get(key) ?? { key, label, classes: [] };
    if (!bucket.classes.includes(cls.name)) bucket.classes.push(cls.name);
    buckets.set(key, bucket);
  }

  // `shown` is already in trial date / number order, and a Map keeps insertion order.
  const ordered = [...buckets.values()];
  const lines = ordered.slice(0, maxLines);
  const hiddenClassCount = ordered
    .slice(maxLines)
    .reduce((count, bucket) => count + bucket.classes.length, 0);
  return { lines, hiddenClassCount };
}
