import { supabase } from '../supabaseClient';

/** A replica's zero count is not proof that its RLS-filtered feed was complete. */
export async function verifySecretaryEmptyShow(showId: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }

  const { data, error } = await supabase.rpc('get_secretary_live_entry_count', {
    p_show_id: showId,
  });
  if (error || typeof data !== 'number') {
    return false;
  }
  return data === 0;
}
