import { describe, it, expect } from 'vitest';
import {
  buildOrderSnapshotFields,
  extractProcessingFeeCents,
  ORDER_TIE_OUT_TOLERANCE_CENTS,
  orderTieOutDeltaCents,
  platformGrossFeeCents,
  platformNetIncomeCents,
  resolveAcceptedEntrySnapshot,
  deriveOrderRefundTotals,
  resolveOrderStatusAfterRefund,
  upsertOrderRefund,
  type OrderRefundLedgerRow,
} from './orderSnapshot';
import { decideEntryPaymentAutoRefund } from './entryPaymentAutoRefund';
import { decideCartOverflowRefund } from './cartOverflowRefund';

// ── The collection + attribution invariant, end to end ─────────────────────
// Models exactly what the webhook writes for a cart checkout and asserts that
// `collected = amount_cents − make_whole_refunded_cents − refunded_cents`
// subtracts each refund EXACTLY once, AND that each refund lands in the column
// matching its economics. Regression cover for MYK9-54 review finding A (where
// amount_cents was pre-netted AND the same refund landed in refunded_cents, so
// a fully-invalid cart reported negative collections) and for the conflation
// root fix (make-whole refunds must never read as platform losses).
//
// The JS mirrors the refund LEDGER (`stripe_order_refunds` + the recompute); the
// DB is the authority.

/** What the webhook persists on `stripe_orders` for one cart checkout. */
function simulateCartOrder(input: {
  sessionAmountTotalCents: number;
  paidLineIds: string[];
  noServiceLineIds: string[];
  lineAmountsById: Map<string, number>;
}) {
  const decision = decideCartOverflowRefund({
    paymentIntentId: 'pi_test',
    sessionAmountTotalCents: input.sessionAmountTotalCents,
    paidLineIds: input.paidLineIds,
    noServiceLineIds: input.noServiceLineIds,
    lineAmountsById: input.lineAmountsById,
  });

  // The invariant: amount_cents is the GROSS charge, never pre-netted.
  const amountCents = input.sessionAmountTotalCents;
  let ledger: OrderRefundLedgerRow[] = [];

  // issueCartOverflowAutoRefund books the refund it issues as MAKE-WHOLE at
  // creation time: those lines were never accepted. The Stripe refund id is the
  // ledger primary key.
  if (decision.action === 'refund') {
    ledger = upsertOrderRefund(ledger, {
      refundId: 're_overflow',
      amountCents: decision.amountCents,
      kind: 'make_whole',
    });
  }

  return {
    decision,
    amountCents,
    get makeWholeCents() {
      return deriveOrderRefundTotals(ledger).makeWholeCents;
    },
    get postHocCents() {
      return deriveOrderRefundTotals(ledger).postHocCents;
    },
    /** The charge.refunded sweep, which books every refund object it sees as
     *  post_hoc — an already-booked make-whole refund keeps its kind. */
    deliverChargeRefunded(refunds: Array<{ id: string; amount: number }>) {
      for (const refund of refunds) {
        ledger = upsertOrderRefund(ledger, {
          refundId: refund.id,
          amountCents: refund.amount,
          kind: 'post_hoc',
        });
      }
      return deriveOrderRefundTotals(ledger);
    },
    /** A make-whole writer landing late (out-of-order delivery). */
    deliverMakeWhole(makeWholeCents: number, refundId = 're_overflow') {
      ledger = upsertOrderRefund(ledger, {
        refundId,
        amountCents: makeWholeCents,
        kind: 'make_whole',
      });
      return deriveOrderRefundTotals(ledger);
    },
    /** The status the recompute would stamp for the current ledger. */
    get status() {
      return resolveOrderStatusAfterRefund(
        { status: 'succeeded', amountCents },
        deriveOrderRefundTotals(ledger)
      ).status;
    },
    get collectedCents() {
      const totals = deriveOrderRefundTotals(ledger);
      return amountCents - totals.makeWholeCents - totals.postHocCents;
    },
  };
}

