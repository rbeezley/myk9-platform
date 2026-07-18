import { describe, it, expect } from 'vitest';
import {
  buildOrderSnapshotFields,
  deriveEntryFeeFromTotalCents,
  extractProcessingFeeCents,
  platformGrossFeeCents,
  platformNetIncomeCents,
  resolveOrderRefundSplit,
} from './orderSnapshot';
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
// The JS mirrors `record_order_refund_cents`; the DB is the authority.

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
  let split = { makeWholeCents: 0, postHocCents: 0 };

  // issueCartOverflowAutoRefund records the refund it issues, as MAKE-WHOLE:
  // those lines were never accepted.
  if (decision.action === 'refund') {
    split = resolveOrderRefundSplit(split, { makeWholeCents: decision.amountCents });
  }

  return {
    decision,
    amountCents,
    get makeWholeCents() {
      return split.makeWholeCents;
    },
    get postHocCents() {
      return split.postHocCents;
    },
    /** A later charge.refunded delivery, whose amount_refunded is cumulative
     *  across BOTH refund kinds. */
    deliverChargeRefunded(chargeAmountRefundedCents: number) {
      split = resolveOrderRefundSplit(split, { chargeTotalCents: chargeAmountRefundedCents });
      return split;
    },
    /** A make-whole writer landing late (out-of-order delivery). */
    deliverMakeWhole(makeWholeCents: number) {
      split = resolveOrderRefundSplit(split, { makeWholeCents });
      return split;
    },
    get collectedCents() {
      return amountCents - split.makeWholeCents - split.postHocCents;
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

    // The charge.refunded delivery for that same refund must not re-subtract it,
    // nor reattribute it as a post-hoc loss.
    order.deliverChargeRefunded(5000);
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

    order.deliverChargeRefunded(1000);
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

    // Exhibitor later withdraws e1: Stripe's cumulative amount_refunded is 2000
    // — 1000 make-whole (already recorded) + 1000 genuine post-hoc.
    order.deliverChargeRefunded(2000);
    // An order carrying BOTH kinds attributes each correctly. Only the 1000
    // post-hoc portion is a platform loss; the make-whole 1000 is not.
    expect(order.makeWholeCents).toBe(1000);
    expect(order.postHocCents).toBe(1000);
    expect(order.collectedCents).toBe(2000);
  });
});

