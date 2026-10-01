import { supabase } from '../supabaseClient';

/**
 * True only when the server confirms, from a source that does not share the
 * shows replica's RLS read, that every given show is soft-deleted. A show the
 * caller does not manage is not reported, an error or offline read proves
 * nothing, and either reads as "not proven" so nothing is cleared.
 */
export async function verifyShowsAllDeleted(showIds: string[]): Promise<boolean> {
  if (showIds.length === 0) return true;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;

  const { data, error } = await supabase.rpc('get_manageable_show_liveness', {
    p_show_ids: showIds,
  });
  if (error || !Array.isArray(data)) return false;

  const deleted = new Set(
    data.filter(row => row.is_live === false).map(row => String(row.show_id))
  );
  return showIds.every(id => deleted.has(id));
}
