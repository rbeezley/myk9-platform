import { useMemo } from 'react';
import { useEntryStore } from '@/store/entryStore';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useAuthContext } from '@/hooks/useAuthContext';
import { getDogDisplayName } from '@/types/dog-types';
import { entryIsScored } from '@/utils/entryPredicates';

export interface MyClassEntry {
  entryId: string;
  dogId: string;
  dogName: string;
  armband: string;
  runOrder: number;
  position: number;
  dogsAhead: number;
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
  isAfterClass: boolean;
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

    const sorted = [...classEntries].sort((a, b) => {
      const ra = a.registrationData.runOrder ?? 0;
      const rb = b.registrationData.runOrder ?? 0;
      if (ra === 0 && rb === 0) return 0;
      if (ra === 0) return 1;
      if (rb === 0) return -1;
      return ra - rb;
    });

    // Build position map once (O(N)) rather than calling findIndex per entry (O(N²)).
    const positionByEntryId = new Map(sorted.map((e, i) => [e.id, i + 1]));

    const aheadCountByRunOrder = new Map<number, number>();
    for (const e of classEntries) {
      const ro = e.registrationData.runOrder ?? 0;
      if (ro > 0 && !entryIsScored(e)) {
        aheadCountByRunOrder.set(ro, (aheadCountByRunOrder.get(ro) ?? 0) + 1);
      }
    }

    const myEntries: MyClassEntry[] = [];

    for (const entry of classEntries) {
      if (!myDogIds.has(entry.dogId)) continue;

      const runOrder = entry.registrationData.runOrder ?? 0;
      const position = runOrder > 0 ? (positionByEntryId.get(entry.id) ?? 0) : 0;
      const dogsAhead =
        runOrder > 0
          ? Array.from(aheadCountByRunOrder.entries())
              .filter(([ro]) => ro < runOrder)
              .reduce((sum, [, count]) => sum + count, 0)
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
                ...(compData.time != null ? { time: compData.time } : {}),
                ...(compData.placement ? { placement: parseInt(compData.placement, 10) } : {}),
                ...(compData.faults != null ? { faults: compData.faults } : {}),
              },
            }
          : {}),
      });
    }

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
