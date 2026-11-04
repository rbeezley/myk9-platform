import { useQuery } from '@tanstack/react-query';

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
  const { data } = useQuery({
    queryKey: ['show-map', 'change-class-classes', showId],
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
