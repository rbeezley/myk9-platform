// Pure decisions for stripe-webhook's charge.refunded handler (Deno-free;
// colocated vitest).
//
// The handler skips reconciliation for refunds it already recorded itself
// (per-entry refund, auto-refund, or the bulk show-cancellation refund).
// Before this, a bulk show-cancellation refund fell through to the dashboard
// -refund reconcile path on EVERY entry's charge.refunded delivery, flooding
// admin with one false-critical alert per entry (MP-06). But a show refund
// still needs a real check: stamp_show_refund_entries must have actually run
// against the intent's entries, or the payout cron will overpay the club
// (MP-10 — this also becomes the exact post-mortem detector for a mid-bulk
// process kill, since it arrives via webhook and survives the function's
// death).

export interface ChargeRefundLike {
  metadata?: {
    entry_id?: string;
    type?: string;
    show_refund?: string;
  } | null;
}

export function isAppOriginatedRefund(refund: ChargeRefundLike): boolean {
  return !!(
    refund.metadata?.entry_id ||
    refund.metadata?.type === 'entry_payment_request_auto_refund' ||
    refund.metadata?.type === 'entry_cart_overflow_auto_refund' ||
    refund.metadata?.show_refund
  );
}

/** Mixed charges (part app, part dashboard) still fall through to reconcile —
 * a single app refund must never mask a later dashboard refund on the same
 * charge (review finding #3). */
export function allRefundsAppOriginated(refunds: ChargeRefundLike[]): boolean {
  return refunds.length > 0 && refunds.every(isAppOriginatedRefund);
}

export function findShowRefundId(refunds: ChargeRefundLike[]): string | undefined {
  for (const r of refunds) {
    if (r.metadata?.show_refund) return r.metadata.show_refund;
  }
  return undefined;
}

export type ShowRefundStampAlertDecision =
  | { action: 'none' }
  | { action: 'alert'; unstampedEntryCount: number };

export function decideShowRefundStampAlert(unstampedEntryCount: number): ShowRefundStampAlertDecision {
  return unstampedEntryCount > 0 ? { action: 'alert', unstampedEntryCount } : { action: 'none' };
}
