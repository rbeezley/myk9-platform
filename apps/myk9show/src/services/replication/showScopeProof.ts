import { supabase } from '@/services/database/supabaseClient';

/** P0002 (no_data_found): `delete_preview` found no LIVE show with that id. */
const NO_DATA_FOUND = 'P0002';

/** Proofs in flight at once. A live show ends the proof at the end of its batch. */
const BATCH_SIZE = 5;

/**
 * Independent proof that every show id this device holds is gone from the
 * server (soft-deleted or purged), for the shows adapter's `verifyScopeEmpty`.
 *
 * The shows count and fetch share one RLS, so a transient RLS gap reads as a
 * complete empty fetch (MYK9-880). `delete_preview` is SECURITY DEFINER and
 * checks "does a live row exist" BEFORE any permission gate, for every caller
 * who may execute it, so P0002 there is not subject to the caller's RLS: a live
 * show the caller cannot see answers 42501 or a preview, never P0002.
 *
 * Only signed-in (authenticated) sessions can execute it. It is revoked from
 * `anon`, so an anon or passcode session gets a permission error here, which
 * reads as "can't tell": such a device never clears a deleted last show this
 * way and keeps its rows. That is the safe direction (MYK9-880) and the same
 * limit `verifySecretaryEmptyShow` has for entries.
 *
 * Ids are checked in batches of {@link BATCH_SIZE}, any number of them, and the
 * proof stops at the first batch holding anything but P0002 (a live show, a
 * permission error, a failure, a thrown call), so one live show costs at most
 * one batch of calls rather than one per held show. Anything but P0002, or
 * being offline, is "can't tell": false, and the replica keeps every row.
 * MYK9-913.
 */
export async function verifyShowsGone(showIds: readonly string[]): Promise<boolean> {
  if (showIds.length === 0) return true;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;

  for (let start = 0; start < showIds.length; start += BATCH_SIZE) {
    const batch = showIds.slice(start, start + BATCH_SIZE);
    const answers = await Promise.all(
      batch.map(async id => {
        try {
          const { error } = await supabase.rpc('delete_preview', { p_scope: 'show', p_id: id });
          return error?.code === NO_DATA_FOUND;
        } catch {
          return false;
        }
      })
    );
    if (!answers.every(Boolean)) return false;
  }
  return true;
}
