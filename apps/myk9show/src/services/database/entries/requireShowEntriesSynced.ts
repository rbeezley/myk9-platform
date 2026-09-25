import { onlineManager } from '@tanstack/react-query';
import { hasShowEntriesSynced } from '@/services/replication/entriesShowSyncState';
import { refreshShowEntriesForRead } from './refreshShowEntriesForRead';

/**
 * Has this show's entries scope completed a sync on this device? If not, and
 * the device is online, give the bounded show sync one chance first.
 *
 * "Loaded" means a completed show sync, never "rows present": one check-in or
 * lifecycle write on a fresh device stores exactly one row for the show
 * (MYK9-746). The refresh is skipped offline, where it can only fail or stall
 * for its full deadline.
 */
export async function ensureShowEntriesSynced(showId: string): Promise<boolean> {
  if (await hasShowEntriesSynced(showId)) return true;
  if (!onlineManager.isOnline()) return false;
  await refreshShowEntriesForRead(showId);
  return hasShowEntriesSynced(showId);
}

/** The show's entries have not completed a sync here, so no count or list from them is whole. */
export class ShowEntriesNotSyncedError extends Error {
  constructor() {
    super(
      "This show's entries have not finished loading on this device. Connect to the internet and try again."
    );
    this.name = 'ShowEntriesNotSyncedError';
  }
}

/**
 * For readers that count or list a show's entries from the local replica alone
 * (MYK9-761): throw instead of presenting a never-synced show's partial rows as
 * the whole show. Each caller already turns a throw into its existing error
 * state.
 */
export async function requireShowEntriesSynced(showId: string): Promise<void> {
  if (!(await ensureShowEntriesSynced(showId))) throw new ShowEntriesNotSyncedError();
}
