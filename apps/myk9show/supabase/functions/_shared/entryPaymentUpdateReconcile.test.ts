// @vitest-environment node
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
      amountCents: 4000,
      reason: 'partial_invalid_entries',
    });
  });

  it('treats a deleted no-op patch as missing and refunds its entry fee (never the service fee) when nothing was stamped paid', () => {
    const result = reconcileEntryPaymentUpdateOutcome({
      plannedPatchIds: ['deleted'],
      updatedEntryIds: [],
      rereadNoOpEntries: [],
      initialMissingEntryIds: [],
      initialInactiveEntryIds: [],
      initialAlreadyPaidEntryIds: [],
      initialSameIntentPaidEntryIds: [],
      paymentIntentId: 'pi_deleted',
      sessionAmountTotalCents: 4280,
      // 7/0/0 — the rates these legacy fixtures were priced with.
      platformFeeRates: { percent: 7, flatCents: 0, minCents: 0 },
      entryFeesById: new Map([['deleted', 4000]]),
    });

    expect(result.paidEntryIds).toEqual([]);
    expect(result.missingEntryIds).toEqual(['deleted']);
    expect(result.invalidEntryIds).toEqual(['deleted']);
    expect(result.refundDecision).toEqual({
      action: 'refund',
      amountCents: 4000,
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
      sessionAmountTotalCents: 4280,
      // 7/0/0 — the rates these legacy fixtures were priced with.
      platformFeeRates: { percent: 7, flatCents: 0, minCents: 0 },
      entryFeesById: new Map([['withdrawn', 4000]]),
    });

    expect(result.paidEntryIds).toEqual([]);
    expect(result.inactiveEntryIds).toEqual(['withdrawn']);
    expect(result.refundDecision).toEqual({
      action: 'refund',
      amountCents: 4000,
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
      sessionAmountTotalCents: 4280,
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
 * MYK9-966: a refund is the invalid entries' fees only, so the stamped rates
 * matter through ONE path: the cap at what was collected minus the service fee.
 * These fixtures under-collect so the cap binds, which is the only place a
 * dropped floor or flat component would change the number.
 */
describe('reconcileEntryPaymentUpdateOutcome forwards the STAMPED rates into the cap', () => {
  const withdrawnNoOp = {
    id: 'withdrawn',
    payment_status: 'paid',
    entry_status: 'confirmed',
    stripe_payment_intent_id: 'pi_other',
  };
  const reconcile = (
    fees: [number, number],
    sessionAmountTotalCents: number,
    platformFeeRates: { percent: number; flatCents: number; minCents: number }
  ) =>
    reconcileEntryPaymentUpdateOutcome({
      plannedPatchIds: ['served', 'withdrawn'],
      updatedEntryIds: ['served'],
      rereadNoOpEntries: [withdrawnNoOp],
      initialMissingEntryIds: [],
      initialInactiveEntryIds: [],
      initialAlreadyPaidEntryIds: [],
      initialSameIntentPaidEntryIds: [],
      paymentIntentId: 'pi_cap',
      sessionAmountTotalCents,
      platformFeeRates,
      entryFeesById: new Map([
        ['served', fees[0]],
        ['withdrawn', fees[1]],
      ]),
    });

  it('refunds the invalid entry fee in full when the charge was collected in full', () => {
    // fee(30000) = max(2100, 2000) = 2100 → amount 32100; refund 20000, platform keeps 2100.
    const result = reconcile([10_000, 20_000], 32_100, {
      percent: 7,
      flatCents: 0,
      minCents: 2000,
    });
    expect(result.invalidEntryIds).toEqual(['withdrawn']);
    expect(result.refundDecision).toEqual({
      action: 'refund',
      amountCents: 20_000,
      reason: 'partial_invalid_entries',
    });
  });

  it('keeps a binding floor before refunding on an under-collection', () => {
    // fee(300) = max(21, 2000) = 2000; collected 2100 → cap 100. Dropping the
    // floor gives cap 2079 and refunds 200, handing $1 of the floor back.
    const result = reconcile([100, 200], 2_100, { percent: 7, flatCents: 0, minCents: 2000 });
    expect(result.refundDecision).toEqual({
      action: 'refund',
      amountCents: 100,
      reason: 'partial_invalid_entries',
    });
  });

  it('keeps the flat component before refunding on an under-collection', () => {
    // fee(30000) = 2100 + 30 = 2130; collected 20100 → cap 17970 (18000 without the flat).
    const result = reconcile([10_000, 20_000], 20_100, { percent: 7, flatCents: 30, minCents: 0 });
    expect(result.refundDecision).toEqual({
      action: 'refund',
      amountCents: 17_970,
      reason: 'partial_invalid_entries',
    });
  });
});
