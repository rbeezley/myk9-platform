export interface PaymentPresentationRefund {
  entryId: string;
  amountCents: number;
  date: string | null;
  label: string;
}

export interface PaymentPresentationSource {
  id: string;
  date: string | null;
  showId: string | null;
  showName: string | null;
  amountCents: number;
  currency: string;
  status: string;
  reference: string | null;
  /** When the whole order was refunded, for orders with no entry-level refunds. */
  refundedAt?: string | null;
  entryIds: string[];
  refunds?: PaymentPresentationRefund[];
}

export type PaymentDisplayRowKind = 'charge' | 'refund';

export interface PaymentDisplayRow {
  id: string;
  /** Source stripe_orders.id; display row ids add charge/refund suffixes. */
  orderId: string;
  kind: PaymentDisplayRowKind;
  date: string | null;
  showId: string | null;
  showName: string | null;
  description: string;
  amountCents: number;
  currency: string;
  status: string;
  reference: string | null;
  entryIds: string[];
}

const PAID_STATUSES = new Set(['succeeded', 'paid']);

export function isRetryablePaymentStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'failed' || s === 'cancelled' || s === 'canceled';
}

// Only the two in-flight values stripe_orders.status can actually hold. The
// column carries CHECK (status IN ('pending','processing','succeeded',
// 'failed','refunded','cancelled')) — migration 005 — so Stripe's raw intent
// statuses (requires_action and friends) cannot reach this code, and listing
// them would be unreachable branch surface.
const SETTLING_STATUSES = new Set(['pending', 'processing']);

/**
 * Money that is in flight: the order exists and is moving, but has neither
 * settled into a receipt nor failed into something the exhibitor can retry.
 * Kept separate from `isRetryablePaymentStatus` because offering a "Finish
 * payment" link here would invite a second charge on an order Stripe is still
 * working on.
 */
export function isSettlingPaymentStatus(status: string): boolean {
  return SETTLING_STATUSES.has(status.toLowerCase());
}

export function isPaidPaymentStatus(status: string): boolean {
  return PAID_STATUSES.has(status.toLowerCase());
}

export function isRefundedPaymentStatus(status: string): boolean {
  return status.toLowerCase() === 'refunded';
}

export function formatPaymentCents(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export function formatPaymentDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
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

/**
 * Sort key for the ledger: newest first, undated rows last.
 *
 * Needed because rows do NOT arrive in display order. `useMyPayments` returns
 * orders by `created_at DESC` and each order expands to a charge followed by
 * its refunds, so a refund is positioned by the charge it reverses rather than
 * by its own date — a 2026 refund of a 2024 charge sank below every 2026
 * charge. Harmless while the whole ledger was one undifferentiated scroll;
 * wrong the moment the page calls itself chronological AND can be scoped to a
 * year, where ordering within the year would follow charge dates.
 *
 * The sort is stable (V8 guarantees it), so a charge and a same-instant refund
 * keep their emitted order — charge first, then the refund that reverses it.
 */
function comparePaymentRowsByDate(a: PaymentDisplayRow, b: PaymentDisplayRow): number {
  const at = a.date ? new Date(a.date).getTime() : Number.NaN;
  const bt = b.date ? new Date(b.date).getTime() : Number.NaN;
  const aBad = Number.isNaN(at);
  const bBad = Number.isNaN(bt);
  if (aBad && bBad) return 0;
  if (aBad) return 1;
  if (bBad) return -1;
  return bt - at;
}

export function buildPaymentDisplayRows(
  payments: PaymentPresentationSource[]
): PaymentDisplayRow[] {
  const rows: PaymentDisplayRow[] = payments.flatMap<PaymentDisplayRow>(payment => {
    if (
      isRefundedPaymentStatus(payment.status) &&
      (!payment.refunds || payment.refunds.length === 0)
    ) {
      return [
        {
          id: `${payment.id}:charge`,
          orderId: payment.id,
          kind: 'charge',
          date: payment.date,
          showId: payment.showId,
          showName: payment.showName,
          description: 'Online entry fees',
          amountCents: payment.amountCents,
          currency: payment.currency,
          status: 'succeeded',
          reference: payment.reference,
          entryIds: payment.entryIds,
        },
        {
          id: `${payment.id}:refund`,
          orderId: payment.id,
          kind: 'refund',
          // The refund's OWN date, not the charge's. This branch covers a fully
          // refunded order with no entry-level refund rows (the legacy /
          // dashboard path); inheriting `payment.date` filed the refund under
          // the year the charge was made, so a 2025 charge refunded in 2026
          // subtotaled under 2025 once the ledger could be scoped by year.
          date: payment.refundedAt ?? payment.date,
          showId: payment.showId,
          showName: payment.showName,
          description: 'Refund',
          amountCents: -Math.abs(payment.amountCents),
          currency: payment.currency,
          status: 'refunded',
          reference: payment.reference,
          entryIds: payment.entryIds,
        },
      ];
    }

    const chargeRow: PaymentDisplayRow = {
      id: `${payment.id}:charge`,
      orderId: payment.id,
      kind: 'charge',
      date: payment.date,
      showId: payment.showId,
      showName: payment.showName,
      description: 'Online entry fees',
      amountCents: payment.amountCents,
      currency: payment.currency,
      status:
        isRefundedPaymentStatus(payment.status) && payment.refunds && payment.refunds.length > 0
          ? 'succeeded'
          : payment.status,
      reference: payment.reference,
      entryIds: payment.entryIds,
    };

    const refundRows =
      payment.refunds?.map(refund => ({
        id: `${payment.id}:refund:${refund.entryId}`,
        orderId: payment.id,
        kind: 'refund' as const,
        date: refund.date ?? payment.date,
        showId: payment.showId,
        showName: payment.showName,
        description: refund.label ? `Refund - ${refund.label}` : 'Refund',
        amountCents: -Math.abs(refund.amountCents),
        currency: payment.currency,
        status: 'refunded',
        reference: payment.reference,
        entryIds: [refund.entryId],
      })) ?? [];

    return [chargeRow, ...refundRows];
  });

  return rows.sort(comparePaymentRowsByDate);
}
