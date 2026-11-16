import { useShowClassRows } from '@/hooks/queries/useShowClassRows';
import type { DbClass, DbTrial } from '@/types/database-mappings';

import { findUnfinishedEarlierTrial } from './earlierTrialUnfinished';

/**
 * A later trial printed before the one ahead of it on the same day is done (MYK9-2075): move-ups
 * may still change who is in its classes. A note beside a working Print button, never a block.
 * Reads every trial's classes from the replica, so it works offline; nothing shows until they load.
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
  const earlier = allClasses.data
    ? findUnfinishedEarlierTrial({ trialId, trials, classes: allClasses.data as DbClass[] })
    : null;
  if (!earlier) return null;
  return (
    <p role="status" className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
      Trial {earlier.dayNumber} isn&apos;t finished. Move-ups may change these sheets.
    </p>
  );
}
