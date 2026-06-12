import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  replicatedClassesTable,
  replicatedEntriesTable,
  replicatedTrialsTable,
} from '@/services/replication';
import { useNotificationStore } from '@/store/notificationStore';
import { buildClassName } from './atShowClassListAdapter';
import { detectMyRingConflicts, type RingConflictClass } from './ringConflicts';

const EMPTY_CONFLICTS: ReadonlyMap<string, string> = new Map();

/**
 * Show-wide ring-conflict labels for the signed-in exhibitor's entries.
 * Replication-backed (offline-safe): one entries-by-show scan + the show's
 * classes, re-read when the replicated tables change. Returns entryId → label
 * for the entry-list conflict chip; empty map when nothing collides.
 */
export function useMyRingConflicts(
  showId: string | undefined,
  ownEntryIds: ReadonlySet<string>
): ReadonlyMap<string, string> {
  const queryClient = useQueryClient();
  const leadDogs = useNotificationStore(s => s.preferences.leadDogs);
  const enabled = !!showId && ownEntryIds.size > 0;

  const query = useQuery({
    queryKey: ['at-show', 'ring-conflict-rows', showId],
    queryFn: async () => {
      const [entries, trials] = await Promise.all([
        replicatedEntriesTable.getEntriesByShow(showId as string),
        replicatedTrialsTable.getTrialsByShow(showId as string),
      ]);
      const classGroups = await Promise.all(
        trials.map(trial => replicatedClassesTable.getClassesByTrial(trial.id))
      );
      const classes: RingConflictClass[] = classGroups.flat().map(cls => ({
        classId: cls.id,
        className: buildClassName(cls),
        inProgress: cls.classStatus === 'in_progress',
      }));
      return { entries, classes };
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

  return useMemo(() => {
    if (!query.data || ownEntryIds.size === 0) return EMPTY_CONFLICTS;
    return detectMyRingConflicts({
      entries: query.data.entries,
      classes: query.data.classes,
      ownEntryIds,
      leadDogs,
    });
  }, [query.data, ownEntryIds, leadDogs]);
}
