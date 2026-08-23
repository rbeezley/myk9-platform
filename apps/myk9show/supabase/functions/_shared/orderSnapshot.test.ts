import { describe, it, expect } from 'vitest';
import {
  buildOrderSnapshotFields,
  extractProcessingFeeCents,
  ORDER_TIE_OUT_TOLERANCE_CENTS,
  orderTieOutDeltaCents,
  platformGrossFeeCents,
  platformNetIncomeCents,
  resolveAcceptedEntrySnapshot,
} from './orderSnapshot';
import type { PlatformFeeRates } from './platformFee';

const RATES_7: PlatformFeeRates = { percent: 7, flatCents: 0, minCents: 0 };
import { decideEntryPaymentAutoRefund } from './entryPaymentAutoRefund';

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
    const snapshot = resolveAcceptedEntrySnapshot(['e1', 'e2'], entryFeesById, RATES_7);
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
    const snapshot = resolveAcceptedEntrySnapshot(['e1', 'e2'], entryFeesById, RATES_7);
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
    const snapshot = resolveAcceptedEntrySnapshot(['e1', 'e2', 'e3'], entryFeesById, RATES_7);
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
    expect(resolveAcceptedEntrySnapshot(['e1', 'e9'], entryFeesById, RATES_7)).toEqual({
      status: 'unverifiable',
      entrySubtotalCents: null,
      platformFeeCents: null,
      missingFeeEntryIds: ['e9'],
    });
  });

  it('records a known ZERO when nothing was accepted (whole charge is make-whole)', () => {
    expect(resolveAcceptedEntrySnapshot([], entryFeesById, RATES_7)).toMatchObject({
      status: 'derived',
      entrySubtotalCents: 0,
      platformFeeCents: 0,
    });
  });

  it('carries the flat per-checkout component into the snapshot fee (MYK9-197)', () => {
    // The flat component was charged once for this checkout, so it belongs on
    // the same side of the tie-out it was charged on. Dropping it would understate
    // platform income by exactly the flat amount on every order.
    const withFlat = resolveAcceptedEntrySnapshot(['e1', 'e2'], entryFeesById, {
      percent: 7,
      flatCents: 30,
      minCents: 0,
    });
    expect(withFlat.platformFeeCents).toBe(140 + 30);
  });

  it('keeps a nothing-accepted order at 0/0 even with a floor configured', () => {
    // No service rendered, so no minimum to take. A floor leaking in here would
    // book fee income on a charge that is entirely make-whole refunded.
    expect(
      resolveAcceptedEntrySnapshot([], entryFeesById, { percent: 7, flatCents: 30, minCents: 500 })
    ).toMatchObject({ entrySubtotalCents: 0, platformFeeCents: 0 });
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
