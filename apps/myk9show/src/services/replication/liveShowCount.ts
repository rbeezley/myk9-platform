import { logger } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';

/**
 * The count the sync engine compares the shows replica against, filtered
 * exactly as the shows fetch is (live rows, club scope when set). It is how a
 * device notices it holds MORE shows than the server (one soft-deleted
 * elsewhere), which the live-only incremental fetch can never deliver as a
 * tombstone. Counts the id column, never `*`, on a column-allowlisted table
 * (docs/lessons/README.md#postgrest-count-column). Undefined when unavailable:
 * the sync continues and no cleanup runs.
 */
export async function getLiveShowCount(clubId?: string): Promise<number | undefined> {
  const unavailable = (message: string) => {
    logger.warn('[shows] Shows coverage count unavailable; continuing sync', 'replication', {
      message,
    });
    return undefined;
  };
  try {
    let query = supabase
      .from('shows')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);
    if (clubId) query = query.eq('club_id', clubId);
    const { count, error } = await query;
    return error ? unavailable(error.message) : (count ?? 0);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}
