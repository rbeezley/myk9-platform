import type { ShowEntry } from '@/store/entry-store-types';
import { getRunOrder } from './runOrderUtils';

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

    const runOrder = getRunOrder(cls.entries);
    const inRingIndex = runOrder.findIndex(e => e.checkInStatus === 'in-ring');
    const dogIndex = runOrder.findIndex(e => e.dogId === dogId);

    if (dogIndex === -1) continue;

    // If a dog is in the ring, dogsAhead = distance from that dog.
    // If no dog is in the ring, dogsAhead = position from front of run order.
    const dogsAhead = inRingIndex >= 0 ? dogIndex - inRingIndex : dogIndex;

    if (dogsAhead >= 0 && dogsAhead <= leadDogs) {
      conflicts.push({ className: cls.className, dogsAhead });
    }
  }

  return conflicts;
}
