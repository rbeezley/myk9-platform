/**
 * Comp / uncomp an entry (MYK9-1407).
 *
 * Neither write sends `payment_status`. The database trigger
 * `trg_entries_comp_payment_status` (migration 20261027003700) owns it: a comp
 * is refused on any paid or refunded entry (SQLSTATE `MKCMP`) and otherwise
 * remembers the status the entry had; undo restores exactly that status. The
 * client used to write `'waived'` and a hard-coded `'pending'` itself, which
 * relabelled collected money as forgiven and erased the payment on undo.
 *
 * Online-only on purpose, like the rest of Entry Management's money writes: a
 * comp must be refused or accepted by the server while the secretary watches,
 * never queued as a local `waived` that the server later rejects.
 */
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import { AUTHENTICATED_ENTRY_READ_COLUMNS } from './entrySelects';

/** SQLSTATE raised by the trigger when a comp targets a paid or refunded entry. */
export const COMP_REFUSED_PAID_CODE = 'MKCMP';

/** Secretary-facing copy for {@link COMP_REFUSED_PAID_CODE}. */
export const COMP_REFUSED_PAID_MESSAGE =
  'This entry already has a payment or refund recorded, so it cannot be comped. Its payment stays as recorded.';

async function writeComp(
  entryId: string,
  operation: 'comp_entry' | 'uncomp_entry',
  changes: { comped: boolean; comped_reason: string | null }
) {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', entryId)
      .select(AUTHENTICATED_ENTRY_READ_COLUMNS)
      .single();

    logQuery('entries', operation, Date.now() - startTime, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', operation);
    }

    return { data, error: null };
  } catch (error) {
    const dbError = createDatabaseError(error, 'entries', operation);
    logQuery('entries', operation, Date.now() - startTime, dbError.message);
    return { data: null, error: dbError };
  }
}

/** Comp an entry. The server sets `payment_status = 'waived'`, or refuses a paid row. */
export const compEntry = async (params: { entryId: string; reason: string }) =>
  writeComp(params.entryId, 'comp_entry', { comped: true, comped_reason: params.reason });

/** Remove a comp. The server restores the payment status the entry had before it. */
export const uncompEntry = async (entryId: string) =>
  writeComp(entryId, 'uncomp_entry', { comped: false, comped_reason: null });
