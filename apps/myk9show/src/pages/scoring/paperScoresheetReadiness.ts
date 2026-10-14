import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
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
  { refresh }: { refresh: boolean | (() => boolean) }
): Promise<void> {
  const trial = trialId ? await replicatedTrialsTable.getTrialById(trialId) : null;
  const showId = trial?.showId;
  // A class whose trial is not on this device cannot name the show to check.
  if (!showId) throw new ShowEntriesNotSyncedError();
  // A function is asked only once the show is known, so a caller can spend a
  // one-time sync allowance only on a load that can use it.
  if (typeof refresh === 'function' ? refresh() : refresh) await requireShowEntriesSynced(showId);
  else if (!(await hasShowEntriesSynced(showId))) throw new ShowEntriesNotSyncedError();
}

/**
 * Settles once the class's show entries sync has finished (true), or answers
 * at once: false when no sync ran and the scope is not synced. Starts nothing.
 *
 * The bounded refresh stops waiting after its deadline while the sync runs
 * on. Its rows notify before it records the scope as synced, and recording
 * that notifies nobody, so a page left on "not finished loading" rechecks
 * from here rather than waiting for a change that never comes. A sync that
 * finished while the trial was being looked up has already left the running
 * set, so the completed scope metadata (account-aware) answers for it
 * (MYK9-1136).
 */
export async function whenClassShowSyncSettles(trialId: string | undefined): Promise<boolean> {
  const trial = trialId ? await replicatedTrialsTable.getTrialById(trialId) : null;
  const showId = trial?.showId;
  if (!showId) return false;
  const running = replicatedEntriesTable.whenShowSyncSettles(showId);
  if (running) {
    await running;
    return true;
  }
  return hasShowEntriesSynced(showId);
}

/** The scope the app-wide replication sync gives `classes` (ReplicationSyncProvider). */
const APP_WIDE_CLASSES_SCOPE = '';

/**
 * Has the app-wide classes sync completed on this device (MYK9-1130)?
 *
 * A class missing from a classes replica that never synced is "not loaded
 * yet", not "not found": a wiped device read the empty replica and committed
 * "Class not found" seconds before the class arrived. Same discriminator as
 * the entries scope: only a completed sync records the scope's `totalRows`
 * (`projectScopedMetadata` drops it for a scope that never synced). A failed
 * metadata read cannot prove the class absent, so it answers false.
 */
export async function hasClassesReplicaSynced(): Promise<boolean> {
  try {
    const metadata = await replicatedClassesTable.getSyncMetadataOrThrow(APP_WIDE_CLASSES_SCOPE);
    return metadata?.totalRows !== undefined;
  } catch {
    return false;
  }
}