describe('collection invariant: collected = amount − make_whole − post_hoc', () => {
  it('a fully-invalid cart (every line overflows) nets to ZERO collected, never negative', () => {
    const order = simulateCartOrder({
      sessionAmountTotalCents: 5000,
      paidLineIds: [],
      noServiceLineIds: ['item-1', 'item-2'],
      lineAmountsById: new Map([
        ['item-1', 2500],
        ['item-2', 2500],
      ]),
    });

    expect(order.decision).toMatchObject({ action: 'refund', reason: 'full_make_whole' });
    expect(order.amountCents).toBe(5000);
    // Attribution: entirely make-whole. NOT a platform loss.
    expect(order.makeWholeCents).toBe(5000);
    expect(order.postHocCents).toBe(0);
    expect(order.collectedCents).toBe(0);

    // The charge.refunded sweep sees that same refund object and books it as
    // post_hoc; the upsert must not re-subtract it nor demote its kind.
    order.deliverChargeRefunded([{ id: 're_overflow', amount: 5000 }]);
    expect(order.makeWholeCents).toBe(5000);
    expect(order.postHocCents).toBe(0);
    expect(order.collectedCents).toBe(0);
    expect(order.collectedCents).toBeGreaterThanOrEqual(0);
  });

  it('a partial overflow refund is subtracted EXACTLY once', () => {
    // 4 lines at 1000¢; 1 overflows. Session total 4000¢.
    const order = simulateCartOrder({
      sessionAmountTotalCents: 4000,
      paidLineIds: ['e1', 'e2', 'e3'],
      noServiceLineIds: ['item-4'],
      lineAmountsById: new Map([
        ['e1', 1000],
        ['e2', 1000],
        ['e3', 1000],
        ['item-4', 1000],
      ]),
    });

    expect(order.decision).toMatchObject({
      action: 'refund',
      amountCents: 1000,
      paidAmountCents: 3000,
      reason: 'partial_no_service_lines',
    });
    expect(order.amountCents).toBe(4000);
    expect(order.makeWholeCents).toBe(1000);
    expect(order.postHocCents).toBe(0);
    // Exactly the three paid lines' worth — not 2000 (double-subtracted).
    expect(order.collectedCents).toBe(3000);

    order.deliverChargeRefunded([{ id: 're_overflow', amount: 1000 }]);
    expect(order.makeWholeCents).toBe(1000);
    expect(order.postHocCents).toBe(0);
    expect(order.collectedCents).toBe(3000);
  });

  it('a cart with no overflow collects the full charge', () => {
    const order = simulateCartOrder({
      sessionAmountTotalCents: 3000,
      paidLineIds: ['e1', 'e2'],
      noServiceLineIds: [],
      lineAmountsById: new Map([
        ['e1', 1500],
        ['e2', 1500],
      ]),
    });

    expect(order.decision.action).toBe('none');
    expect(order.makeWholeCents).toBe(0);
    expect(order.postHocCents).toBe(0);
    expect(order.collectedCents).toBe(3000);
  });

  it('a later genuine refund still subtracts, on top of the overflow refund', () => {
    const order = simulateCartOrder({
      sessionAmountTotalCents: 4000,
      paidLineIds: ['e1', 'e2', 'e3'],
      noServiceLineIds: ['item-4'],
      lineAmountsById: new Map([
        ['e1', 1000],
        ['e2', 1000],
        ['e3', 1000],
        ['item-4', 1000],
      ]),
    });

    // Exhibitor later withdraws e1: the charge now carries TWO refund objects —
    // the make-whole one already booked, plus a genuine post-hoc 1000.
    order.deliverChargeRefunded([
      { id: 're_overflow', amount: 1000 },
      { id: 're_withdrawal', amount: 1000 },
    ]);
    // An order carrying BOTH kinds attributes each correctly. Only the 1000
    // post-hoc portion is a platform loss; the make-whole 1000 is not.
    expect(order.makeWholeCents).toBe(1000);
    expect(order.postHocCents).toBe(1000);
    expect(order.collectedCents).toBe(2000);
  });
});

