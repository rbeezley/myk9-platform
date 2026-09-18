/**
 * The show's entry-window timezone, read from the trials that are actually
 * loaded (MYK9-642 round 1, finding J-F1).
 *
 * `useShowStore`'s replication mapper sets `trials: []` unconditionally
 * (`store/showStore.ts` — "Local-only: managed by trialStore") and nothing ever
 * fills it, so `getEntryWindowTimezone(show.trials)` is always the
 * `America/New_York` fallback. The day-of-show rule reads "today" in that zone
 * and `submit_show_entries` reads it in the show's REAL first-trial zone, so on
 * a Central-time show between 23:00 CT and midnight the client called an entry
 * day-of while the server called it a pre-entry — and on the offline desk path,
 * which writes `entry_fee` and `is_day_of_show` straight through replication
 * with no server to correct it, that stored the wrong fee AND the wrong
 * registry bucket.
 *
 * `useTrialStore` is where the wizard's own class step gets its trials
 * (`ClassSelectionStep.tsx`), and its replication mapper does carry the
 * `timezone` column (`store/trial-store-helpers.ts`).
 */

import { useMemo } from 'react';
import { useTrialStore } from '@/store/trialStore';
import { getEntryWindowTimezone, type EntryWindowTrial } from '@/utils/entryWindowDate';

export function useEntryWindowTimezone(showId: string | undefined): string {
  const trials = useTrialStore(state => state.trials);

  return useMemo(() => {
    if (!showId) return getEntryWindowTimezone(undefined);
    const showTrials: EntryWindowTrial[] = (trials ?? [])
      .filter(trial => trial.showId === showId)
      .map(trial => ({ id: trial.id, date: trial.trialDate, timezone: trial.timezone }));
    // No trials loaded yet is NOT the same as a trial with no zone, but both
    // land on `getTrialTimezone`'s documented fallback. Keeping one resolver
    // means the client and `submit_show_entries` agree on the default too.
    return getEntryWindowTimezone(showTrials);
  }, [trials, showId]);
}
