/**
 * The show's entry-window timezone, read from the trials that are actually
 * loaded, plus whether that read has finished (MYK9-642, review rounds 1-2).
 *
 * TWO facts, because collapsing them is the bug. `useShowStore`'s replication
 * mapper sets `trials: []` unconditionally ("Local-only: managed by trialStore")
 * and nothing ever fills it, so `getEntryWindowTimezone(show.trials)` was always
 * the `America/New_York` fallback. Reading the trial store instead fixes that —
 * but "not loaded yet" and "no trials" both still resolve to the same fallback
 * string, and the wizard can mount straight onto the Payment step with a Submit
 * button (`useWizardDraftRehydration`: a reload, or the return from a cancelled
 * Stripe checkout) while `loadTrials()` is still reading IndexedDB.
 *
 * The day-of-show rule reads "today" in this zone and `submit_show_entries`
 * reads it in the show's real first-trial zone, so during that window the client
 * can quote a tier the server will not charge — and `submitOfflineLateEntry`
 * writes `entry_fee` and `is_day_of_show` straight through replication with no
 * server to correct it. Callers must treat `isReady === false` as "we do not
 * know yet", never as Eastern.
 *
 * `trialsReadStatus` is the same signal `WorkflowStepContent` already uses to
 * refuse a mid-hydration trial row, for the same reason: no marker is better
 * than a wrong one.
 */

import { useTrialStore } from '@/store/trialStore';
import { getEntryWindowTimezone, type EntryWindowTrial } from '@/utils/entryWindowDate';
import type { Trial } from '@/store/trial-store-types';

export interface EntryWindowTimezone {
  /**
   * The resolved IANA zone. Always a usable string — it is the documented
   * fallback while `isReady` is false, which is exactly why `isReady` exists.
   */
  timeZone: string;
  /** False while the trial read is idle/loading/failed: the zone is a guess. */
  isReady: boolean;
}

function resolveZone(trials: readonly Trial[] | undefined, showId: string | undefined): string {
  if (!showId) return getEntryWindowTimezone(undefined);
  const showTrials: EntryWindowTrial[] = (trials ?? [])
    .filter(trial => trial.showId === showId)
    .map(trial => ({ id: trial.id, date: trial.trialDate, timezone: trial.timezone }));
  return getEntryWindowTimezone(showTrials);
}

export function useEntryWindowTimezone(showId: string | undefined): EntryWindowTimezone {
  // Resolved INSIDE the selector so the subscription's value is a string.
  // Trials replicate globally (the provider mounts with no `syncScopeId`), and
  // every merge sets a fresh array identity, so subscribing to `state.trials`
  // re-rendered the whole wizard on any trial change anywhere.
  const timeZone = useTrialStore(state => resolveZone(state.trials, showId));
  const isReady = useTrialStore(state => state.trialsReadStatus === 'ready');

  return { timeZone, isReady };
}
