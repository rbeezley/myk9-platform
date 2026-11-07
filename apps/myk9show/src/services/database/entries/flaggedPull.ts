import type { CheckInStatus } from '@myk9/core';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { createDatabaseError, supabase } from '../supabaseClient';

/** Who set a still-entered class to Pulled (MYK9-1753): the exhibitor, or ringside staff. */
export type FlaggedPullSource = 'exhibitor' | 'staff';

/**
 * The source of every flagged pull on a show, keyed by entry id. `check_in_pulled_by` is stamped by
 * the database on every move to Pulled, so it is right whichever device or path set the flag. It
 * lives on `entries` only (column-allowlisted for `authenticated`), not on the replicated view, so
 * this is an online side-read: offline, the desk still shows the flag, without who set it.
 */
export async function getFlaggedPullSources(
  showId: string
): Promise<Map<string, FlaggedPullSource>> {
  const { data, error } = await supabase
    .from('entries')
    .select('id, check_in_pulled_by')
    .eq('show_id', showId)
    .eq('check_in_status', 'pulled')
    .neq('entry_status', 'scratched');
  if (error) throw createDatabaseError(error, 'entries', 'get_flagged_pull_sources');

  const sources = new Map<string, FlaggedPullSource>();
  for (const row of data ?? []) {
    if (row.check_in_pulled_by === 'exhibitor' || row.check_in_pulled_by === 'staff') {
      sources.set(row.id, row.check_in_pulled_by);
    }
  }
  return sources;
}

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
