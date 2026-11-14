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
 * The show's replicated entries and classes, re-read when either table changes. One query
 * behind the ring-conflict labels and the paper/stale claims, so both read the same rows.
 */
export function useShowRingRows(showId: string | undefined, enabled: boolean) {
  const queryClient = useQueryClient();

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
        // MYK9-1970: the class row this device holds says it is judged on paper.
        onPaper: cls.scoresOnPaper === true,
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

  return query;
}

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
  const leadDogs = useNotificationStore(s => s.preferences.leadDogs);
  const query = useShowRingRows(showId, !!showId && ownEntryIds.size > 0);

  return useMemo(() => {
    // A failed read leaves no badges, not a claim of no conflicts: the entry
    // list these decorate reads the same tables and shows its own error (MYK9-774).
    if (!query.data || ownEntryIds.size === 0) return EMPTY_CONFLICTS;
    return detectMyRingConflicts({
      entries: query.data.entries,
      classes: query.data.classes,
      ownEntryIds,
      leadDogs,
    });
  }, [query.data, ownEntryIds, leadDogs]);
}
