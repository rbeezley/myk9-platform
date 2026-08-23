import { describe, expect, it } from 'vitest';
import { reconcileEntryPaymentUpdateOutcome } from './entryPaymentUpdateReconcile';

describe('reconcileEntryPaymentUpdateOutcome', () => {
  it('uses actual successful guarded updates as paid IDs', () => {
    const result = reconcileEntryPaymentUpdateOutcome({
      plannedPatchIds: ['fresh', 'raced-paid'],
      updatedEntryIds: ['fresh'],
      rereadNoOpEntries: [
        {
          id: 'raced-paid',
          payment_status: 'paid',
          entry_status: 'confirmed',
          stripe_payment_intent_id: 'pi_other',
        },
      ],
      initialMissingEntryIds: [],
      initialInactiveEntryIds: [],
      initialAlreadyPaidEntryIds: [],
      initialSameIntentPaidEntryIds: [],
      paymentIntentId: 'pi_123',
      sessionAmountTotalCents: 8500,
      // 7/0/0 — the rates these legacy fixtures were priced with.
      platformFeeRates: { percent: 7, flatCents: 0, minCents: 0 },
      entryFeesById: new Map([
        ['fresh', 4000],
        ['raced-paid', 4000],
      ]),
    });

    expect(result.paidEntryIds).toEqual(['fresh']);
    expect(result.alreadyPaidEntryIds).toEqual(['raced-paid']);
    expect(result.invalidEntryIds).toEqual(['raced-paid']);
    expect(result.refundDecision).toEqual({
      action: 'refund',
      amountCents: 4250,
      reason: 'partial_invalid_entries',
    });
  });

  it('treats a deleted no-op patch as missing and full make-whole refund when nothing was stamped paid', () => {
    const result = reconcileEntryPaymentUpdateOutcome({
      plannedPatchIds: ['deleted'],
      updatedEntryIds: [],
      rereadNoOpEntries: [],
      initialMissingEntryIds: [],
      initialInactiveEntryIds: [],
      initialAlreadyPaidEntryIds: [],
      initialSameIntentPaidEntryIds: [],
      paymentIntentId: 'pi_deleted',
      sessionAmountTotalCents: 4250,
      // 7/0/0 — the rates these legacy fixtures were priced with.
      platformFeeRates: { percent: 7, flatCents: 0, minCents: 0 },
      entryFeesById: new Map([['deleted', 4000]]),
    });

    expect(result.paidEntryIds).toEqual([]);
    expect(result.missingEntryIds).toEqual(['deleted']);
    expect(result.invalidEntryIds).toEqual(['deleted']);
    expect(result.refundDecision).toEqual({
      action: 'refund',
      amountCents: 4250,
      reason: 'full_make_whole',
    });
  });

  it('treats an inactive no-op patch as invalid instead of paid', () => {
    const result = reconcileEntryPaymentUpdateOutcome({
      plannedPatchIds: ['withdrawn'],
      updatedEntryIds: [],
      rereadNoOpEntries: [
        { id: 'withdrawn', payment_status: 'pending', entry_status: 'withdrawn' },
      ],
      initialMissingEntryIds: [],
      initialInactiveEntryIds: [],
      initialAlreadyPaidEntryIds: [],
      initialSameIntentPaidEntryIds: [],
      paymentIntentId: 'pi_withdrawn',
      sessionAmountTotalCents: 4250,
      // 7/0/0 — the rates these legacy fixtures were priced with.
      platformFeeRates: { percent: 7, flatCents: 0, minCents: 0 },
      entryFeesById: new Map([['withdrawn', 4000]]),
    });

    expect(result.paidEntryIds).toEqual([]);
    expect(result.inactiveEntryIds).toEqual(['withdrawn']);
    expect(result.refundDecision).toEqual({
      action: 'refund',
      amountCents: 4250,
      reason: 'full_make_whole',
    });
  });

  it('treats no-op rows already paid by this same intent as valid paid entries, not refund candidates', () => {
    const result = reconcileEntryPaymentUpdateOutcome({
      plannedPatchIds: ['same-intent'],
      updatedEntryIds: [],
      rereadNoOpEntries: [
        {
          id: 'same-intent',
          payment_status: 'paid',
          entry_status: 'confirmed',
          stripe_payment_intent_id: 'pi_123',
        },
      ],
      initialMissingEntryIds: [],
      initialInactiveEntryIds: [],
      initialAlreadyPaidEntryIds: [],
      initialSameIntentPaidEntryIds: [],
      paymentIntentId: 'pi_123',
      sessionAmountTotalCents: 4250,
      // 7/0/0 — the rates these legacy fixtures were priced with.
      platformFeeRates: { percent: 7, flatCents: 0, minCents: 0 },
      entryFeesById: new Map([['same-intent', 4000]]),
    });

    expect(result.paidEntryIds).toEqual(['same-intent']);
    expect(result.sameIntentPaidEntryIds).toEqual(['same-intent']);
    expect(result.alreadyPaidEntryIds).toEqual([]);
    expect(result.invalidEntryIds).toEqual([]);
    expect(result.refundDecision).toEqual({ action: 'none' });
  });
});

