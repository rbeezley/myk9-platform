export interface EntryPaymentQuote {
  sourceEntryId: string;
  moneyRootEntryId: string;
  liveEntryId: string;
  showId: string;
  dogId: string;
  entryFeeCents: number;
}

/** Validate SQL quote output while retaining the caller's source row identity. */
export function normalizeEntryPaymentQuote(
  data: unknown,
  sourceEntryId: string,
  expectedShowId: string,
  expectedDogId: string
): EntryPaymentQuote | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  const quote = row as Record<string, unknown>;
  if (
    typeof quote.money_root_entry_id !== 'string' ||
    typeof quote.live_entry_id !== 'string' ||
    quote.show_id !== expectedShowId ||
    quote.dog_id !== expectedDogId ||
    !Number.isSafeInteger(quote.entry_fee_cents) ||
    (quote.entry_fee_cents as number) < 0
  ) {
    return null;
  }

  return {
    sourceEntryId,
    moneyRootEntryId: quote.money_root_entry_id,
    liveEntryId: quote.live_entry_id,
    showId: expectedShowId,
    dogId: expectedDogId,
    entryFeeCents: quote.entry_fee_cents as number,
  };
}
