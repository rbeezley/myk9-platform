// Pure decision for the per-entry refund stamp race (MP-09).
//
// stripe-refund-entry reads an entry's payment_status BEFORE calling Stripe,
// then stamps the entry with `.eq('payment_status', 'paid')` AFTER. Between
// those two reads, a bulk show-cancellation refund
// (stamp_show_refund_entries, migration 20260628000000) can flip the same
// entry's payment_status to 'refunded' first. When that happens the stamp
// UPDATE affects zero rows with NO error — the entry was already correctly
// stamped by the other path, and the Stripe refund this handler just
// created/reused already has an accounting home. That is a benign no-op, not
// a failure requiring an operator alert: the existing stamp wins and must
// not be overwritten.
//
// A real zero-row-with-error case (the UPDATE itself failed) is unrelated to
// this race and still needs the CRITICAL alert + 500 — the payout cron would
// otherwise overpay the club for money that was actually refunded.

export interface RefundStampGuardInput {
  hasUpdateError: boolean;
  matchedEntryCount: number;
}

export type RefundStampGuardDecision =
  { action: 'record_failure' } | { action: 'stamped' } | { action: 'already_stamped_elsewhere' };

export function decideRefundStampGuard(input: RefundStampGuardInput): RefundStampGuardDecision {
  if (input.hasUpdateError) {
    return { action: 'record_failure' };
  }
  if (input.matchedEntryCount === 0) {
    return { action: 'already_stamped_elsewhere' };
  }
  return { action: 'stamped' };
}
