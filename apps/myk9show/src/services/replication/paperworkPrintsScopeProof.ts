import { supabase } from '@/services/database/supabaseClient';

/**
 * Proof that the show's paperwork prints are really empty, for the paperwork
 * adapter's `verifyScopeEmpty` (MYK9-2080).
 *
 * A device holding another account's print rows cannot tell, after a zero-row
 * full sync, whether the new account has nothing or RLS hid it (MYK9-880), so
 * the scope stayed foreign and print status read "unknown". A count through the
 * caller's own RLS would not help: a secretary who lost access to the show reads
 * 0 of 0 on both the fetch and the count, and would be stamped with stale cached
 * rows. `count_paperwork_prints` is therefore SECURITY DEFINER with the select
 * policy's access check (`can_manage_show` or `is_show_secretary`) written in
 * explicitly: a caller with access gets the true count, a caller without it
 * gets NULL ("can't tell").
 *
 * Signed-in sessions only: an error, a refused call, NULL, a non-numeric answer,
 * any non-zero count, or being offline is "can't tell": false, nothing is stamped.
 */
export async function verifyPaperworkPrintsEmpty(showId: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
  try {
    const { data, error } = await supabase.rpc('count_paperwork_prints', { p_show_id: showId });
    return !error && data === 0;
  } catch {
    return false;
  }
}
