import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { replicatedClassesTable, replicatedEntriesTable } from '@/services/replication';
import { getClassesWithCapacity } from '@/services/database/day-of-operations';
import { buildMoveUpTargets } from './buildMoveUpTargets';
import type { ShowMapMoveUpTarget } from './ShowMapMoveUpDialog';
import type { BuildShowMapTreeInput } from './showMapTypes';
import type { RegistryId } from '@/features/registries';

export type MoveUpCapacityState = 'loading' | 'ready' | 'unavailable';

/**
 * Move-up targets for the Show Map / Show Desk dialog, with the same capacity
 * rule the Entries Management approve dialog applies (MYK9-920). Seat counts
 * come from the replication-backed `getClassesWithCapacity`, read only while
 * the dialog is open. Capacity is advisory: `capacityState` lets the dialog say
 * so while it loads or when the read failed, and `moveUpShowMapEntry` refuses a
 * full class on write either way.
 */
export function useMoveUpTargets(
  showId: string,
  classes: BuildShowMapTreeInput['classes'],
  currentClassId: string | undefined,
  registryId: RegistryId
): {
  targets: ShowMapMoveUpTarget[];
  capacityState: MoveUpCapacityState;
  /** Data is from an earlier read because the latest refresh failed. */
  capacityIsStale: boolean;
} {
  const { data, isError, refetch } = useQuery({
    queryKey: ['show-map', 'move-up-capacity', showId, currentClassId],
    enabled: Boolean(currentClassId),
    staleTime: 0,
    gcTime: 0,
    // Replica-only read: the default 'online' mode parks an offline device at
    // fetchStatus 'paused' with no data, which would offer full classes on show day.
    networkMode: 'always',
    queryFn: async () => {
      const result = await getClassesWithCapacity(showId);
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  });

  // Refresh from the replica itself, not from query-key invalidation: entry
  // mutations and realtime sync write the entries/classes replicas but do not
  // reliably invalidate any key this hook could name. While the dialog is open,
  // any change to either table re-reads capacity, so a freed seat appears.
  const isOpen = Boolean(currentClassId);
  useEffect(() => {
    if (!isOpen) return;
    const refresh = () => void refetch();
    const stops = [
      replicatedEntriesTable.subscribe(refresh, { emitCurrent: false }),
      replicatedClassesTable.subscribe(refresh, { emitCurrent: false }),
    ];
    return () => stops.forEach(stop => stop());
  }, [isOpen, refetch]);

  const targets = useMemo(() => {
    const spots = data ? new Map(data.map(cls => [cls.id, cls.available_spots])) : undefined;
    return buildMoveUpTargets(classes, currentClassId, registryId, spots);
  }, [classes, currentClassId, registryId, data]);

  // From query status, explicitly: a failed refetch keeps the old data but is
  // still 'unavailable', never 'ready'.
  const capacityState: MoveUpCapacityState = isError ? 'unavailable' : data ? 'ready' : 'loading';
  return { targets, capacityState, capacityIsStale: isError && data !== undefined };
}
