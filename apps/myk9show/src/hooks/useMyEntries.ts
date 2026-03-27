import { useMemo } from 'react';
import { useEntryStore } from '@/store/entryStore';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useAuthContext } from '@/hooks/useAuthContext';
import { getDogDisplayName } from '@/types/dog-types';
import { UserRole } from '@/types/auth-types';
import type { CheckInStatus } from '@myk9/core';
import type { SyncableShowEntry } from '@/store/entry-store-types';

interface MyEntryByClass {
  classId: string;
  className: string;
  dogName: string;
  armband: string;
  runOrder: number;
  dogsAhead: number;
  scored: boolean;
  checkInStatus: CheckInStatus;
}

export interface UseMyEntriesResult {
  entries: Array<{ id: string; showId: string }>;
  entriesByClass: MyEntryByClass[];
  isLoading: boolean;
  isError: boolean;
}

const EMPTY_RESULT: UseMyEntriesResult = {
  entries: [],
  entriesByClass: [],
  isLoading: false,
  isError: false,
};

function isScored(entry: Pick<SyncableShowEntry, 'status' | 'competitionData'>): boolean {
  return entry.status === 'completed' || !!entry.competitionData;
}

export function useMyEntries(showId: string | undefined): UseMyEntriesResult {
  const { userWithRoles, isAdmin, isSecretary, hasRole } = useAuthContext();
  // Use a selector so the component re-renders when entries change
  const storeEntries = useEntryStore(s => s.entries);
  const isLoading = useEntryStore(s => s.isLoading);
  const error = useEntryStore(s => s.error);
  const { classes } = useClassStoreCompat();
  const { dogs } = useDogStoreCompat();

  const databaseUserId = userWithRoles?.databaseUserId;
  const canSeeAll = isAdmin || isSecretary || hasRole(UserRole.CLUB_ADMIN);

  return useMemo(() => {
    if (!showId) return { ...EMPTY_RESULT };

    // Get ALL entries for the show (needed for dogsAhead computation)
    const allShowEntries = storeEntries.filter(e => e.showId === showId);

    // Build lookup maps
    const classMap = new Map(classes.map(c => [c.id, c.className ?? 'Unknown Class']));
    const dogMap = new Map(
      dogs.map(d => [d.id, { callName: d.callName, name: d.name, ownerId: d.ownerId }])
    );

    // Role-based filtering
    let filteredEntries = allShowEntries;
    if (!canSeeAll) {
      if (!databaseUserId) {
        return { ...EMPTY_RESULT, isLoading, isError: !!error };
      }
      const myDogIds = new Set(dogs.filter(d => d.ownerId === databaseUserId).map(d => d.id));
      filteredEntries = allShowEntries.filter(e => myDogIds.has(e.dogId));
    }

    // Build entries list
    const entries = filteredEntries.map(e => ({ id: e.id, showId: e.showId }));

    // Pre-group all show entries by classId for O(N) dogsAhead computation
    const entriesByClassId = new Map<string, SyncableShowEntry[]>();
    for (const e of allShowEntries) {
      const bucket = entriesByClassId.get(e.classId);
      if (bucket) bucket.push(e);
      else entriesByClassId.set(e.classId, [e]);
    }

    // Build enriched per-class data
    const entriesByClass: MyEntryByClass[] = filteredEntries.map(entry => {
      const runOrder = entry.registrationData.runOrder ?? 0;

      // dogsAhead: count unscored entries in same class with lower runOrder
      // Uses allShowEntries (via entriesByClassId), not filteredEntries — intentional
      const dogsAhead =
        runOrder > 0
          ? (entriesByClassId.get(entry.classId) ?? []).filter(
              e =>
                (e.registrationData.runOrder ?? 0) > 0 &&
                (e.registrationData.runOrder ?? 0) < runOrder &&
                !isScored(e)
            ).length
          : 0;

      const dogInfo = dogMap.get(entry.dogId);

      return {
        classId: entry.classId,
        className: classMap.get(entry.classId) ?? 'Unknown Class',
        dogName: dogInfo ? getDogDisplayName(dogInfo) || 'Unknown Dog' : 'Unknown Dog',
        armband: entry.registrationData.armband ?? '',
        runOrder,
        dogsAhead,
        scored: isScored(entry),
        checkInStatus: entry.checkInStatus ?? 'no-status',
      };
    });

    return {
      entries,
      entriesByClass,
      isLoading,
      isError: !!error,
    };
  }, [showId, storeEntries, classes, dogs, canSeeAll, databaseUserId, isLoading, error]);
}
