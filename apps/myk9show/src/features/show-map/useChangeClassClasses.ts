import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryClient';

import { replicatedClassesTable, replicatedTrialsTable } from '@/services/replication';
import type { BuildShowMapTreeInput } from './showMapTypes';

type ChangeClassClass = BuildShowMapTreeInput['classes'][number];

/**
 * The show's classes in the shape the Change class pieces read (`ShowMapClassInput`),
 * straight from the replicated trials and classes, for surfaces that have no Show Map
 * tree (the entry form). Same fields the Overview's class list carries for targets:
 * element, level, section, status and the trial's date and number.
 */
export function useChangeClassClasses(showId: string): ChangeClassClass[] | undefined {
  const queryClient = useQueryClient();
  // Another device starting or completing a class reaches the replica, not this query: re-read
  // on every replicated class change while mounted (as `useShowClassRows` does).
  useEffect(() => {
    if (!showId) return;
    return replicatedClassesTable.subscribe(
      () => void queryClient.invalidateQueries({ queryKey: queryKeys.showClasses(showId) }),
      { emitCurrent: false }
    );
  }, [queryClient, showId]);

  const { data } = useQuery({
    queryKey: [...queryKeys.showClasses(showId), 'change-class'],
    enabled: Boolean(showId),
    // Class status moves during a show; re-read on mount rather than serve a stale "not started".
    staleTime: 0,
    // Replica-only read: the default 'online' mode would park an offline device with no data.
    networkMode: 'always',
    queryFn: async (): Promise<ChangeClassClass[]> => {
      const trials = await replicatedTrialsTable.getTrialsByShow(showId);
      const perTrial = await Promise.all(
        trials.map(async trial => {
          const rows = await replicatedClassesTable.getClassesByTrial(trial.id);
          return rows
            .filter(cls => !cls.deletedAt)
            .map((cls): ChangeClassClass => ({
              id: cls.id,
              trialId: trial.id,
              name: cls.name,
              ...(cls.element && { element: cls.element }),
              ...(cls.level && { level: cls.level }),
              ...(cls.section && { section: cls.section }),
              ...(cls.classStatus && { status: cls.classStatus }),
              trialDate: trial.date,
              ...(trial.trialNumber && { trialNumber: trial.trialNumber }),
              trialName: trial.name,
            }));
        })
      );
      return perTrial.flat();
    },
  });
  return data;
}
