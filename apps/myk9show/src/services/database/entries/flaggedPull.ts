import type { CheckInStatus } from '@myk9/core';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { createDatabaseError, supabase } from '../supabaseClient';

/** Who set a still-entered class to Pulled (MYK9-1753): the exhibitor, or ringside staff. */
export type FlaggedPullSource = 'exhibitor' | 'staff';

/** Who flagged one entry, and the entry's write time when they had (ms since epoch). */
export interface FlaggedPullSourceRead {
  source: FlaggedPullSource;
  writtenAt: number;
}

/**
 * The source of every flagged pull on a show, keyed by entry id. `check_in_pulled_by` is stamped by
 * the database on every move to Pulled, so it is right whichever device or path set the flag. It
 * lives on `entries` only (column-allowlisted for `authenticated`), not on the replicated view, so
 * this is an online side-read: offline, the desk still shows the flag, without who set it.
 *
 * Each source carries the row's `updated_at`, so the desk can show it only for the very write it
 * describes (`sourceForFlag`): a read made before a Clear and a re-flag can never be shown as the
 * new flag's source, however it was cached.
 */
export async function getFlaggedPullSources(
  showId: string
): Promise<Map<string, FlaggedPullSourceRead>> {
  const { data, error } = await supabase
    .from('entries')
    .select('id, check_in_pulled_by, updated_at')
    .eq('show_id', showId)
    .eq('check_in_status', 'pulled')
    .neq('entry_status', 'scratched');
  if (error) throw createDatabaseError(error, 'entries', 'get_flagged_pull_sources');

  const sources = new Map<string, FlaggedPullSourceRead>();
  for (const row of data ?? []) {
    const writtenAt = row.updated_at ? Date.parse(row.updated_at) : NaN;
    if (
      (row.check_in_pulled_by === 'exhibitor' || row.check_in_pulled_by === 'staff') &&
      Number.isFinite(writtenAt)
    ) {
      sources.set(row.id, { source: row.check_in_pulled_by, writtenAt });
    }
  }
  return sources;
}

/**
 * The source to show for a flag the desk is showing, or undefined: only a read of that same write
 * (the row's write time as the desk has it) counts. Anything else, an older or newer write, says
 * nothing about this flag, so the card says "Flagged as pulled." instead of naming someone.
 */
export function sourceForFlag(
  reads: ReadonlyMap<string, FlaggedPullSourceRead>,
  entryId: string,
  writtenAt: number
): FlaggedPullSource | undefined {
  const read = reads.get(entryId);
  return read && read.writtenAt === writtenAt ? read.source : undefined;
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
