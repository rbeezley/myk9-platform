/**
 * orderMyEntriesToday — one cross-dog order for the exhibitor's "Your dogs
 * today" list, plus the per-dog filter over it (MYK9-1046).
 *
 * Order: class start time (unknown last), then the class itself so a class's
 * rows stay together, then the run queue inside the class. Inside a class the
 * server's place in line decides when EVERY row there has one; otherwise the
 * ringside tie-break (`compareByRunOrder`: run order, armband, id) decides.
 * Mixing the two row by row could not be transitive, so the choice is made
 * once per class. No second ordering rule lives here.
 */
import { parseClassTime } from '@myk9/ringside';
import { compareByRunOrder, type RunQueueEntry } from '@myk9/ringside/run-queue';
import type { AtShowEntryDetail } from './myAtShowEntryDetails.helpers';

type Places = ReadonlyMap<string, number>;

/** Minutes after midnight on the trial's clock, from an instant or a clock string. */
function startMinutes(detail: AtShowEntryDetail): number | null {
  const parsed = parseClassTime(detail.startTime);
  if (!parsed) return null;
  if (parsed.kind === 'clock') return parsed.minutes;
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
    ...(detail.trialTimezone ? { timeZone: detail.trialTimezone } : {}),
  }).formatToParts(parsed.ms);
  const part = (type: 'hour' | 'minute') => Number(parts.find(p => p.type === type)?.value ?? NaN);
  const minutes = part('hour') * 60 + part('minute');
  return Number.isNaN(minutes) ? null : minutes;
}

function classKey(detail: AtShowEntryDetail): string {
  return detail.classId ?? `no-class:${detail.entryId}`;
}

function toQueueEntry(detail: AtShowEntryDetail): RunQueueEntry {
  const armband = Number.parseInt(detail.armband ?? '', 10);
  return {
    id: detail.entryId,
    armband: Number.isNaN(armband) ? 0 : armband,
    exhibitorOrder: detail.runOrder ?? null,
  };
}

export function orderMyEntriesToday(
  entries: readonly AtShowEntryDetail[],
  places: Places
): AtShowEntryDetail[] {
  const starts = new Map<string, number | null>();
  const placedClasses = new Map<string, boolean>();
  for (const detail of entries) {
    const key = classKey(detail);
    const start = startMinutes(detail);
    starts.set(key, Math.min(starts.get(key) ?? Infinity, start ?? Infinity));
    placedClasses.set(key, (placedClasses.get(key) ?? true) && places.has(detail.entryId));
  }

  return [...entries].sort((a, b) => {
    const keyA = classKey(a);
    const keyB = classKey(b);
    if (keyA !== keyB) {
      const byStart = (starts.get(keyA) ?? Infinity) - (starts.get(keyB) ?? Infinity);
      // Infinity - Infinity is NaN: two unknown starts tie, then the class id decides.
      if (byStart !== 0 && !Number.isNaN(byStart)) return byStart;
      return keyA < keyB ? -1 : 1;
    }
    if (placedClasses.get(keyA)) {
      return (places.get(a.entryId) as number) - (places.get(b.entryId) as number);
    }
    return compareByRunOrder(toQueueEntry(a), toQueueEntry(b));
  });
}

export interface MyDogSummary {
  dogKey: string;
  dogName: string;
  /** Entries for this dog across the whole day, each counted once. */
  count: number;
}

function dogKeyOf(detail: AtShowEntryDetail): string {
  return detail.dogKey ?? detail.dogName;
}

/** One row per dog in order of first appearance; counts ignore any active filter. */
export function summarizeDogs(entries: readonly AtShowEntryDetail[]): MyDogSummary[] {
  const seen = new Set<string>();
  const dogs = new Map<string, MyDogSummary>();
  for (const detail of entries) {
    if (seen.has(detail.entryId)) continue;
    seen.add(detail.entryId);
    const key = dogKeyOf(detail);
    const dog = dogs.get(key);
    if (dog) dog.count += 1;
    else dogs.set(key, { dogKey: key, dogName: detail.dogName, count: 1 });
  }
  return [...dogs.values()];
}

/** `null` = All. */
export function filterByDog(
  entries: readonly AtShowEntryDetail[],
  dogKey: string | null
): AtShowEntryDetail[] {
  return dogKey === null ? [...entries] : entries.filter(detail => dogKeyOf(detail) === dogKey);
}

/** The selection if that dog still has rows; otherwise All (`null`). */
export function resolveDogSelection(
  selected: string | null,
  dogs: readonly MyDogSummary[]
): string | null {
  return selected !== null && dogs.some(dog => dog.dogKey === selected) ? selected : null;
}

export function dogFilterLabel(dog: MyDogSummary): string {
  return `${dog.dogName}, ${dog.count} ${dog.count === 1 ? 'class' : 'classes'}`;
}
