import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { replicatedArmbandsTable, replicatedEntriesTable } from '@/services/replication';
import { buildShowArmbandMaps } from '@/features/_shared/entryArmband';
import { formatAtShowTrialHeading } from './atShowTrialHeading';
import { useAtShowClassList } from './useAtShowClassList';
import { buildStaffDogs, type StaffDog, type StaffDogClassInfo } from './staffDogIndex';

export interface UseAtShowStaffDogsResult {
  dogs: StaffDog[];
  showName: string;
  isLoading: boolean;
  /** The entry read failed; `dogs` is the last good read, possibly empty. */
  loadFailed: boolean;
  onRetry: () => void;
}

/**
 * Every dog in the show, grouped from the replicated entries (offline-first;
 * no direct Supabase read). The caller gates this to staff roles.
 */
export function useAtShowStaffDogs(showId: string | undefined): UseAtShowStaffDogsResult {
  const queryClient = useQueryClient();
  const classList = useAtShowClassList(showId);

  useEffect(() => {
    if (!showId) return;
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ['at-show', 'staff-dogs', showId] });
    };
    const unsubscribeEntries = replicatedEntriesTable.subscribe(invalidate);
    const unsubscribeArmbands = replicatedArmbandsTable.subscribe(invalidate);
    return () => {
      unsubscribeEntries();
      unsubscribeArmbands();
    };
  }, [showId, queryClient]);

  const entriesQuery = useQuery({
    queryKey: ['at-show', 'staff-dogs', showId],
    queryFn: async () => {
      const [entries, armbands] = await Promise.all([
        replicatedEntriesTable.getEntriesByShow(showId as string),
        replicatedArmbandsTable.getByShow(showId as string),
      ]);
      return { entries, armbandMaps: buildShowArmbandMaps(armbands) };
    },
    enabled: !!showId,
    // Reads IndexedDB; the default "online" mode would pause it offline (MYK9-200).
    networkMode: 'always',
  });

  const classesById = useMemo(() => {
    const map = new Map<string, StaffDogClassInfo>();
    for (const group of classList.groups) {
      const trialLabel = formatAtShowTrialHeading(group.trial);
      for (const cls of group.classes) {
        map.set(cls.id, {
          className: cls.class_name,
          classId: cls.id,
          resultsReleasedAt: cls.results_released_at ?? null,
          trialLabel,
        });
      }
    }
    return map;
  }, [classList.groups]);

  const dogs = useMemo(
    () =>
      entriesQuery.data
        ? buildStaffDogs(entriesQuery.data.entries, classesById, entriesQuery.data.armbandMaps)
        : [],
    [entriesQuery.data, classesById]
  );

  return {
    dogs,
    showName: classList.showName,
    isLoading: entriesQuery.isLoading || classList.isLoading,
    loadFailed: entriesQuery.isError,
    onRetry: () => void entriesQuery.refetch(),
  };
}
