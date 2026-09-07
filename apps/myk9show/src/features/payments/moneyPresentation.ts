import { resolveOrderRefundedCents } from './orderRefundReconciliation';
import { isRefundedPaymentStatus } from './paymentStatusLabels';

// Re-exported so every existing importer keeps one place to reach the status
// vocabulary; the definitions moved to a leaf module to break an import cycle.
export { isRefundedPaymentStatus, paymentStatusLabel } from './paymentStatusLabels';

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
  /**
   * `stripe_orders.refunded_cents` — the refund total as the WEBHOOK recorded
   * it. Optional only so hand-built fixtures stay readable; `useMyPayments`
   * declares both columns as required fields on `MyPayment`, so the production
   * producer cannot drop them silently. Omitting them here loses only the
   * webhook-ahead reconciliation row, never a refund the entries already carry.
   */
  refundedCents?: number;
  /** `stripe_orders.make_whole_refunded_cents` — the cart-overflow auto-refund. */
  makeWholeRefundedCents?: number;
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

/**
 * The part of an order's resolved refund that no row above has already stated.
 *
 * The ledger's refund rows come from `entries.refund_amount` (or, on the legacy
 * path, from the whole gross). Neither sees a refund only
 * `stripe_orders.refunded_cents` carries — a Stripe DASHBOARD refund, which
 * never touches the entries — so before MYK9-428 the ledger silently
 * understated it while the receipt for the same order showed it in full.
 *
 * Emitting the REMAINDER rather than replacing the rows is what keeps the four
 * cart-overflow orders on staging unchanged: their gross is already stated as a
 * refund by the legacy branch, the shared derivation resolves to exactly that
 * gross, and the remainder is zero. Double-counting would need the remainder to
 * restate money a row above already carries, which by construction it cannot.
 */
function unreconciledRefundCents(
  payment: PaymentPresentationSource,
  alreadyStatedCents: number
): number {
  // `entryRefundedCents` is what the ENTRIES record, and `alreadyStatedCents`
  // is what the rows above already print. They coincide on the normal path and
  // must NOT be conflated: on the legacy path the rows state the whole gross
  // while the entries record nothing, and feeding the gross in as an entry
  // refund makes the resolver add it to `makeWholeRefundedCents` — which
  // reported twice the money back on exactly the four cart-overflow orders this
  // change had to leave alone.
  const resolved = resolveOrderRefundedCents({
    amountCents: payment.amountCents,
    status: payment.status,
    refundedCents: payment.refundedCents ?? 0,
    makeWholeRefundedCents: payment.makeWholeRefundedCents ?? 0,
    entryRefundedCents: entryRefundedCentsOf(payment),
  });
  return Math.max(0, resolved - alreadyStatedCents);
}

/** What `entries.refund_amount` records for this order, per the refund rows. */
function entryRefundedCentsOf(payment: PaymentPresentationSource): number {
  return (payment.refunds ?? []).reduce((sum, refund) => sum + Math.abs(refund.amountCents), 0);
}

/** Zero or one reconciliation row, so both branches can spread it inline. */
function appendUnreconciledRefund(
  payment: PaymentPresentationSource,
  alreadyStatedCents: number
): PaymentDisplayRow[] {
  const remainder = unreconciledRefundCents(payment, alreadyStatedCents);
  return remainder > 0 ? [unreconciledRefundRow(payment, remainder)] : [];
}

/** The reconciliation row for a refund only the order columns know about. */
function unreconciledRefundRow(
  payment: PaymentPresentationSource,
  amountCents: number
): PaymentDisplayRow {
  return {
    id: `${payment.id}:refund:unreconciled`,
    orderId: payment.id,
    kind: 'refund',
    // Its own date when the order carries one. A cash-basis year must file the
    // refund under the year it happened, not the year the charge was made.
    date: payment.refundedAt ?? payment.date,
    showId: payment.showId,
    showName: payment.showName,
    description: 'Refund',
    amountCents: -Math.abs(amountCents),
    currency: payment.currency,
    status: 'refunded',
    reference: payment.reference,
    entryIds: payment.entryIds,
  };
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
        ...appendUnreconciledRefund(payment, payment.amountCents),
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

    const statedRefundCents = refundRows.reduce((sum, row) => sum + Math.abs(row.amountCents), 0);
    return [chargeRow, ...refundRows, ...appendUnreconciledRefund(payment, statedRefundCents)];
  });

  return rows.sort(comparePaymentRowsByDate);
}
