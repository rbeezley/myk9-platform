import type { Trial } from '@/store/trial-store-types';
import type { Show } from '@/types/show-types';
import { getEntryWindowTimezone, type EntryWindowTrial } from './entryWindowDate';

/**
 * Stamp each show with its entry-window zone from the trial store (MYK9-714).
 *
 * Store shows carry no `trials` (MYK9-676), so `getEntryStatus` on Browse
 * judged every label in the America/New_York fallback. The zone is the SAME
 * first-trial rule `useEntryWindowTimezone` and `submit_show_entries` use
 * (`getEntryWindowTimezone`, which reads through `getTrialTimezone`).
 *
 * A show with no trial in the store is returned untouched: that is "not
 * loaded", not "no zone", and `getEntryStatus` keeps its documented fallback.
 */
export function withEntryWindowTimeZones<T extends Show>(
  shows: readonly T[],
  trials: readonly Trial[]
): T[] {
  if (trials.length === 0) return [...shows];

  const trialsByShow = new Map<string, EntryWindowTrial[]>();
  for (const trial of trials) {
    const list = trialsByShow.get(trial.showId) ?? [];
    list.push({ id: trial.id, date: trial.trialDate, timezone: trial.timezone });
    trialsByShow.set(trial.showId, list);
  }

  return shows.map(show => {
    const showTrials = trialsByShow.get(show.id);
    if (!showTrials) return show;
    return { ...show, entryWindowTimeZone: getEntryWindowTimezone(showTrials) };
  });
}
