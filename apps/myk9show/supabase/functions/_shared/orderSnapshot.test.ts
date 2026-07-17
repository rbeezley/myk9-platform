import { describe, it, expect } from 'vitest';
import {
  buildOrderSnapshotFields,
  deriveEntryFeeFromTotalCents,
  extractProcessingFeeCents,
  platformGrossFeeCents,
  platformNetIncomeCents,
} from './orderSnapshot';

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
    });
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

  it('also subtracts a refunded platform fee', () => {
    expect(
      platformNetIncomeCents(
        { platform_fee_cents: 700, stripe_processing_fee_cents: 320 },
        { refundedPlatformFeeCents: 700 }
      )
    ).toEqual({ status: 'available', netCents: -320 });
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