describe('payment-link snapshot: derived from ACCEPTED entries (finding 2)', () => {
  // Session: 3 entries at 1000¢ + 7% platform fee 210¢ = 3210¢ charged.
  // Only e1 and e2 are accepted; e3 was already paid, so its share is refunded.
  const entryFeesById = new Map([
    ['e1', 1000],
    ['e2', 1000],
    ['e3', 1000],
  ]);
  const sessionTotal = 3210;

  it('excludes never-accepted lines from the subtotal and the platform fee', () => {
    const snapshot = resolveAcceptedEntrySnapshot(['e1', 'e2'], entryFeesById, 7);
    expect(snapshot).toEqual({
      status: 'derived',
      entrySubtotalCents: 2000,
      platformFeeCents: 140,
      missingFeeEntryIds: [],
    });
    // The old total-derived split billed the platform fee on all three lines.
    expect(snapshot.platformFeeCents).toBeLessThan(210);
  });

  it('ties out against the actual make-whole refund when some lines are invalid', () => {
    const snapshot = resolveAcceptedEntrySnapshot(['e1', 'e2'], entryFeesById, 7);
    const decision = decideEntryPaymentAutoRefund({
      paymentIntentId: 'pi_1',
      sessionAmountTotalCents: sessionTotal,
      validPaidEntryIds: ['e1', 'e2'],
      invalidEntryIds: ['e3'],
      entryFeesById,
    });
    expect(decision).toMatchObject({ action: 'refund', reason: 'partial_invalid_entries' });
    const makeWhole = decision.action === 'refund' ? decision.amountCents : 0;
    const delta = orderTieOutDeltaCents({
      amount_cents: sessionTotal,
      entry_subtotal_cents: snapshot.entrySubtotalCents,
      platform_fee_cents: snapshot.platformFeeCents,
      make_whole_refunded_cents: makeWhole,
    });
    expect(Math.abs(delta ?? Number.NaN)).toBeLessThanOrEqual(ORDER_TIE_OUT_TOLERANCE_CENTS);
  });

  it('is NOT a tautology: a bogus subtotal fails the tie-out', () => {
    // The old derivation made amount == subtotal + fee true by construction, so
    // no order could ever fail. This one can.
    const delta = orderTieOutDeltaCents({
      amount_cents: sessionTotal,
      entry_subtotal_cents: 3000,
      platform_fee_cents: 210,
      make_whole_refunded_cents: 1070,
    });
    expect(Math.abs(delta ?? 0)).toBeGreaterThan(ORDER_TIE_OUT_TOLERANCE_CENTS);
  });

  it('ties out exactly when nothing was refunded', () => {
    const snapshot = resolveAcceptedEntrySnapshot(['e1', 'e2', 'e3'], entryFeesById, 7);
    expect(snapshot.entrySubtotalCents).toBe(3000);
    expect(snapshot.platformFeeCents).toBe(210);
    expect(
      orderTieOutDeltaCents({
        amount_cents: sessionTotal,
        entry_subtotal_cents: snapshot.entrySubtotalCents,
        platform_fee_cents: snapshot.platformFeeCents,
        make_whole_refunded_cents: 0,
      })
    ).toBe(0);
  });

  it('reports UNVERIFIABLE (NULL columns) rather than guessing a missing fee', () => {
    expect(resolveAcceptedEntrySnapshot(['e1', 'e9'], entryFeesById, 7)).toEqual({
      status: 'unverifiable',
      entrySubtotalCents: null,
      platformFeeCents: null,
      missingFeeEntryIds: ['e9'],
    });
  });

  it('records a known ZERO when nothing was accepted (whole charge is make-whole)', () => {
    expect(resolveAcceptedEntrySnapshot([], entryFeesById, 7)).toMatchObject({
      status: 'derived',
      entrySubtotalCents: 0,
      platformFeeCents: 0,
    });
  });

  it('returns null (not checkable) for legacy rows with NULL snapshot columns', () => {
    expect(
      orderTieOutDeltaCents({
        amount_cents: 1000,
        entry_subtotal_cents: null,
        platform_fee_cents: null,
      })
    ).toBeNull();
  });
});

