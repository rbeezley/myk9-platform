import { useMemo } from 'react';
import { useEntryStore } from '@/store/entryStore';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useAuthContext } from '@/hooks/useAuthContext';
import { getDogDisplayName } from '@/types/dog-types';
import { dogsAheadInClass } from '@/utils/showEntryRunQueue';
import { dbSecondsToInputFormat } from '@/utils/scoringMappings';
import { selectOwnedDogIds } from '@/utils/dogOwnership';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';

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

export function useMyEntriesInClass(
  classId: string | undefined,
  /**
   * Released results read directly from `view_public_entry_results` (see
   * `useClassReleasedResults`). When provided, scoring/result values are
   * sourced from these rows instead of the replication store, which is cold
   * or stale for a post-show exhibitor/guest. Run-order/position (pre-class
   * info) still come from the replication store.
   */
  releasedRows?: RawEntryRow[]
): UseMyEntriesInClassResult {
  const { userWithRoles } = useAuthContext();
  const allEntries = useEntryStore(s => s.entries);
  const { dogs } = useDogStoreCompat();

  const databaseUserId = userWithRoles?.databaseUserId;

  return useMemo(() => {
    if (!classId || !databaseUserId) return { myEntries: [], isAfterClass: false };

    const releasedById = new Map((releasedRows ?? []).map(r => [r.id, r]));

    const myDogIds = selectOwnedDogIds(dogs, databaseUserId);
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

    // Build the result shape from a directly-read released row.
    const releasedResult = (r: RawEntryRow): NonNullable<MyClassEntry['result']> => {
      const time = dbSecondsToInputFormat(r.search_time_seconds);
      return {
        qualified: r.result_status === 'qualified',
        ...(time ? { time } : {}),
        ...(r.final_placement != null ? { placement: r.final_placement } : {}),
        ...(r.total_faults != null ? { faults: r.total_faults } : {}),
      };
    };

    const myEntries: MyClassEntry[] = [];
    const seenEntryIds = new Set<string>();

    for (const entry of classEntries) {
      if (!myDogIds.has(entry.dogId)) continue;
      seenEntryIds.add(entry.id);

      const runOrder = entry.registrationData.runOrder ?? 0;
      const position = runOrder > 0 ? (positionByEntryId.get(entry.id) ?? 0) : 0;
      // Shared run queue (see utils/showEntryRunQueue): the in-ring dog is
      // excluded, so this matches the entry-list pill and the push notification.
      const dogsAhead = dogsAheadInClass(classEntries, entry.id) ?? 0;

      // Prefer released results (direct read) over the replication store: the
      // store is stale for a post-show exhibitor whose entries were scored
      // at-show after their last sync.
      const released = releasedById.get(entry.id);
      const compData = entry.competitionData;

      if (released?.is_scored) {
        myEntries.push({
          entryId: entry.id,
          dogId: entry.dogId,
          dogName: dogNameMap.get(entry.dogId) ?? 'Unknown Dog',
          armband: entry.registrationData.armband ?? released.armband ?? '',
          runOrder,
          position,
          dogsAhead,
          hasResult: true,
          result: releasedResult(released),
        });
        continue;
      }

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

    // Cold-store fallback: when the replication store has no entries for this
    // class (post-show exhibitor / guest who never synced this show), synthesize
    // "my entries" directly from the released rows by matching dog ownership.
    // Run-order/position are irrelevant post-release, so they default to 0.
    for (const released of releasedRows ?? []) {
      if (!released.is_scored) continue;
      if (seenEntryIds.has(released.id)) continue;
      if (!released.dog_id || !myDogIds.has(released.dog_id)) continue;
      seenEntryIds.add(released.id);

      myEntries.push({
        entryId: released.id,
        dogId: released.dog_id,
        dogName:
          dogNameMap.get(released.dog_id) ??
          released.dog?.call_name ??
          released.dog?.name ??
          'Unknown Dog',
        armband: released.armband ?? '',
        runOrder: 0,
        position: 0,
        dogsAhead: 0,
        hasResult: true,
        result: releasedResult(released),
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
  }, [classId, databaseUserId, allEntries, dogs, releasedRows]);
}
