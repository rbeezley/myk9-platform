import { supabase, logQuery, createDatabaseError } from '../supabaseClient';

/** The fields a Refund all result line needs to name an entry (MYK9-1862). */
export interface RefundNameRow {
  id: string;
  handler: string | null;
  dog: {
    id: string;
    name: string;
    call_name: string | null;
    owner: { first_name: string | null; last_name: string | null } | null;
  } | null;
}

// Keeps each request's URL well under PostgREST's limit; a result almost always fits in one.
const IDS_PER_REQUEST = 150;

/**
 * Names for the Refund all result ids the staff roster did not have: entries soft-deleted after
 * they were paid, a stale replica, a show past the roster's fallback page. Online-only by design:
 * this runs right after a Refund all, which itself needs the network. No `deleted_at` filter, so
 * a soft-deleted entry the refund still reported is named too (managers can read those rows).
 */
export async function getRefundEntryNames(entryIds: readonly string[]): Promise<RefundNameRow[]> {
  const ids = [...new Set(entryIds)];
  const rows: RefundNameRow[] = [];
  const startTime = Date.now();
  for (let start = 0; start < ids.length; start += IDS_PER_REQUEST) {
    const { data, error } = await supabase
      .from('entries')
      .select(
        'id, handler, dog:dog_id ( id, name, call_name, owner:owner_id ( first_name, last_name ) )'
      )
      .in('id', ids.slice(start, start + IDS_PER_REQUEST));
    if (error) {
      logQuery('entries', 'refund_entry_names', Date.now() - startTime, error.message);
      throw createDatabaseError(error, 'entries', 'refund_entry_names');
    }
    rows.push(...((data ?? []) as RefundNameRow[]));
  }
  logQuery('entries', 'refund_entry_names', Date.now() - startTime);
  return rows;
}
