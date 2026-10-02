import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { queryKeys } from '@/lib/queryClient';
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
): { targets: ShowMapMoveUpTarget[]; capacityState: MoveUpCapacityState } {
  const { data, isError } = useQuery({
    // Under the show's classes root so the show-map action invalidations
    // (show / showClasses) refetch it while the dialog is open.
    queryKey: [...queryKeys.showClasses(showId), 'move-up-capacity', currentClassId],
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

  const targets = useMemo(() => {
    const spots = data ? new Map(data.map(cls => [cls.id, cls.available_spots])) : undefined;
    return buildMoveUpTargets(classes, currentClassId, registryId, spots);
  }, [classes, currentClassId, registryId, data]);

  const capacityState: MoveUpCapacityState = data ? 'ready' : isError ? 'unavailable' : 'loading';
  return { targets, capacityState };
}
