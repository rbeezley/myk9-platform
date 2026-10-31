import { hasShowEntriesSynced } from '@/services/replication/entriesShowSyncState';
import { isAtShowStructureOnDevice } from './atShowClassListAdapter';

/**
 * Is every replicated scope the at-show surfaces read for this show (entries,
 * trials and each trial's classes) on this device? The one "show is fully here"
 * marker behind the entry lists' and the dog pages' not-on-device notices
 * (MYK9-1520, MYK9-1538). Unreadable metadata answers false: the safe side is
 * "not here".
 */
export async function isAtShowFullyOnDevice(showId: string): Promise<boolean> {
  try {
    return (await hasShowEntriesSynced(showId)) && (await isAtShowStructureOnDevice(showId));
  } catch {
    return false;
  }
}
