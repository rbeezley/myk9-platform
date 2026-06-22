// Pure refund amount policy for secretary-initiated entry payment links.
// Deno-free so webhook amount decisions are covered by colocated vitest tests.

export interface EntryPaymentAutoRefundInput {
  paymentIntentId: string | null;
  sessionAmountTotalCents: number | null;
  /** Entries actually receiving paid service from this charge. */
  validPaidEntryIds: string[];
  /** Entries paid for by this charge that should not receive service. */
  invalidEntryIds: string[];
  /** Authoritative entry-fee line totals from the Checkout Session. */
  entryFeesById: Map<string, number>;
}

export type EntryPaymentAutoRefundDecision =
  | { action: 'none' }
  | { action: 'refund'; amountCents: number; reason: 'full_make_whole' | 'partial_invalid_entries' }
  | { action: 'needs_manual_amount'; missingFeeEntryIds: string[] }
  | { action: 'cannot_refund'; reason: 'missing_payment_intent' | 'missing_amount' };

export function decideEntryPaymentAutoRefund(
  input: EntryPaymentAutoRefundInput
): EntryPaymentAutoRefundDecision {
  if (input.invalidEntryIds.length === 0) return { action: 'none' };
  if (!input.paymentIntentId) return { action: 'cannot_refund', reason: 'missing_payment_intent' };
  if (!input.sessionAmountTotalCents || input.sessionAmountTotalCents <= 0) {
    return { action: 'cannot_refund', reason: 'missing_amount' };
  }

  if (input.validPaidEntryIds.length === 0) {
    return {
      action: 'refund',
      amountCents: input.sessionAmountTotalCents,
      reason: 'full_make_whole',
    };
  }

  const paidForEntryIds = [...input.validPaidEntryIds, ...input.invalidEntryIds];
  const missingFeeEntryIds = paidForEntryIds.filter(id => !input.entryFeesById.has(id));
  if (missingFeeEntryIds.length > 0) {
    return { action: 'needs_manual_amount', missingFeeEntryIds };
  }

  const subtotalCents = sumEntryFees(input.entryFeesById, paidForEntryIds);
  const invalidSubtotalCents = sumEntryFees(input.entryFeesById, input.invalidEntryIds);
  if (subtotalCents <= 0 || invalidSubtotalCents <= 0) {
    return { action: 'needs_manual_amount', missingFeeEntryIds: input.invalidEntryIds };
  }

  const invalidCollectedShareCents = Math.round(
    (input.sessionAmountTotalCents * invalidSubtotalCents) / subtotalCents
  );
  return {
    action: 'refund',
    amountCents: invalidCollectedShareCents,
    reason: 'partial_invalid_entries',
  };
}

function sumEntryFees(entryFeesById: Map<string, number>, entryIds: string[]): number {
  return entryIds.reduce((sum, id) => sum + (entryFeesById.get(id) ?? 0), 0);
}
