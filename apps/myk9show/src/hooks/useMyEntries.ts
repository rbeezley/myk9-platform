import { useMemo } from 'react';
import { useEntryStore } from '@/store/entryStore';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useAuthContext } from '@/hooks/useAuthContext';
import type { SyncableShowEntry } from '@/store/entry-store-types';

interface MyEntryByClass {
  classId: string;
  className: string;
  dogName: string;
  armband: string;
  runOrder: number;
  dogsAhead: number;
  scored: boolean;
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
  const canSeeAll = isAdmin || isSecretary || hasRole('club_admin');

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

    // Build enriched per-class data
    const entriesByClass: MyEntryByClass[] = filteredEntries.map(entry => {
      const runOrder = entry.registrationData.runOrder ?? 0;

      // dogsAhead: count entries in same class with lower runOrder that are not scored
      const dogsAhead =
        runOrder > 0
          ? allShowEntries.filter(
              e =>
                e.classId === entry.classId &&
                (e.registrationData.runOrder ?? 0) > 0 &&
                (e.registrationData.runOrder ?? 0) < runOrder &&
                !isScored(e)
            ).length
          : 0;

      const dogInfo = dogMap.get(entry.dogId);

      return {
        classId: entry.classId,
        className: classMap.get(entry.classId) ?? 'Unknown Class',
        dogName: dogInfo?.callName || dogInfo?.name || 'Unknown Dog',
        armband: entry.registrationData.armband ?? '',
        runOrder,
        dogsAhead,
        scored: isScored(entry),
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
