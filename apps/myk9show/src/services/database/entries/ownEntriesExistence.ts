/**
 * The ONE authoritative, lightweight "does this viewer have any entry of their own" read.
 *
 * The entries replica is per show, so an empty replica is an absence of knowledge. This asks the
 * same view and predicate `getUserEntries` reads (`view_authenticated_entry_results` with
 * `is_own_entry = true`: the viewer handles the entry or owns its dog), as a head count. It names
 * a column: a `*` count returns 403 on a column-allowlisted table.
 *
 * @module services/database/entries/ownEntriesExistence
 */

import { supabase } from '../supabaseClient';

export async function serverHasOwnEntries(): Promise<boolean> {
  const { count, error } = await supabase
    .from('view_authenticated_entry_results')
    .select('id', { count: 'exact', head: true })
    .eq('is_own_entry', true);
  if (error) throw error;
  return (count ?? 0) > 0;
}
