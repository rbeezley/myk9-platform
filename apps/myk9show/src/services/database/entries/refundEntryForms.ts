import { supabase, logQuery, createDatabaseError } from '../supabaseClient';

/** The entry form a Refund all result entry belongs to, read from the form record (MYK9-1862). */
export interface RefundEntryFormRow {
  id: string;
  registration_id: string | null;
  stripe_payment_intent_id: string | null;
  /** The enrollment (mail-in or desk form) and the person who placed it, its own payer. */
  registration: {
    confirmation_number: string | null;
    payer: { first_name: string | null; last_name: string | null } | null;
  } | null;
}

export const REFUND_ENTRY_FORMS_SELECT =
  'id, registration_id, stripe_payment_intent_id, ' +
  'registration:registration_id ( confirmation_number, payer:handler_id ( first_name, last_name ) )';

// Keeps each request's URL well under PostgREST's limit; a result almost always fits in one.
const IDS_PER_REQUEST = 150;

/**
 * The entry form, confirmation number and the form's own payer for every Refund all result
 * entry id, roster or not. Online-only by design: this runs right after a Refund all, which
 * itself needs the network. No `deleted_at` filter, so a soft-deleted entry the refund still
 * reported is placed on its form too (managers can read those rows).
 */
export async function getRefundEntryForms(
  entryIds: readonly string[]
): Promise<RefundEntryFormRow[]> {
  const ids = [...new Set(entryIds)];
  const rows: RefundEntryFormRow[] = [];
  const startTime = Date.now();
  for (let start = 0; start < ids.length; start += IDS_PER_REQUEST) {
    const { data, error } = await supabase
      .from('entries')
      .select(REFUND_ENTRY_FORMS_SELECT)
      .in('id', ids.slice(start, start + IDS_PER_REQUEST));
    if (error) {
      logQuery('entries', 'refund_entry_forms', Date.now() - startTime, error.message);
      throw createDatabaseError(error, 'entries', 'refund_entry_forms');
    }
    rows.push(...((data ?? []) as unknown as RefundEntryFormRow[]));
  }
  logQuery('entries', 'refund_entry_forms', Date.now() - startTime);
  return rows;
}
