/**
 * Money handling for the dog-entries read (`getEntriesByDog`), kept out of
 * `reads.ts` so that file does not grow.
 *
 * The read overlays a row's unsynced local edit onto the server row. That is
 * right for everything an exhibitor can edit, and wrong for money: payment
 * fields are server-written (protected by trigger), so a pending local row can
 * only carry a STALE copy of them. A stale `pending` there reads as "payment
 * owed" on a dog the server says is paid. These helpers keep the payment fields
 * server-confirmed, and withhold them where no server row exists.
 */
import { supabase } from '../supabaseClient';
import { logger } from '@/services/LoggingService';

/** Money columns the replica must never contribute to a dog surface. */
const SERVER_OWNED_PAYMENT_FIELDS = [
  'payment_status',
  'payment_method',
  'entry_fee',
  'total_fees',
  'comped',
  'discount_amount',
  'refund_amount',
  'refunded_at',
  // The money root: a move-up successor owes nothing itself, so a local overlay
  // that drops this link strands its payment on the original entry.
  'moved_from_entry_id',
] as const;

/** Take the payment fields from the server row, everything else from `merged`. */
export function withServerPaymentFields(
  merged: Record<string, unknown>,
  serverRow: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...merged };
  for (const field of SERVER_OWNED_PAYMENT_FIELDS) {
    if (field in serverRow) out[field] = serverRow[field];
    else delete out[field];
  }
  return out;
}

/**
 * A pending row the server has never seen has no server-confirmed payment.
 * Null reads as "no balance claimed", the neutral wording, never "owed".
 */
export function withoutUnverifiedPayment<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  for (const field of SERVER_OWNED_PAYMENT_FIELDS) {
    if (field in out) out[field] = null;
  }
  return out as T;
}

/**
 * `id -> moved_from_entry_id` for a dog's live entries (MYK9-639's lineage).
 *
 * A separate narrow read so the shared dog select stays on the plain column
 * list (a missing column fails a whole PostgREST request). Best effort: on any
 * failure the map is empty and every row is its own money root, which is the
 * pre-lineage behaviour, not a new failure.
 */
export async function readDogEntryMoveUpLinks(dogId: string): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  try {
    const { data, error } = await supabase
      .from('entries')
      .select('id,moved_from_entry_id')
      .eq('dog_id', dogId)
      .is('deleted_at', null);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.moved_from_entry_id) links.set(row.id, row.moved_from_entry_id);
    }
  } catch (error) {
    logger.warn(`[entries] could not read move-up links for dog entries: ${String(error)}`);
  }
  return links;
}
