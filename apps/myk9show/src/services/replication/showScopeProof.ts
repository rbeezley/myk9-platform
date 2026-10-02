import { supabase } from '@/services/database/supabaseClient';

/** P0002 (no_data_found): `delete_preview` found no LIVE show with that id. */
const NO_DATA_FOUND = 'P0002';

/** Past this many shows the proof is not attempted and every row is kept. */
const MAX_PROVED_SHOWS = 50;

/**
 * Independent proof that every show id this device holds is gone from the
 * server (soft-deleted or purged), for the shows adapter's `verifyScopeEmpty`.
 *
 * The shows count and fetch share one RLS, so a transient RLS gap reads as a
 * complete empty fetch (MYK9-880). `delete_preview` is SECURITY DEFINER and
 * checks "does a live row exist" BEFORE any permission gate, for every caller,
 * so P0002 there is not subject to the caller's RLS: a live show the caller
 * cannot see answers 42501 or a preview, never P0002. Proof is therefore
 * per held id and covers managed and public scopes alike. Anything else
 * (success, 42501, another error, a thrown call, offline) is "can't tell":
 * false, and the replica keeps every row. MYK9-913.
 */
export async function verifyShowsGone(showIds: readonly string[]): Promise<boolean> {
  if (showIds.length === 0) return true;
  if (showIds.length > MAX_PROVED_SHOWS) return false;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;

  const answers = await Promise.all(
    showIds.map(async id => {
      try {
        const { error } = await supabase.rpc('delete_preview', { p_scope: 'show', p_id: id });
        return error?.code === NO_DATA_FOUND;
      } catch {
        return false;
      }
    })
  );
  return answers.every(Boolean);
}
