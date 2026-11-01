/**
 * One `syncAtShowData` run, abortable (MYK9-1629). Mirrors the replication
 * pass (MYK9-1624): going offline aborts the run's signal, the run rejects at
 * once with an AbortError, and no further table sync starts. The table syncs
 * receive the signal, so their engine guards also stop any destructive step.
 */
import { ABORTED_SYNC_MESSAGE, abortableWait } from '@myk9/replication';
import {
  replicatedArmbandsTable,
  replicatedEntriesTable,
  replicatedClassesTable,
  replicatedTrialsTable,
} from '@/services/replication';
import { settledScopesOutcome, type AtShowSyncOutcome } from './atShowSyncOutcome';

export interface AtShowSyncRun {
  /** Rejects promptly on abort; otherwise resolves the outcome. */
  operation: Promise<AtShowSyncOutcome>;
  /** Settles only when every table sync the run started has actually finished. */
  underlyingSettled: Promise<void>;
  abort: () => void;
}

const noop = () => {};

export function startAtShowSyncRun(
  showId: string,
  forceFullSync: boolean,
  after?: Promise<unknown>
): AtShowSyncRun {
  const controller = new AbortController();
  const { signal } = controller;
  const started = new Set<Promise<unknown>>();
  const syncOptions = { signal, ...(forceFullSync ? { forceFullSync: true as const } : {}) };

  // Track the raw promise (not the abortable wrapper) so "settled" means the work ended.
  const track = <T>(work: Promise<T>): Promise<T> => {
    started.add(work);
    return work;
  };

  const operation = (async () => {
    if (after) await abortableWait(after.then(noop, noop), signal);
    const trialsResult = await abortableWait(
      track(replicatedTrialsTable.sync(showId, syncOptions)),
      signal
    );
    const showTrials = await abortableWait(replicatedTrialsTable.getTrialsByShow(showId), signal);
    if (signal.aborted) throw signal.reason;
    // allSettled, then rethrow: a scope that fails early must not settle the
    // operation (and fire the readiness signal) while another scope is still
    // writing rows (MYK9-766). An abort rejects each wait at once.
    const results = await Promise.allSettled([
      // Classes are scoped by trial_id, so hydrate only the trials that belong
      // to this show. An empty scope would fetch every visible changed class.
      ...showTrials.map(trial =>
        abortableWait(track(replicatedClassesTable.sync(trial.id, syncOptions)), signal)
      ),
      abortableWait(track(replicatedEntriesTable.sync(showId, syncOptions)), signal),
      // Armbands sync every show at once; see ReplicatedArmbandsTable.
      abortableWait(track(replicatedArmbandsTable.sync('', syncOptions)), signal),
    ]);
    if (signal.aborted) throw signal.reason;
    return settledScopesOutcome(trialsResult, results);
  })();

  const underlyingSettled = operation
    .then(noop, noop)
    .then(() => Promise.allSettled([...started]))
    .then(noop);

  return {
    operation,
    underlyingSettled,
    abort: () => controller.abort(new Error(ABORTED_SYNC_MESSAGE)),
  };
}
