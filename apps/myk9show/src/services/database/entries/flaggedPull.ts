import type { CheckInStatus } from '@myk9/core';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { createDatabaseError, supabase } from '../supabaseClient';

/**
 * The secretary's Clear (MYK9-1753): the database puts a flagged pull back to the check-in it
 * overwrote, which only it remembers, and returns that status. Show managers only; refused once the
 * class is no longer a flagged pull (pulled for real, scored, or already changed).
 */
export async function clearFlaggedPull(entryId: string): Promise<CheckInStatus> {
  const { data, error } = await supabase.rpc('clear_flagged_pull', { p_entry_id: entryId });
  if (error) throw createDatabaseError(error, 'entries', 'clear_flagged_pull');
  // The server wrote the row, so read it back into the offline copy the desk shows (best effort;
  // the next sync brings it in otherwise).
  await replicatedEntriesTable.refreshServerChangedEntries([entryId], {
    insert: 'if-show-loaded',
    reason: 'flagged pull cleared by the server',
  });
  return data as CheckInStatus;
}
