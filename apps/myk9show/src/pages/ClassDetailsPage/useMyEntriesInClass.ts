/**
 * useMyEntriesInClass — the current user's entries in a single class.
 *
 * Used by ExhibitorClassCallout to decide whether to show the
 * "Your dogs in this class" (before) or "Your results" (after) callout.
 */

import { useMemo } from 'react';
import { useEntryStore } from '@/store/entryStore';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useAuthContext } from '@/hooks/useAuthContext';
import { getDogDisplayName } from '@/types/dog-types';
import type { SyncableShowEntry } from '@/store/entry-store-types';

export interface MyClassEntry {
  entryId: string;
  dogId: string;
  dogName: string;
  armband: string;
  runOrder: number;
  position: number;   // 1-based position among all entries sorted by runOrder
  dogsAhead: number;  // unscored entries with lower runOrder
  hasResult: boolean;
  result?: {
    qualified: boolean;
    time?: string;
    placement?: number;
    faults?: number;
  };
}

export interface UseMyEntriesInClassResult {
  myEntries: MyClassEntry[];
  isAfterClass: boolean; // true when ANY of my entries has a result
}

function entryIsScored(e: SyncableShowEntry): boolean {
  return e.status === 'completed' || !!e.competitionData;
}

export function useMyEntriesInClass(classId: string | undefined): UseMyEntriesInClassResult {
  const { userWithRoles } = useAuthContext();
  const allEntries = useEntryStore(s => s.entries);
  const { dogs } = useDogStoreCompat();

  const databaseUserId = userWithRoles?.databaseUserId;

  return useMemo(() => {
    if (!classId || !databaseUserId) return { myEntries: [], isAfterClass: false };

    const myDogIds = new Set(dogs.filter(d => d.ownerId === databaseUserId).map(d => d.id));
    if (myDogIds.size === 0) return { myEntries: [], isAfterClass: false };

    const dogNameMap = new Map(
      dogs.filter(d => myDogIds.has(d.id)).map(d => [d.id, getDogDisplayName(d) || 'Unknown Dog'])
    );

    const classEntries = allEntries.filter(e => e.classId === classId);

    // Sort all class entries by runOrder for position computation.
    // Entries with runOrder 0 or undefined are placed last.
    const sorted = [...classEntries].sort((a, b) => {
      const ra = a.registrationData.runOrder ?? 0;
      const rb = b.registrationData.runOrder ?? 0;
      if (ra === 0 && rb === 0) return 0;
      if (ra === 0) return 1;
      if (rb === 0) return -1;
      return ra - rb;
    });

    const myEntries: MyClassEntry[] = [];

    for (const entry of classEntries) {
      if (!myDogIds.has(entry.dogId)) continue;

      const runOrder = entry.registrationData.runOrder ?? 0;

      // 1-based position in the sorted run order.
      const position = runOrder > 0 ? sorted.findIndex(e => e.id === entry.id) + 1 : 0;

      // Count unscored entries ahead in the run order.
      const dogsAhead =
        runOrder > 0
          ? classEntries.filter(
              e =>
                (e.registrationData.runOrder ?? 0) > 0 &&
                (e.registrationData.runOrder ?? 0) < runOrder &&
                !entryIsScored(e)
            ).length
          : 0;

      const compData = entry.competitionData;
      const hasResult = !!compData;

      myEntries.push({
        entryId: entry.id,
        dogId: entry.dogId,
        dogName: dogNameMap.get(entry.dogId) ?? 'Unknown Dog',
        armband: entry.registrationData.armband ?? '',
        runOrder,
        position,
        dogsAhead,
        hasResult,
        ...(hasResult && compData
          ? {
              result: {
                qualified: compData.qualified ?? false,
                time: compData.time ?? undefined,
                placement: compData.placement ? parseInt(compData.placement, 10) : undefined,
                faults: compData.faults ?? undefined,
              },
            }
          : {}),
      });
    }

    // Sort my entries by run order for consistent display.
    myEntries.sort((a, b) => {
      if (a.runOrder === 0 && b.runOrder === 0) return 0;
      if (a.runOrder === 0) return 1;
      if (b.runOrder === 0) return -1;
      return a.runOrder - b.runOrder;
    });

    const isAfterClass = myEntries.some(e => e.hasResult);

    return { myEntries, isAfterClass };
  }, [classId, databaseUserId, allEntries, dogs]);
}
