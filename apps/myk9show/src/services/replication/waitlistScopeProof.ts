import { supabase } from '@/services/database/supabaseClient';

/** Ids per call; the server refuses more than 500 (22023). */
const BATCH_SIZE = 200;

/**
 * Independent proof that every waitlist row this device holds is gone from the
 * server, for the waitlist adapter's `verifyScopeEmpty` (MYK9-1000).
 *
 * The waitlist count and fetch share one RLS, so when the LAST row a device
 * can see is removed elsewhere they read 0 of 0, exactly like an RLS gap (a
 * revoked role, a session without its claims) that must never wipe a valid
 * replica (MYK9-880). `count_live_waitlist_entries` is SECURITY DEFINER and
 * counts which of the given ids still exist regardless of the caller's RLS, so
 * a row that exists but the caller can no longer see is counted, and only rows
 * that are really gone read zero.
 *
 * Signed-in sessions only: an anon session, a refused call, an error, a
 * non-numeric answer, any non-zero count, or being offline is "can't tell":
 * false, and the replica keeps every row.
 */
export async function verifyWaitlistEntriesGone(ids: readonly string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;

  for (let start = 0; start < ids.length; start += BATCH_SIZE) {
    try {
      const { data, error } = await supabase.rpc('count_live_waitlist_entries', {
        p_ids: ids.slice(start, start + BATCH_SIZE),
      });
      if (error || data !== 0) return false;
    } catch {
      return false;
    }
  }
  return true;
}
