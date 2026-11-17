import { supabase } from '@/services/database/supabaseClient';

/**
 * Proof that this caller's read of a show's paperwork prints is empty, for the
 * paperwork adapter's `verifyScopeEmpty` (MYK9-2080).
 *
 * A device holding another account's print rows cannot tell, after a zero-row
 * full sync, whether the new account really has nothing or RLS hid it (MYK9-880),
 * so the scope stayed foreign and print status read "unknown". Unlike the
 * waitlist proof this does not ask whether the held rows are gone: they are
 * another account's and still exist. `count_paperwork_prints` is SECURITY
 * INVOKER and counts through the same RLS as the sync's fetch, so zero means
 * this caller's whole read of the show is empty and the stamp is safe.
 *
 * Signed-in sessions only: an error, a refused call, a non-numeric answer, any
 * non-zero count, or being offline is "can't tell": false, and nothing is stamped.
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
