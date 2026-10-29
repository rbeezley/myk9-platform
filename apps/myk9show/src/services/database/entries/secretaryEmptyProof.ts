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

/**
 * MYK9-1476: a second, independent proof for a caller the count RPC above
 * refuses. A just-revoked steward or secretary with no entries of their own
 * reads zero rows, and only the server can say the role set grants no access to
 * the show. The function proves "no access by role", not "the view returned 0".
 * Offline, an error or a non-boolean answer is never proof.
 */
export async function verifyCallerHasNoShowAccess(showId: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }

  // Not in the generated types until the MYK9-1476 migration is applied; the
  // same cast other not-yet-typed RPCs use (see entries/writes.ts).
  const { data, error } = await supabase.rpc(
    'entry_results_caller_has_no_show_access' as never,
    { p_show_id: showId } as never
  );
  return !error && data === true;
}

/** True when EITHER the manager count reads zero or the caller has no access to the show. */
export async function verifyEntriesScopeEmpty(showId: string): Promise<boolean> {
  return (await verifySecretaryEmptyShow(showId)) || (await verifyCallerHasNoShowAccess(showId));
}
