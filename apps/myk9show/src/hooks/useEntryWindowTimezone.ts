/**
 * The show's entry-window timezone, and whether we actually KNOW it
 * (MYK9-642, review rounds 1-3).
 *
 * THREE facts, because every collapse of them has been a money bug:
 *
 *   J-F1 — `useShowStore`'s mapper sets `trials: []` unconditionally and
 *   nothing ever fills it, so `getEntryWindowTimezone(show.trials)` was always
 *   the `America/New_York` fallback. Read the trial store instead.
 *
 *   L-F1 — "the trial read has not finished" and "this show has no trials" both
 *   still resolve to that fallback, and the wizard can mount straight onto the
 *   Payment step with a Submit button (`useWizardDraftRehydration`: a reload, or
 *   the return from a cancelled Stripe checkout). So readiness is its own fact.
 *
 *   N-F2 — `trialsReadStatus` flips to 'ready' when the LOCAL IndexedDB read
 *   returns, including when it returns zero rows; the network download runs
 *   after that. A cold or lagging replica therefore reported "ready" with the
 *   fallback zone — L-F1 again, one level down. Readiness now means: the local
 *   read finished AND either this show's trials are actually here, or the
 *   replication sync for `trials` has completed (so "no trials" is a fact about
 *   the show rather than about the device).
 *
 *   N-F3 — a failed read is not a wait. `isUnavailable` separates "we cannot
 *   read this" from "we are still reading", exactly as `capacityUnavailable`
 *   does for class availability in `proceedGating`, so the UI never tells
 *   someone at a desk to wait for something that will not arrive.
 *
 * Why it matters: the day-of-show fee tier is decided in this zone and
 * `submit_show_entries` decides it in the show's real first-trial zone, so a
 * wrong zone quotes a tier the server will not charge — and
 * `submitOfflineLateEntry` writes `entry_fee` and `is_day_of_show` straight
 * through replication with no server to correct it.
 *
 * `trialsReadStatus` is the same signal `WorkflowStepContent` uses to refuse a
 * mid-hydration trial row, for the reason it states: no marker is better than a
 * wrong one.
 *
 * What `tablesStatus.trials` does and does NOT mean (MYK9-679):
 *
 *   'success'  the most recent download of `trials` finished. Not "has ever
 *              finished": see 'syncing'.
 *   'syncing'  a download is running. Every full sync (autosync, reconnect)
 *              resets EVERY table to 'syncing' first, so this is re-entered
 *              after 'success' routinely. It says nothing about whether a
 *              download already landed; the hook latches that itself
 *              (`trialsSyncedOnce`), so readiness does not flap false on each
 *              autosync for a show with no trials (P-F4).
 *   'idle'     no download has finished and none is running. `triggerSync`
 *              returns early while offline WITHOUT touching this, and an
 *              aborted sync lands here too, so 'idle' can last indefinitely.
 *              Offline with nothing cached is therefore reported as
 *              `isUnavailable`, not as a wait that cannot end (P-F3).
 *   'error'    the last download failed.
 */

import { useContext, useState } from 'react';
import { useTrialStore } from '@/store/trialStore';
import { ReplicationSyncContext } from '@/context/ReplicationSyncContext';
import { NetworkStatusContext } from '@/hooks/useNetworkStatus';
import { getEntryWindowTimezone, type EntryWindowTrial } from '@/utils/entryWindowDate';
import type { Trial } from '@/store/trial-store-types';

export interface EntryWindowTimezone {
  /**
   * The resolved IANA zone. Always a usable string — it is the documented
   * fallback while `isReady` is false, which is exactly why `isReady` exists.
   * Never price an entry from it unless `isReady`.
   */
  timeZone: string;
  /** The zone is known: trust it for the fee tier and the registry bucket. */
  isReady: boolean;
  /**
   * The zone could not be read at all, as opposed to not being read YET.
   * Callers must say so rather than asking the user to keep waiting.
   */
  isUnavailable: boolean;
}

function trialsForShow(
  trials: readonly Trial[] | undefined,
  showId: string | undefined
): EntryWindowTrial[] {
  if (!showId) return [];
  return (trials ?? [])
    .filter(trial => trial.showId === showId)
    .map(trial => ({ id: trial.id, date: trial.trialDate, timezone: trial.timezone }));
}

function resolveZone(trials: readonly Trial[] | undefined, showId: string | undefined): string {
  if (!showId) return getEntryWindowTimezone(undefined);
  return getEntryWindowTimezone(trialsForShow(trials, showId));
}

export function useEntryWindowTimezone(showId: string | undefined): EntryWindowTimezone {
  // Resolved INSIDE the selectors so every subscription value is a primitive.
  // Trials replicate globally (the provider mounts with no `syncScopeId`) and
  // every merge sets a fresh array identity, so subscribing to `state.trials`
  // re-rendered the whole wizard on any trial change anywhere (L-F5).
  const timeZone = useTrialStore(state => resolveZone(state.trials, showId));
  const hasShowTrials = useTrialStore(state => trialsForShow(state.trials, showId).length > 0);
  const readStatus = useTrialStore(state => state.trialsReadStatus);

  // Read through the context rather than `useReplicationSync`, which throws
  // without a provider: this hook is called from components whose tests mount
  // them bare, and "no provider" is simply "no completion signal" — which the
  // rule below already treats as not-settled.
  const syncContext = useContext(ReplicationSyncContext);
  const trialsSyncStatus = syncContext?.status.tablesStatus.trials;

  // Same fallback rule: no provider means the browser's own flag.
  const networkContext = useContext(NetworkStatusContext);
  const isOnline = networkContext?.isOnline ?? navigator.onLine;

  // Latched per mount: once `trials` has downloaded, a later 'syncing' (every
  // autosync re-enters it) does not un-know the answer. State adjusted during
  // render rather than a ref, which the React compiler lint forbids reading
  // in render; the guard makes it settle in one extra pass.
  const [trialsSyncedOnce, setTrialsSyncedOnce] = useState(false);
  if (trialsSyncStatus === 'success' && !trialsSyncedOnce) setTrialsSyncedOnce(true);

  const localReadFinished = readStatus === 'ready';
  const syncSettled = trialsSyncedOnce || trialsSyncStatus === 'success';
  // A trial for THIS show in hand beats every other signal: the zone is real,
  // whatever a later refresh did.
  const isReady = hasShowTrials || (localReadFinished && syncSettled);
  // Offline, after the local read came back without this show's trials, no
  // download can run: that is a terminal state until the connection returns.
  const offlineWithNothingCached = !isOnline && localReadFinished;
  const isUnavailable =
    !isReady &&
    (readStatus === 'error' || trialsSyncStatus === 'error' || offlineWithNothingCached);

  return { timeZone, isReady, isUnavailable };
}
