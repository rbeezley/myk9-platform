import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  replicatedClassesTable,
  replicatedEntriesTable,
  replicatedShowsTable,
  replicatedTrialsTable,
} from '@/services/replication';
import { buildClassName } from './atShowClassListAdapter';
import type { RingConflictClass } from './ringConflicts';

/**
 * The show's replicated entries and classes, re-read when either table changes. One query
 * behind the ring-conflict labels and the paper/stale claims, so both read the same rows.
 */
export function useShowRingRows(showId: string | undefined, enabled: boolean) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['at-show', 'ring-conflict-rows', showId],
    queryFn: async () => {
      const [entries, trials, show] = await Promise.all([
        replicatedEntriesTable.getEntriesByShow(showId as string),
        replicatedTrialsTable.getTrialsByShow(showId as string),
        replicatedShowsTable.getShowById(showId as string),
      ]);
      const classGroups = await Promise.all(
        trials.map(trial => replicatedClassesTable.getClassesByTrial(trial.id))
      );
      const classes: RingConflictClass[] = classGroups.flat().map(cls => ({
        classId: cls.id,
        className: buildClassName(cls),
        inProgress: cls.classStatus === 'in_progress',
        // MYK9-1970: the class's paper flag (null = follows the show), for the claim fallback.
        scoresOnPaper: cls.scoresOnPaper ?? null,
      }));
      return { entries, classes, usesDeviceScoring: show?.usesDeviceScoring };
    },
    enabled,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!enabled) return;
    const invalidate = () =>
      void queryClient.invalidateQueries({ queryKey: ['at-show', 'ring-conflict-rows', showId] });
    const unsubscribes = [
      replicatedEntriesTable.subscribe(invalidate),
      replicatedClassesTable.subscribe(invalidate),
    ];
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [enabled, queryClient, showId]);

  return query;
}
