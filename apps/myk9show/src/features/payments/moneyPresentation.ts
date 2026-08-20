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
  entryIds: string[];
  refunds?: PaymentPresentationRefund[];
}

export type PaymentDisplayRowKind = 'charge' | 'refund';

export interface PaymentDisplayRow {
  id: string;
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

export function buildPaymentDisplayRows(
  payments: PaymentPresentationSource[]
): PaymentDisplayRow[] {
  return payments.flatMap(payment => {
    if (
      isRefundedPaymentStatus(payment.status) &&
      (!payment.refunds || payment.refunds.length === 0)
    ) {
      return [
        {
          id: `${payment.id}:charge`,
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
          kind: 'refund',
          date: payment.date,
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
}
