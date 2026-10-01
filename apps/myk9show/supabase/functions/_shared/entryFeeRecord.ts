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

export interface StampedEntryFeeRecordResult {
  /** Entries whose NULL/0 fee was written. */
  recorded: string[];
  /** Entries whose write failed (the caller alerts; a refund would read zero). */
  failed: { id: string; error: { message: string } }[];
}

/**
 * Records the charged fee on each STAMPED entry, once per entry, and only where it
 * is needed: an entry whose stored fee is already positive (known from data the
 * caller already loaded) costs no request at all. An entry whose stored fee is not
 * known is attempted, since the UPDATE's own NULL-or-0 condition keeps that safe.
 */
export async function recordChargedFeesForStamped(
  client: EntryFeeRecordClient,
  input: {
    stampedEntryIds: Iterable<string>;
    /** entry id -> stored entries.entry_fee, for the entries the caller loaded. */
    storedFeeById: ReadonlyMap<string, number | string | null | undefined>;
    /** entry id -> cents actually charged for it. */
    chargedCentsById: ReadonlyMap<string, number>;
  }
): Promise<StampedEntryFeeRecordResult> {
  const result: StampedEntryFeeRecordResult = { recorded: [], failed: [] };
  for (const id of new Set(input.stampedEntryIds)) {
    const charged = input.chargedCentsById.get(id);
    if (charged == null) continue;
    const known = input.storedFeeById.has(id);
    if (known && planEntryFeeRecord(input.storedFeeById.get(id), charged) === null) continue;
    const { recorded, error } = await recordChargedEntryFee(client, id, charged);
    if (error) result.failed.push({ id, error });
    else if (recorded) result.recorded.push(id);
  }
  return result;
}