describe('resolveOrderRefundSplit (mirrors record_order_refund_cents)', () => {
  it('routes a make-whole refund to make_whole ONLY, never post-hoc', () => {
    expect(resolveOrderRefundSplit({}, { makeWholeCents: 2500 })).toEqual({
      makeWholeCents: 2500,
      postHocCents: 0,
    });
  });

  it('routes a post-hoc charge total to refunded_cents ONLY', () => {
    expect(resolveOrderRefundSplit({}, { chargeTotalCents: 3000 })).toEqual({
      makeWholeCents: 0,
      postHocCents: 3000,
    });
  });

  it('derives post-hoc as total − make_whole, so make-whole is never double counted', () => {
    const afterMakeWhole = resolveOrderRefundSplit({}, { makeWholeCents: 1000 });
    // Stripe reports ONE cumulative total covering both kinds.
    const afterCharge = resolveOrderRefundSplit(afterMakeWhole, { chargeTotalCents: 3500 });
    expect(afterCharge).toEqual({ makeWholeCents: 1000, postHocCents: 2500 });
  });

  it('is idempotent under duplicate webhook delivery', () => {
    const first = resolveOrderRefundSplit({}, { makeWholeCents: 1000 });
    const second = resolveOrderRefundSplit(first, { chargeTotalCents: 3500 });
    const dupCharge = resolveOrderRefundSplit(second, { chargeTotalCents: 3500 });
    const dupMakeWhole = resolveOrderRefundSplit(dupCharge, { makeWholeCents: 1000 });
    expect(dupCharge).toEqual(second);
    expect(dupMakeWhole).toEqual(second);
  });

  it('converges under OUT-OF-ORDER delivery: charge.refunded before its make-whole writer', () => {
    // charge.refunded lands first — provisionally booked as post-hoc.
    const provisional = resolveOrderRefundSplit({}, { chargeTotalCents: 2500 });
    expect(provisional).toEqual({ makeWholeCents: 0, postHocCents: 2500 });
    // The make-whole writer catches up: REATTRIBUTED, not added on top.
    const settled = resolveOrderRefundSplit(provisional, { makeWholeCents: 2500 });
    expect(settled).toEqual({ makeWholeCents: 2500, postHocCents: 0 });
  });

  it('never lowers a recorded value when a stale/smaller delivery arrives', () => {
    const stored = { makeWholeCents: 1000, postHocCents: 2500 };
    // Stale cumulative totals and a zero make-whole must not roll anything back.
    expect(resolveOrderRefundSplit(stored, { chargeTotalCents: 1 })).toEqual(stored);
    expect(resolveOrderRefundSplit(stored, { chargeTotalCents: 0 })).toEqual(stored);
    expect(resolveOrderRefundSplit(stored, { makeWholeCents: 0 })).toEqual(stored);
    expect(resolveOrderRefundSplit(stored, { makeWholeCents: 500 })).toEqual(stored);
  });

  it('keeps post-hoc >= 0 when a make-whole exceeds the last-seen charge total', () => {
    // The make-whole writer ran but charge.refunded never arrived.
    expect(resolveOrderRefundSplit({ postHocCents: 100 }, { makeWholeCents: 5000 })).toEqual({
      makeWholeCents: 5000,
      postHocCents: 0,
    });
  });

  it('treats null/undefined/invalid/negative as 0 rather than corrupting money math', () => {
    expect(resolveOrderRefundSplit({}, {})).toEqual({ makeWholeCents: 0, postHocCents: 0 });
    expect(resolveOrderRefundSplit({ makeWholeCents: null, postHocCents: undefined }, {})).toEqual({
      makeWholeCents: 0,
      postHocCents: 0,
    });
    expect(resolveOrderRefundSplit({}, { chargeTotalCents: Number.NaN })).toEqual({
      makeWholeCents: 0,
      postHocCents: 0,
    });
    expect(resolveOrderRefundSplit({}, { makeWholeCents: -100 })).toEqual({
      makeWholeCents: 0,
      postHocCents: 0,
    });
  });

  it('rounds fractional cents to integers', () => {
    expect(resolveOrderRefundSplit({}, { chargeTotalCents: 1000.4 }).postHocCents).toBe(1000);
  });
});

describe('deriveEntryFeeFromTotalCents', () => {
  it('splits a total back into subtotal and fee at the applied rate', () => {
    // subtotal 10000 + 7% fee 700 = total 10700 -> back to 10000 / 700
    expect(deriveEntryFeeFromTotalCents(10700, 7)).toEqual({
      entrySubtotalCents: 10000,
      platformFeeCents: 700,
    });
  });

  it('returns the full total as subtotal with 0 fee when the rate is 0', () => {
    expect(deriveEntryFeeFromTotalCents(10000, 0)).toEqual({
      entrySubtotalCents: 10000,
      platformFeeCents: 0,
    });
  });

  it('returns zeros for a non-positive total', () => {
    expect(deriveEntryFeeFromTotalCents(0, 7)).toEqual({
      entrySubtotalCents: 0,
      platformFeeCents: 0,
    });
    expect(deriveEntryFeeFromTotalCents(null, 7)).toEqual({
      entrySubtotalCents: 0,
      platformFeeCents: 0,
    });
  });

  it('conserves the total (subtotal + fee === total)', () => {
    const { entrySubtotalCents, platformFeeCents } = deriveEntryFeeFromTotalCents(12345, 7);
    expect(entrySubtotalCents + platformFeeCents).toBe(12345);
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
