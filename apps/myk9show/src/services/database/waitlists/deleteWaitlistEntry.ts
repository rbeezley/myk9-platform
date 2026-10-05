import { supabase } from '../supabaseClient';
import { replicatedWaitlistEntriesTable } from '@/services/replication/ReplicatedWaitlistEntriesTable';

import { WaitlistEntryNotDeletedError } from './deleteWaitlistEntryErrors';

export {
  WaitlistEntryNotDeletedError,
  WAITLIST_ENTRY_CHANGED_MESSAGE,
  WAITLIST_ENTRY_GONE_MESSAGE,
} from './deleteWaitlistEntryErrors';

/**
 * Hard-delete one waitlist row, then evict it from the local replica ONLY when
 * the server confirms it deleted that row (MYK9-1000).
 *
 * PostgREST answers a DELETE that matched nothing with zero rows and no error:
 * the row is already gone, or the DELETE policy excludes it (an exhibitor may
 * delete only a 'waiting' row, so a spot offered a moment earlier matches
 * nothing). Evicting then would hide a live offer from this device, so a
 * zero-row answer throws {@link WaitlistEntryNotDeletedError} with
 * `notDeletedMessage` and leaves the replica for the next sync to settle.
 *
 * A server error is thrown as-is. A failed local eviction is swallowed: the
 * server delete succeeded, and the next full sync prunes the row.
 */
export async function deleteWaitlistEntryAndEvict(
  waitlistEntryId: string,
  notDeletedMessage: string
): Promise<void> {
  // `id` only, never '*' (LESSONS: postgrest-count-column).
  const { data, error } = await supabase
    .from('waitlist_entries')
    .delete()
    .eq('id', waitlistEntryId)
    .select('id');
  if (error) throw error;

  if (!(data ?? []).some(row => row.id === waitlistEntryId)) {
    throw new WaitlistEntryNotDeletedError(notDeletedMessage);
  }

  await replicatedWaitlistEntriesTable.delete(waitlistEntryId).catch(() => undefined);
}
