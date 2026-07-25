import type { ShowEntry } from '@/store/entry-store-types';
import { dogsAheadInClass } from './showEntryRunQueue';

export interface ConflictInfo {
  className: string;
  dogsAhead: number;
}

export interface ClassContext {
  classId: string;
  className: string;
  status: string;
  entries: ShowEntry[];
}

/**
 * Scan other in-progress classes for the same dog.
 * Returns conflict info for each class where the dog is within leadDogs range.
 *
 * `dogsAhead` is the shared run-queue count (`dogsAheadInClass`), the same
 * number the entry list pill and the "your turn" push notification report — it
 * counts the dogs still waiting ahead of this one and excludes the dog in the
 * ring. It used to be measured *from* the in-ring dog here, which made the
 * conflict label disagree by one with every other surface.
 */
export function detectConflicts(
  dogId: string,
  currentClassId: string,
  allClasses: ClassContext[],
  leadDogs: number
): ConflictInfo[] {
  const conflicts: ConflictInfo[] = [];

  for (const cls of allClasses) {
    if (cls.classId === currentClassId) continue;
    if (cls.status !== 'In Progress') continue;

    const dogEntry = cls.entries.find(e => e.dogId === dogId && !e.competitionData);
    if (!dogEntry) continue;

    const dogsAhead = dogsAheadInClass(cls.entries, dogEntry.id);
    if (dogsAhead === null) continue;

    // Same window the push monitor uses: the next `leadDogs` waiting dogs.
    if (dogsAhead < leadDogs) {
      conflicts.push({ className: cls.className, dogsAhead });
    }
  }

  return conflicts;
}
