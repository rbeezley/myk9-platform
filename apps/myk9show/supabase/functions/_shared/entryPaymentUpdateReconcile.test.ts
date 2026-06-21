import { describe, expect, it } from 'vitest';
import { reconcileEntryPaymentUpdateOutcome } from './entryPaymentUpdateReconcile';

describe('reconcileEntryPaymentUpdateOutcome', () => {
  it('uses actual successful guarded updates as paid IDs', () => {
    const result = reconcileEntryPaymentUpdateOutcome({
      plannedPatchIds: ['fresh', 'raced-paid'],
      updatedEntryIds: ['fresh'],
      rereadNoOpEntries: [{ id: 'raced-paid', payment_status: 'paid', entry_status: 'confirmed' }],
      initialMissingEntryIds: [],
      initialInactiveEntryIds: [],
      initialAlreadyPaidEntryIds: [],
      paymentIntentId: 'pi_123',
      sessionAmountTotalCents: 8500,
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
      paymentIntentId: 'pi_deleted',
      sessionAmountTotalCents: 4250,
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
      paymentIntentId: 'pi_withdrawn',
      sessionAmountTotalCents: 4250,
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
});
