import { describe, expect, it } from 'vitest';
import { getRefundLabel } from './entryDisplaySelectors';
import {
  buildPaymentDisplayRows,
  isRefundedPaymentStatus,
  type PaymentPresentationRefund,
  type PaymentPresentationSource,
} from '@/features/payments/moneyPresentation';

/**
 * S8.2 parity check (secretary-verification-remediation, task 6.2).
 *
 * Secretary (EntryStatusLine -> getRefundLabel) and exhibitor
 * (ExhibitorPaymentsPage -> useMyPayments -> buildPaymentDisplayRows) both
 * ultimately read the SAME source columns — entries.refund_amount /
 * entries.refunded_at — but through different pipelines: the secretary path
 * reads them directly per entry, while the exhibitor path (useMyPayments)
 * rounds refund_amount (dollars) to cents and folds it into the Stripe
 * order's `refunds` array before buildPaymentDisplayRows renders a synthetic
 * refund row.
 *
 * These fixtures mirror useMyPayments' own rounding (`Math.round(refund_amount
 * * 100)`) so a drift between the two surfaces would show up here, not just
 * in production.
 */

/** Mirrors useMyPayments' entries -> PaymentPresentationRefund conversion. */
function toExhibitorRefund(
  entryId: string,
  refundAmountDollars: number,
  refundedAt: string | null
): PaymentPresentationRefund {
  return {
    entryId,
    amountCents: Math.round(refundAmountDollars * 100),
    date: refundedAt,
    label: 'Novice Containers',
  };
}

function exhibitorRefundRowFor(entryId: string, payment: PaymentPresentationSource) {
  return buildPaymentDisplayRows([payment]).find(
    row => row.kind === 'refund' && row.entryIds.includes(entryId)
  );
}

describe('refund-status parity: secretary vs exhibitor', () => {
  it('agree on a full refund', () => {
    const entryId = 'entry-full';
    const refundAmountDollars = 30;
    const refundedAt = '2026-07-01T00:00:00Z';

    // Secretary: EntryStatusLine -> getRefundLabel
    const secretaryLabel = getRefundLabel({
      paymentStatus: 'refunded',
      refundAmount: refundAmountDollars,
      refundedAt,
    });
    expect(secretaryLabel).toBe('Refunded $30');

    // Exhibitor: ExhibitorPaymentsPage -> buildPaymentDisplayRows
    const payment: PaymentPresentationSource = {
      id: 'order-full',
      date: '2026-06-01T00:00:00Z',
      showId: 'show-1',
      showName: 'Heartland Spring Trial',
      amountCents: 3000,
      currency: 'usd',
      status: 'succeeded',
      reference: 'pi_full',
      entryIds: [entryId],
      refunds: [toExhibitorRefund(entryId, refundAmountDollars, refundedAt)],
    };
    const refundRow = exhibitorRefundRowFor(entryId, payment);

    expect(refundRow).toBeDefined();
    expect(isRefundedPaymentStatus(refundRow!.status)).toBe(true);
    expect(refundRow!.amountCents).toBe(-3000);

    // Parity: both surfaces agree the entry is refunded.
    expect(secretaryLabel !== null).toBe(isRefundedPaymentStatus(refundRow!.status));
  });

  it('agree on a partial refund', () => {
    const entryId = 'entry-partial';
    const refundAmountDollars = 15;
    const refundedAt = '2026-07-02T00:00:00Z';

    const secretaryLabel = getRefundLabel({
      paymentStatus: 'partial_refund',
      refundAmount: refundAmountDollars,
      refundedAt,
    });
    expect(secretaryLabel).toBe('Partial refund $15');

    // A partial entry-level refund leaves the parent order's own status
    // 'succeeded' (see useMyPayments) — the refund still surfaces as its own
    // row via the entry-scoped `refunds` array, not the order status.
    const payment: PaymentPresentationSource = {
      id: 'order-partial',
      date: '2026-06-05T00:00:00Z',
      showId: 'show-1',
      showName: 'Heartland Spring Trial',
      amountCents: 3000,
      currency: 'usd',
      status: 'succeeded',
      reference: 'pi_partial',
      entryIds: [entryId],
      refunds: [toExhibitorRefund(entryId, refundAmountDollars, refundedAt)],
    };
    const refundRow = exhibitorRefundRowFor(entryId, payment);

    expect(refundRow).toBeDefined();
    expect(isRefundedPaymentStatus(refundRow!.status)).toBe(true);
    expect(refundRow!.amountCents).toBe(-1500);

    expect(secretaryLabel !== null).toBe(isRefundedPaymentStatus(refundRow!.status));
  });

  it('agree on a withdrawn + refunded entry', () => {
    const entryId = 'entry-withdrawn';
    const refundAmountDollars = 30;
    const refundedAt = '2026-07-03T00:00:00Z';

    // Secretary composes the refund atom onto the withdrawn status line —
    // getRefundLabel itself is status-agnostic (deriveEntryPresentation
    // appends it), so it still reports the refund atom for a withdrawn entry.
    const secretaryLabel = getRefundLabel({
      paymentStatus: 'refunded',
      refundAmount: refundAmountDollars,
      refundedAt,
    });
    expect(secretaryLabel).toBe('Refunded $30');

    const payment: PaymentPresentationSource = {
      id: 'order-withdrawn',
      date: '2026-06-10T00:00:00Z',
      showId: 'show-1',
      showName: 'Heartland Spring Trial',
      amountCents: 3000,
      currency: 'usd',
      status: 'refunded',
      reference: 'pi_withdrawn',
      entryIds: [entryId],
      refunds: [],
    };
    const refundRow = exhibitorRefundRowFor(entryId, payment);

    expect(refundRow).toBeDefined();
    expect(isRefundedPaymentStatus(refundRow!.status)).toBe(true);
    expect(refundRow!.amountCents).toBe(-3000);

    expect(secretaryLabel !== null).toBe(isRefundedPaymentStatus(refundRow!.status));
  });

  it('agree that a non-refunded, fully-paid entry shows no refund on either side', () => {
    const entryId = 'entry-paid';

    const secretaryLabel = getRefundLabel({
      paymentStatus: 'paid',
      refundAmount: null,
      refundedAt: null,
    });
    expect(secretaryLabel).toBeNull();

    const payment: PaymentPresentationSource = {
      id: 'order-paid',
      date: '2026-06-15T00:00:00Z',
      showId: 'show-1',
      showName: 'Heartland Spring Trial',
      amountCents: 3000,
      currency: 'usd',
      status: 'succeeded',
      reference: 'pi_paid',
      entryIds: [entryId],
      refunds: [],
    };
    const refundRow = exhibitorRefundRowFor(entryId, payment);

    expect(refundRow).toBeUndefined();
    expect(secretaryLabel === null).toBe(refundRow === undefined);
  });
});
