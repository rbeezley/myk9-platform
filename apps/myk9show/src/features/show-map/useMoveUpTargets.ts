import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { getClassesWithCapacity } from '@/services/database/day-of-operations';
import { buildMoveUpTargets } from './buildMoveUpTargets';
import type { ShowMapMoveUpTarget } from './ShowMapMoveUpDialog';
import type { BuildShowMapTreeInput } from './showMapTypes';
import type { RegistryId } from '@/features/registries';

/**
 * Move-up targets for the Show Map / Show Desk dialog, with the same capacity
 * rule the Entries Management approve dialog applies (MYK9-920). Seat counts
 * come from the replication-backed `getClassesWithCapacity`, read only while
 * the dialog is open. If that read fails the targets still render (capacity is
 * advisory here); `moveUpShowMapEntry` refuses a full class on write.
 */
export function useMoveUpTargets(
  showId: string,
  classes: BuildShowMapTreeInput['classes'],
  currentClassId: string | undefined,
  registryId: RegistryId
): ShowMapMoveUpTarget[] {
  const { data } = useQuery({
    queryKey: ['show-map', 'move-up-capacity', showId, currentClassId],
    enabled: Boolean(currentClassId),
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      const result = await getClassesWithCapacity(showId);
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  });

  return useMemo(() => {
    const spots = data ? new Map(data.map(cls => [cls.id, cls.available_spots])) : undefined;
    return buildMoveUpTargets(classes, currentClassId, registryId, spots);
  }, [classes, currentClassId, registryId, data]);
}
