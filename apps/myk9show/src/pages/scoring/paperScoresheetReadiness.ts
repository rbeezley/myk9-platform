import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { hasShowEntriesSynced } from '@/services/replication/entriesShowSyncState';
import {
  ShowEntriesNotSyncedError,
  requireShowEntriesSynced,
} from '@/services/database/entries/requireShowEntriesSynced';

/**
 * Is the replica's list of this class's dogs whole (MYK9-1130)?
 *
 * The paper scoresheet lists a class from the local entries replica, which
 * replicates per SHOW and which the app-wide sync never fills (an empty scope
 * is a no-op). A direct cold visit therefore read an empty, never-synced
 * replica and committed it as "0 of 0 scored". "Whole" means the show's
 * entries scope has completed a sync here, never "rows present" (MYK9-746).
 *
 * `refresh` (the page's own load and its Try again) gives a cold online device
 * the bounded show sync first. A reload driven by a replica change must not:
 * a sync that writes rows and then fails would notify, reload and sync again.
 * Throws `ShowEntriesNotSyncedError`, which the page shows with Try again.
 */
export async function requireClassEntriesWhole(
  trialId: string | undefined,
  { refresh }: { refresh: boolean }
): Promise<void> {
  const trial = trialId ? await replicatedTrialsTable.getTrialById(trialId) : null;
  const showId = trial?.showId;
  // A class whose trial is not on this device cannot name the show to check.
  if (!showId) throw new ShowEntriesNotSyncedError();
  if (refresh) await requireShowEntriesSynced(showId);
  else if (!(await hasShowEntriesSynced(showId))) throw new ShowEntriesNotSyncedError();
}

/**
 * When the class's show has a sync still running, settles once it has (true);
 * otherwise false at once. Starts nothing.
 *
 * The bounded refresh stops waiting after its deadline while the sync runs
 * on. Its rows notify before it records the scope as synced, and recording
 * that notifies nobody, so a page left on "not finished loading" rechecks
 * from here rather than waiting for a change that never comes.
 */
export async function whenClassShowSyncSettles(trialId: string | undefined): Promise<boolean> {
  const trial = trialId ? await replicatedTrialsTable.getTrialById(trialId) : null;
  const running = trial?.showId ? replicatedEntriesTable.whenShowSyncSettles(trial.showId) : null;
  if (!running) return false;
  await running;
  return true;
}
