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
//
// A zero-row match is NOT proof of the benign race, though: the entry could
// have been deleted, or its payment_status changed without any refund stamp —
// in both cases Stripe issued a real refund with no local accounting record.
// The caller therefore re-reads the entry after a zero-row match and passes
// the result in `reread`; the zero-row outcome is benign ONLY when the row
// still exists AND carries a refund stamp. Anything else (missing row,
// unstamped row, or no re-read at all) fails closed to `record_failure`.

export interface RefundStampReread {
  /** The entry row still exists. */
  found: boolean;
  /** The row carries a refund stamp (see entryHasRefundStamp). */
  hasRefundStamp: boolean;
}

export interface RefundStampGuardInput {
  hasUpdateError: boolean;
  matchedEntryCount: number;
  /** Re-read of the entry after a zero-row match. Omitting it on a zero-row
   * match fails closed. */
  reread?: RefundStampReread;
}

export type RefundStampGuardDecision =
  { action: 'record_failure' } | { action: 'stamped' } | { action: 'already_stamped_elsewhere' };

/** True when the entry row shows the stamp both refund paths write:
 * stamp_show_refund_entries (migration 20260628000000) and
 * buildEntryRefundStamp both set payment_status = 'refunded' AND a positive
 * refund_amount. Either signal alone is accepted — a manual operator fix may
 * set only refund_amount (see the "Manual reconciliation" runbook section).
 * refund_amount is NUMERIC, so supabase-js may return number or string. */
export function entryHasRefundStamp(row: {
  payment_status: string | null;
  refund_amount: number | string | null;
}): boolean {
  if (row.payment_status === 'refunded') return true;
  const amount = row.refund_amount == null ? 0 : Number(row.refund_amount);
  return Number.isFinite(amount) && amount > 0;
}

export function decideRefundStampGuard(input: RefundStampGuardInput): RefundStampGuardDecision {
  if (input.hasUpdateError) {
    return { action: 'record_failure' };
  }
  if (input.matchedEntryCount === 0) {
    if (input.reread?.found && input.reread.hasRefundStamp) {
      return { action: 'already_stamped_elsewhere' };
    }
    return { action: 'record_failure' };
  }
  return { action: 'stamped' };
}