describe('buildOrderSnapshotFields', () => {
  it('normalizes a complete snapshot into column shape', () => {
    expect(
      buildOrderSnapshotFields({
        entrySubtotalCents: 10000,
        platformFeeCents: 700,
        platformFeeRate: 7,
        stripeProcessingFeeCents: 320,
        refundedCents: 0,
      })
    ).toEqual({
      entry_subtotal_cents: 10000,
      platform_fee_cents: 700,
      platform_fee_rate: 7,
      stripe_processing_fee_cents: 320,
      refunded_cents: 0,
      make_whole_refunded_cents: 0,
    });
  });

  it('keeps the two refund columns independent at insert time', () => {
    const fields = buildOrderSnapshotFields({
      refundedCents: 250,
      makeWholeRefundedCents: 1000,
    });
    expect(fields.refunded_cents).toBe(250);
    expect(fields.make_whole_refunded_cents).toBe(1000);
  });

  it('defaults make_whole_refunded_cents to 0 and never NULL', () => {
    expect(buildOrderSnapshotFields({}).make_whole_refunded_cents).toBe(0);
    expect(
      buildOrderSnapshotFields({ makeWholeRefundedCents: null }).make_whole_refunded_cents
    ).toBe(0);
  });

  it('rounds fractional cents to the nearest integer', () => {
    const fields = buildOrderSnapshotFields({
      entrySubtotalCents: 9999.4,
      platformFeeCents: 699.5,
      stripeProcessingFeeCents: 319.49,
    });
    expect(fields.entry_subtotal_cents).toBe(9999);
    expect(fields.platform_fee_cents).toBe(700);
    expect(fields.stripe_processing_fee_cents).toBe(319);
  });

  it('keeps a missing processing fee as NULL (pending), never zero', () => {
    expect(buildOrderSnapshotFields({}).stripe_processing_fee_cents).toBeNull();
    expect(
      buildOrderSnapshotFields({ stripeProcessingFeeCents: null }).stripe_processing_fee_cents
    ).toBeNull();
    expect(
      buildOrderSnapshotFields({ stripeProcessingFeeCents: undefined }).stripe_processing_fee_cents
    ).toBeNull();
  });

  it('defaults refunded_cents to 0 and never NULL', () => {
    expect(buildOrderSnapshotFields({}).refunded_cents).toBe(0);
    expect(buildOrderSnapshotFields({ refundedCents: null }).refunded_cents).toBe(0);
    expect(buildOrderSnapshotFields({ refundedCents: 500 }).refunded_cents).toBe(500);
  });

  it('clamps negative cent values to 0', () => {
    const fields = buildOrderSnapshotFields({
      platformFeeCents: -5,
      refundedCents: -100,
    });
    expect(fields.platform_fee_cents).toBe(0);
    expect(fields.refunded_cents).toBe(0);
  });

  it('drops a non-finite fee rate to NULL but preserves a valid one', () => {
    expect(buildOrderSnapshotFields({ platformFeeRate: 3 }).platform_fee_rate).toBe(3);
    expect(buildOrderSnapshotFields({ platformFeeRate: NaN }).platform_fee_rate).toBeNull();
    expect(buildOrderSnapshotFields({ platformFeeRate: undefined }).platform_fee_rate).toBeNull();
  });
});

describe('extractProcessingFeeCents', () => {
  it('reads the fee from an expanded balance transaction', () => {
    expect(extractProcessingFeeCents({ balance_transaction: { fee: 320 } })).toBe(320);
  });

  it('returns null for an unexpanded (string id) balance transaction — delayed data', () => {
    expect(extractProcessingFeeCents({ balance_transaction: 'txn_123' })).toBeNull();
  });

  it('returns null when the balance transaction is missing entirely', () => {
    expect(extractProcessingFeeCents({})).toBeNull();
    expect(extractProcessingFeeCents(null)).toBeNull();
    expect(extractProcessingFeeCents({ balance_transaction: null })).toBeNull();
  });

  it('returns null when an expanded transaction has no numeric fee', () => {
    expect(extractProcessingFeeCents({ balance_transaction: { fee: null } })).toBeNull();
  });
});

describe('platformGrossFeeCents', () => {
  it('returns the stored platform fee cents', () => {
    expect(platformGrossFeeCents({ platform_fee_cents: 700 })).toBe(700);
  });

  it('treats a missing platform fee as 0 gross', () => {
    expect(platformGrossFeeCents({ platform_fee_cents: null })).toBe(0);
  });
});

describe('platformNetIncomeCents', () => {
  it('subtracts the captured processing fee from gross', () => {
    expect(
      platformNetIncomeCents({ platform_fee_cents: 700, stripe_processing_fee_cents: 320 })
    ).toEqual({ status: 'available', netCents: 380 });
  });

  it('subtracts the full platform-absorbed refund (can go negative)', () => {
    // No reverse_transfer / refund_application_fee on either refund path, so the
    // platform absorbs the whole customer refund — pass the full refund here.
    expect(
      platformNetIncomeCents(
        { platform_fee_cents: 700, stripe_processing_fee_cents: 320 },
        { absorbedRefundCents: 5250 }
      )
    ).toEqual({ status: 'available', netCents: 700 - 320 - 5250 });
  });

  it('reports pending net (not zero) when the processing fee is missing', () => {
    expect(
      platformNetIncomeCents({ platform_fee_cents: 700, stripe_processing_fee_cents: null })
    ).toEqual({ status: 'pending', grossCents: 700 });
  });

  it('uses the STORED fee values, unaffected by any later fee-rate change', () => {
    // An order charged at 3% stores platform_fee_cents=300. A later raise to 7%
    // must not change this order's gross/net — the helper reads only the stored
    // snapshot, never a current setting.
    const storedAt3Percent = { platform_fee_cents: 300, stripe_processing_fee_cents: 129 };
    expect(platformGrossFeeCents(storedAt3Percent)).toBe(300);
    expect(platformNetIncomeCents(storedAt3Percent)).toEqual({
      status: 'available',
      netCents: 171,
    });
  });
});
