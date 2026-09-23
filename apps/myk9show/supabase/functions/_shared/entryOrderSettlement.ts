export type EntrySettlementLineOutcome = 'accepted' | 'waitlisted' | 'denied';

export interface EntrySettlementLineResult {
  lineId: string;
  outcome: EntrySettlementLineOutcome;
  entryId: string | null;
  moneyRootEntryId: string | null;
  waitlistEntryId: string | null;
}

export interface EntryOrderSettlement {
  orderId: string;
  canonicalEntryIds: string[];
  lineResults: EntrySettlementLineResult[];
  expectedMakeWholeRefundCents: number;
}

/** Map verified source-line prices onto SQL-selected live entries for receipts. */
export function mapAcceptedEntryFees(
  lines: EntrySettlementLineResult[],
  verifiedLinePrices: Array<{ lineId: string; priceCents: number }>
): Map<string, number> {
  const pricesByLineId = new Map(verifiedLinePrices.map(line => [line.lineId, line.priceCents]));
  const feesByEntryId = new Map<string, number>();
  for (const line of lines) {
    const priceCents = pricesByLineId.get(line.lineId);
    if (line.outcome === 'accepted' && line.entryId && priceCents !== undefined) {
      feesByEntryId.set(line.entryId, priceCents);
    }
  }
  return feesByEntryId;
}

/** Decode the service-role RPC response before any follow-up side effects. */
export function normalizeEntryOrderSettlement(data: unknown): EntryOrderSettlement | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  const value = row as Record<string, unknown>;
  if (
    typeof value.order_id !== 'string' ||
    !Array.isArray(value.canonical_entry_ids) ||
    !Array.isArray(value.line_results) ||
    !Number.isSafeInteger(value.expected_make_whole_refund_cents) ||
    (value.expected_make_whole_refund_cents as number) < 0
  ) {
    return null;
  }

  const canonicalEntryIds = value.canonical_entry_ids;
  if (!canonicalEntryIds.every(id => typeof id === 'string')) return null;

  const lineResults: EntrySettlementLineResult[] = [];
  for (const item of value.line_results) {
    if (!item || typeof item !== 'object') return null;
    const line = item as Record<string, unknown>;
    const outcome = line.outcome === 'created_entry' ? 'accepted' : line.outcome;
    if (
      typeof line.lineId !== 'string' ||
      (outcome !== 'accepted' && outcome !== 'waitlisted' && outcome !== 'denied') ||
      !isNullableString(line.entryId) ||
      !isNullableString(line.moneyRootEntryId) ||
      !isNullableString(line.waitlistEntryId)
    ) {
      return null;
    }
    lineResults.push({
      lineId: line.lineId,
      outcome,
      entryId: line.entryId,
      moneyRootEntryId: line.moneyRootEntryId,
      waitlistEntryId: line.waitlistEntryId,
    });
  }

  return {
    orderId: value.order_id,
    canonicalEntryIds,
    lineResults,
    expectedMakeWholeRefundCents: value.expected_make_whole_refund_cents as number,
  };
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}
