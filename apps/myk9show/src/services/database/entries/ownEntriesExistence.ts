/**
 * The ONE authoritative, lightweight "does this viewer have any entry of their own" read.
 *
 * The entries replica is per show, so an empty replica is an absence of knowledge. This asks the
 * same view and predicate `getUserEntries` reads (`view_authenticated_entry_results` with
 * `is_own_entry = true`: the viewer handles the entry or owns its dog), as a head count, minus the
 * soft-deleted rows My Shows does not list (`shouldRenderOwnEntry`; the replica check applies
 * `isLiveEntry`). It names a column: a `*` count returns 403 on a column-allowlisted table.
 *
 * @module services/database/entries/ownEntriesExistence
 */

import { supabase } from '../supabaseClient';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { selectOwnedDogIds } from '@/utils/dogOwnership';
import { filterOwnReplicaEntries } from './userEntriesRead';
import { isLiveEntry } from './reads';

export async function serverHasOwnEntries(): Promise<boolean> {
  const { count, error } = await supabase
    .from('view_authenticated_entry_results')
    .select('id', { count: 'exact', head: true })
    .eq('is_own_entry', true)
    .is('deleted_at', null);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/**
 * Whether the local entries replica holds an entry of the person's own (same rule as
 * `getUserEntries`' replica fallback). A veto only: a stale or partial replica can keep the rail
 * item, never hide it. Throws when the replica cannot be read, so doubt keeps the item.
 */
export async function localReplicaHasOwnEntry(personId: string): Promise<boolean> {
  const [entries, dogs] = await Promise.all([
    replicatedEntriesTable.getAllOrThrow(),
    replicatedDogsTable.getAllDogs(),
  ]);
  const own = filterOwnReplicaEntries(entries, selectOwnedDogIds(dogs, personId), personId);
  return own.some(isLiveEntry);
}
