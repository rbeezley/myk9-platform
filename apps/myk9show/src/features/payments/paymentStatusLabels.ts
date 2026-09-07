/**
 * The `stripe_orders.status` vocabulary, as a leaf module.
 *
 * Split out of `moneyPresentation` so `orderRefundReconciliation` can read the
 * status vocabulary without the two modules importing each other: the ledger
 * needs the shared refund derivation, and the derivation needs to recognise a
 * legacy `status = 'refunded'` row. A cycle between them would work today and
 * break the first time either module did real work at import time.
 *
 * @module features/payments/paymentStatusLabels
 */

export function isRefundedPaymentStatus(status: string): boolean {
  return status.toLowerCase() === 'refunded';
}

export function paymentStatusLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === 'succeeded' || s === 'paid') return 'Paid';
  if (s === 'refunded') return 'Refunded';
  if (s === 'failed') return 'Failed';
  if (s === 'cancelled' || s === 'canceled') return 'Cancelled';
  if (s === 'pending') return 'Pending';
  if (s === 'processing') return 'Processing';
  if (s === 'unknown' || s === '') return 'Unknown';
  return status.charAt(0).toUpperCase() + status.slice(1);
}
