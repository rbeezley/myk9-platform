// @vitest-environment node
/**
 * MYK9-1001 (Codex round 7 on #2772, owner decision 2026-10-05): a payment that
 * settles late on an expired payment link revives the promoted entry ONLY when
 * its offer simply ran out of time. A late payment on an offer the club
 * WITHDREW goes to the refund queue (refund_requests + alert, human approval),
 * like every other paid-got-nothing case.
 */
import { describe, expect, it } from 'vitest';
import { decideExpiredPromotionClaim } from './entryPaymentReconcile';
import { reconcileEntryPaymentUpdateOutcome } from './entryPaymentUpdateReconcile';

describe('decideExpiredPromotionClaim', () => {
  it('revives a claim on an offer that expired, as today', () => {
    expect(
      decideExpiredPromotionClaim({ linkedOfferStatus: 'expired', replacementOffer: 'none' })
    ).toBe('revive');
  });

  it('never revives a claim on an offer the club withdrew, whatever else is true', () => {
    for (const replacementOffer of ['none', 'exists', 'unreadable', 'not_checked'] as const) {
      expect(
        decideExpiredPromotionClaim({ linkedOfferStatus: 'withdrawn', replacementOffer })
      ).toBe('offer_withdrawn');
    }
  });

  it("leaves an exhibitor's decline exactly as today (revives unless a replacement offer exists)", () => {
    expect(
      decideExpiredPromotionClaim({ linkedOfferStatus: 'declined', replacementOffer: 'none' })
    ).toBe('revive');
    expect(
      decideExpiredPromotionClaim({ linkedOfferStatus: 'declined', replacementOffer: 'exists' })
    ).toBe('replacement_offer');
  });

  it('keeps the existing fail-closed answers', () => {
    expect(
      decideExpiredPromotionClaim({ linkedOfferStatus: 'expired', replacementOffer: 'exists' })
    ).toBe('replacement_offer');
    expect(
      decideExpiredPromotionClaim({ linkedOfferStatus: 'unreadable', replacementOffer: 'none' })
    ).toBe('unverified');
    expect(decideExpiredPromotionClaim({ linkedOfferStatus: null, replacementOffer: 'none' })).toBe(
      'unverified'
    );
    expect(
      decideExpiredPromotionClaim({ linkedOfferStatus: 'expired', replacementOffer: 'unreadable' })
    ).toBe('unverified');
  });

  it('needs the replacement-offer check before it can revive', () => {
    expect(
      decideExpiredPromotionClaim({ linkedOfferStatus: 'expired', replacementOffer: 'not_checked' })
    ).toBe('check_replacement');
  });
});

describe('a late payment on a withdrawn offer goes to the refund queue', () => {
  it('leaves the entry promotion-expired and owes its entry fee back for approval', () => {
    // The webhook skips the blocked claim's stamp, so the planned patch is a no-op; the re-read
    // finds the entry still promotion-expired (inactive), the path every unserved charge takes
    // to queue_payment_link_refund.
    const result = reconcileEntryPaymentUpdateOutcome({
      plannedPatchIds: ['withdrawn-entry'],
      updatedEntryIds: [],
      rereadNoOpEntries: [
        {
          id: 'withdrawn-entry',
          payment_status: 'pending',
          entry_status: 'promotion-expired',
          stripe_payment_intent_id: null,
        },
      ],
      initialMissingEntryIds: [],
      initialInactiveEntryIds: [],
      initialAlreadyPaidEntryIds: [],
      initialSameIntentPaidEntryIds: [],
      paymentIntentId: 'pi_late',
      sessionAmountTotalCents: 4280,
      platformFeeRates: { percent: 7, flatCents: 0, minCents: 0 },
      entryFeesById: new Map([['withdrawn-entry', 4000]]),
    });

    expect(result.paidEntryIds).toEqual([]);
    expect(result.inactiveEntryIds).toEqual(['withdrawn-entry']);
    expect(result.invalidEntryIds).toEqual(['withdrawn-entry']);
    expect(result.refundDecision).toEqual({
      action: 'refund',
      amountCents: 4000,
      reason: 'full_make_whole',
    });
  });
});
