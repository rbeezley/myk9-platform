import { useCallback, useMemo } from 'react';
import { getClassIds, groupSectionedClasses } from '@myk9/ringside';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { replicatedArmbandsTable, replicatedEntriesTable } from '@/services/replication';
import { useReplicationSync } from '@/hooks/useReplicationSync';
import { hasShowEntriesSynced } from '@/services/replication/entriesShowSyncState';
import { buildShowArmbandMaps } from '@/features/_shared/entryArmband';
import { formatAtShowTrialHeading } from './atShowTrialHeading';
import { useAtShowClassList } from './useAtShowClassList';
import { syncAtShowData } from './atShowDataAdapter';
import { useAtShowShowHydration } from './useAtShowShowHydration';
import { useAtShowRealtimeRefresh } from './useAtShowRealtimeRefresh';
import { buildStaffDogs, type StaffDog, type StaffDogClassInfo } from './staffDogIndex';

export interface UseAtShowStaffDogsResult {
  dogs: StaffDog[];
  showName: string;
  isLoading: boolean;
  /**
   * False only once the first hydration has settled and this show's entries scope still has no
   * completed sync on this device (offline, never saved): the list may be partial.
   */
  isComplete: boolean;
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
  const { status: syncStatus } = useReplicationSync();

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

  // The show scope's completed-sync marker: only a finished sync proves the replica holds
  // every entry. A row count cannot (single-row writes insert into a never-synced scope).
  const syncedQuery = useQuery({
    queryKey: ['at-show', 'staff-dogs-synced', showId],
    queryFn: () => hasShowEntriesSynced(showId as string),
    enabled: !!showId,
    networkMode: 'always',
  });

  // The same freshness path as the class entry lists: hydrate on mount and after every
  // app-wide pass, and pull on show-change broadcasts and when the app returns to the
  // foreground. A forced refresh runs the canonical show sync (failures keep the
  // cached rows), then re-reads the entries and the completed-sync marker.
  const refresh = useCallback(
    async (forceSync?: boolean) => {
      if (!showId) return;
      if (forceSync) {
        try {
          await syncAtShowData(showId);
        } catch {
          /* offline: keep the cached rows */
        }
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['at-show', 'staff-dogs', showId] }),
        queryClient.invalidateQueries({ queryKey: ['at-show', 'staff-dogs-synced', showId] }),
      ]);
    },
    [showId, queryClient]
  );
  const isHydrationPending = useAtShowShowHydration(showId, syncStatus, refresh);
  const classIds = useMemo(
    () => classList.groups.flatMap(group => group.classes.map(cls => cls.id)),
    [classList.groups]
  );
  useAtShowRealtimeRefresh(showId, classIds, refresh);

  const classesById = useMemo(() => {
    const map = new Map<string, StaffDogClassInfo>();
    for (const group of classList.groups) {
      const trialLabel = formatAtShowTrialHeading(group.trial);
      const releasedById = new Map(group.classes.map(cls => [cls.id, cls.results_released_at]));
      // Group A/B pairs the way the class picker does, so a paired class links to
      // the combined list rather than one section of it.
      for (const entry of groupSectionedClasses(group.classes, classList.organization)) {
        const classIds = getClassIds(entry);
        for (const id of classIds) {
          const member = group.classes.find(cls => cls.id === id);
          map.set(id, {
            className: member?.class_name ?? entry.class_name,
            classIds,
            resultsReleasedAt: releasedById.get(id) ?? null,
            trialLabel,
          });
        }
      }
    }
    return map;
  }, [classList.groups, classList.organization]);

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
    isLoading: entriesQuery.isLoading || classList.isLoading || isHydrationPending,
    isComplete: isHydrationPending || syncedQuery.data === true,
    loadFailed: entriesQuery.isError || classList.error != null,
    onRetry: () => {
      void entriesQuery.refetch();
      classList.refresh();
    },
  };
}
