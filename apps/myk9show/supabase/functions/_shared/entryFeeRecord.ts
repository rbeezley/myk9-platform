// Deno-free (colocated vitest). The ONE rule for writing `entries.entry_fee` on an
// entry that already exists (MYK9-879, Codex round 2):
//
//   Write entry_fee only when the stored fee is NULL or 0, recording the amount
//   actually charged; never overwrite a positive fee.
//
// A positive fee was FROZEN when the entry was created and the payment was taken at
// exactly that amount, so rewriting it could only corrupt it (a later change to the
// show's tiers must not re-price an entry). A NULL or 0 fee has nothing frozen: the
// line was priced at the fallback tier and PAID, and stripe-refund-entry computes
// the refundable amount from entry_fee, so leaving it NULL would make a paid entry
// unrefundable. Every existing-entry payment path (webhook Finish Payment recovery,
// the secretary payment link) records through here.

/** entries.entry_fee (DECIMAL dollars) to integer cents; NULL reads as 0. */
export function storedFeeToCents(entryFee: number | string | null | undefined): number {
  if (entryFee == null) return 0;
  const dollars = typeof entryFee === 'number' ? entryFee : parseFloat(String(entryFee));
  return Number.isFinite(dollars) ? Math.round(dollars * 100) : 0;
}

/**
 * The dollars to write onto an existing entry, or null when nothing may be
 * written: the stored fee is already positive, or the charge is not positive.
 */
export function planEntryFeeRecord(
  storedFee: number | string | null | undefined,
  chargedCents: number
): number | null {
  if (!(Number.isFinite(chargedCents) && chargedCents > 0)) return null;
  if (storedFeeToCents(storedFee) > 0) return null;
  return chargedCents / 100;
}

/** The slice of a supabase-js client this module needs, so tests can fake it. */
export interface EntryFeeRecordClient {
  from(table: 'entries'): {
    update(values: { entry_fee: number }): {
      eq(
        column: 'id',
        value: string
      ): {
        or(filter: string): {
          select(columns: 'id'): PromiseLike<{
            data: { id: string }[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
}

/**
 * Records the charged amount on an existing entry whose stored fee is NULL or 0.
 * The NULL-or-0 condition is in the UPDATE itself, so a concurrent writer that
 * already stored a positive fee is never overwritten. Returns whether a row was
 * written; a positive stored fee is a normal no-op, not an error.
 */
export async function recordChargedEntryFee(
  client: EntryFeeRecordClient,
  entryId: string,
  chargedCents: number
): Promise<{ recorded: boolean; error: { message: string } | null }> {
  const dollars = planEntryFeeRecord(null, chargedCents);
  if (dollars === null) return { recorded: false, error: null };
  const { data, error } = await client
    .from('entries')
    .update({ entry_fee: dollars })
    .eq('id', entryId)
    .or('entry_fee.is.null,entry_fee.eq.0')
    .select('id');
  if (error) return { recorded: false, error };
  return { recorded: (data ?? []).length > 0, error: null };
}
