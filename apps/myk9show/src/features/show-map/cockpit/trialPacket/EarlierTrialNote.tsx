import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { buildClassEntryBreakdowns } from '@/features/entry-operations/classEntryBreakdown';
import { useShowClassRows } from '@/hooks/queries/useShowClassRows';
import { getEntriesByShowFromReplication } from '@/services/database/entries';
import type { DbClass, DbTrial } from '@/types/database-mappings';

import { findUnfinishedEarlierTrial } from './earlierTrialUnfinished';

/**
 * A later trial printed before the one ahead of it on the same day is done (MYK9-2075): move-ups
 * may still change who is in its classes. A note beside a working Print button, never a block.
 * Reads every trial's classes and the show's entry counts from the replica, so it works offline;
 * nothing shows until the classes load. Without entry counts no class is called empty.
 */
export function EarlierTrialNote({
  showId,
  trialId,
  trials,
}: {
  showId: string;
  trialId: string;
  trials: readonly DbTrial[];
}) {
  const allClasses = useShowClassRows({
    showId,
    trialId: 'all',
    trialIds: trials.map(trial => trial.id),
  });
  const entries = useQuery({
    queryKey: ['earlier-trial-note', 'entry-counts', showId],
    queryFn: async () => {
      const { data, error } = await getEntriesByShowFromReplication(showId);
      if (error) throw error;
      return data ?? [];
    },
    networkMode: 'always',
  });
  const counts = useMemo(() => {
    if (!entries.data) return undefined;
    return new Map(
      [...buildClassEntryBreakdowns(entries.data)].map(
        ([classId, count]) => [classId, count.entered + count.pending] as const
      )
    );
  }, [entries.data]);
  const earlier = allClasses.data
    ? findUnfinishedEarlierTrial({
        trialId,
        trials,
        classes: allClasses.data as DbClass[],
        entryCountByClassId: counts,
      })
    : null;
  if (!earlier) return null;
  return (
    <p role="status" className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
      {earlier.label} isn&apos;t finished. Move-ups may change these sheets.
    </p>
  );
}