/**
 * MYK9-197 adversarial review round 2, S-1.
 *
 * This function is the ONLY thing carrying the stamped fee rates from
 * stripe-webhook into `decideEntryPaymentAutoRefund`. Every fixture above runs
 * at 7/0/0, where discarding that argument is indistinguishable from honouring
 * it — so two mutants (`platformFeeRates: {7,0,0}` and
 * `{...input.platformFeeRates, flatCents: 0, minCents: 0}`) passed all 471
 * tests of the edge suite while refunding $13.00 of floor income per order.
 *
 * ── THE TRAP: A FLAT-ONLY FIXTURE WOULD NOT CATCH IT ──────────────────────
 * `makeWholeRefundCents` uses `fee(full) − fee(accepted)`, and while the floor
 * does not bind that is
 *     (round(full×p/100) + flat) − (round(acc×p/100) + flat)
 * — the flat CANCELS. Swept over non-degenerate splits (0 < accepted < full),
 * a flat-only configuration discriminates in 0 of 7275 cases; a binding floor
 * discriminates in 4820. So only a floor fixture can hold this seam.
 * Do not "simplify" these to a flat, and do not drop them to 7/0/0.
 */
describe('reconcileEntryPaymentUpdateOutcome forwards the STAMPED rates, floor included', () => {
  const withdrawnNoOp = {
    id: 'withdrawn',
    payment_status: 'paid',
    entry_status: 'confirmed',
    stripe_payment_intent_id: 'pi_other',
  };

  it('refunds only the fee the invalid entries caused, under a binding floor', () => {
    // $300 subtotal, $100 accepted / $200 invalid, floor $20.
    //   fee(30000) = max(2100, 2000) = 2100   → amount 32100
    //   fee(10000) = max(700,  2000) = 2000   → the floor binds on the accepted side
    //   refund = 20000 + (2100 − 2000) = 20100, and the platform keeps 2000.
    // Dropping the floor gives fee(10000) = 700, refund 21400 — $13.00 of the
    // platform's own floor income handed back, and the tie-out off by 1300¢.
    const result = reconcileEntryPaymentUpdateOutcome({
      plannedPatchIds: ['served', 'withdrawn'],
      updatedEntryIds: ['served'],
      rereadNoOpEntries: [withdrawnNoOp],
      initialMissingEntryIds: [],
      initialInactiveEntryIds: [],
      initialAlreadyPaidEntryIds: [],
      initialSameIntentPaidEntryIds: [],
      paymentIntentId: 'pi_floor',
      sessionAmountTotalCents: 32_100,
      platformFeeRates: { percent: 7, flatCents: 0, minCents: 2000 },
      entryFeesById: new Map([
        ['served', 10_000],
        ['withdrawn', 20_000],
      ]),
    });

    expect(result.invalidEntryIds).toEqual(['withdrawn']);
    expect(result.refundDecision).toEqual({
      action: 'refund',
      amountCents: 20_100,
      reason: 'partial_invalid_entries',
    });
    // The number a rate-dropping regression produces, pinned so the assertion
    // above cannot drift toward it by accident.
    expect(result.refundDecision).not.toMatchObject({ amountCents: 21_400 });
  });

  it('keeps the whole floor when it binds on BOTH sides of the split', () => {
    // Two $1 entries under a $20 floor: fee(200) === fee(100) === 2000, so the
    // invalid entry caused no fee at all and only its own $1 comes back.
    const result = reconcileEntryPaymentUpdateOutcome({
      plannedPatchIds: ['served', 'withdrawn'],
      updatedEntryIds: ['served'],
      rereadNoOpEntries: [withdrawnNoOp],
      initialMissingEntryIds: [],
      initialInactiveEntryIds: [],
      initialAlreadyPaidEntryIds: [],
      initialSameIntentPaidEntryIds: [],
      paymentIntentId: 'pi_floor_both',
      sessionAmountTotalCents: 2_200,
      platformFeeRates: { percent: 7, flatCents: 0, minCents: 2000 },
      entryFeesById: new Map([
        ['served', 100],
        ['withdrawn', 100],
      ]),
    });

    expect(result.refundDecision).toEqual({
      action: 'refund',
      amountCents: 100,
      reason: 'partial_invalid_entries',
    });
  });

  it('carries the flat component through too, where the floor also binds', () => {
    // Flat alone cancels out of the difference, so it can only be OBSERVED in a
    // configuration where the floor decides the accepted-side fee.
    //   fee(30000) = max(2100 + 30, 2000) = 2130  → amount 32130
    //   fee(10000) = max(700  + 30, 2000) = 2000
    //   refund = 20000 + 130 = 20130
    const result = reconcileEntryPaymentUpdateOutcome({
      plannedPatchIds: ['served', 'withdrawn'],
      updatedEntryIds: ['served'],
      rereadNoOpEntries: [withdrawnNoOp],
      initialMissingEntryIds: [],
      initialInactiveEntryIds: [],
      initialAlreadyPaidEntryIds: [],
      initialSameIntentPaidEntryIds: [],
      paymentIntentId: 'pi_flat_floor',
      sessionAmountTotalCents: 32_130,
      platformFeeRates: { percent: 7, flatCents: 30, minCents: 2000 },
      entryFeesById: new Map([
        ['served', 10_000],
        ['withdrawn', 20_000],
      ]),
    });

    expect(result.refundDecision).toEqual({
      action: 'refund',
      amountCents: 20_130,
      reason: 'partial_invalid_entries',
    });
  });
});
