// @vitest-environment node
//
// MYK9-966 worked examples. OWNER RULE (2026-10-03): the platform never covers
// a refund and never refunds its service fee, even when nothing was delivered
// (every class full, a cancelled show). A refund is the entry fees of the
// lines not served, capped at what was paid minus the service fee.
//
// The one exception (owner, 2026-10-04, MYK9-997): a charge the exhibitor got
// NOTHING for and no order records (a paid abandoned cart, a paid payment-link
// session with no link row) is refunded in full, service fee included
// (refundRequests.ts `fullChargeRefundCents`).
//
// The worked example from the issue: 3 lines at $30, 7% fee, exhibitor pays
// $96.30. One line unserved refunds $30.00 (club $60.00, platform keeps
// $6.30); all three unserved refunds $90.00 (platform keeps $6.30).
import { describe, expect, it } from 'vitest';
import { decideCartOverflowRefund } from './cartOverflowRefund';
import { decideEntryPaymentAutoRefund } from './entryPaymentAutoRefund';
import {
  calculatePlatformFeeCents,
  entryFeeRefundCents,
  type PlatformFeeRates,
} from './platformFee';
import { orderTieOutDeltaCents, resolveAcceptedEntrySnapshot } from './orderSnapshot';
import { buildShowRefundPlan, showRefundCreateParams } from './showRefundPlan';
import { refundIsClubFunded } from './orderSnapshot';
import { fullChargeRefundCents } from './refundRequests';

const SHOW_REFUND_METADATA = { show_refund: 'show-1', myk9_club_funded: 'true' };

const RATES: PlatformFeeRates = { percent: 7, flatCents: 0, minCents: 0 };
const LINES = new Map([
  ['a', 3000],
  ['b', 3000],
  ['c', 3000],
]);
const SERVICE_FEE = 630;
const PAID = 9630;

describe('the worked example: 3 lines at $30, 7% fee, $96.30 paid', () => {
  it('prices the way the issue says', () => {
    expect(calculatePlatformFeeCents(9000, RATES)).toBe(SERVICE_FEE);
  });

  it('entryFeeRefundCents: 1 unserved refunds $30.00, all unserved refunds $90.00', () => {
    const one = entryFeeRefundCents({
      unservedEntryFeeCents: 3000,
      fullSubtotalCents: 9000,
      amountTotalCents: PAID,
      rates: RATES,
    });
    const all = entryFeeRefundCents({
      unservedEntryFeeCents: 9000,
      fullSubtotalCents: 9000,
      amountTotalCents: PAID,
      rates: RATES,
    });
    expect(one).toBe(3000);
    expect(all).toBe(9000);
  });

  it('caps at the amount paid minus the service fee when Stripe collected less', () => {
    expect(
      entryFeeRefundCents({
        unservedEntryFeeCents: 9000,
        fullSubtotalCents: 9000,
        amountTotalCents: 9200,
        rates: RATES,
      })
    ).toBe(9200 - SERVICE_FEE);
  });

  it('cart overflow, 1 of 3 unserved: refund $30.00, platform keeps $6.30', () => {
    const decision = decideCartOverflowRefund({
      paymentIntentId: 'pi_1',
      sessionAmountTotalCents: PAID,
      paidLineIds: ['a', 'b'],
      noServiceLineIds: ['c'],
      lineAmountsById: LINES,
      platformFeeRates: RATES,
    });
    expect(decision).toEqual({
      action: 'refund',
      amountCents: 3000,
      paidAmountCents: 6630,
      reason: 'partial_no_service_lines',
    });
    // Club gets 6000, platform keeps the whole 630.
    expect(PAID - 3000 - 6000).toBe(SERVICE_FEE);
  });

  it('cart overflow, all 3 unserved: refund $90.00, platform keeps $6.30', () => {
    const decision = decideCartOverflowRefund({
      paymentIntentId: 'pi_1',
      sessionAmountTotalCents: PAID,
      paidLineIds: [],
      noServiceLineIds: ['a', 'b', 'c'],
      lineAmountsById: LINES,
      platformFeeRates: RATES,
    });
    expect(decision).toEqual({
      action: 'refund',
      amountCents: 9000,
      paidAmountCents: SERVICE_FEE,
      reason: 'full_make_whole',
    });
  });

  it('payment link, 1 of 3 invalid: refund $30.00', () => {
    expect(
      decideEntryPaymentAutoRefund({
        paymentIntentId: 'pi_1',
        sessionAmountTotalCents: PAID,
        validPaidEntryIds: ['a', 'b'],
        invalidEntryIds: ['c'],
        entryFeesById: LINES,
        platformFeeRates: RATES,
      })
    ).toEqual({ action: 'refund', amountCents: 3000, reason: 'partial_invalid_entries' });
  });

  it('payment link, all 3 invalid: refund $90.00, never the whole charge', () => {
    expect(
      decideEntryPaymentAutoRefund({
        paymentIntentId: 'pi_1',
        sessionAmountTotalCents: PAID,
        validPaidEntryIds: [],
        invalidEntryIds: ['a', 'b', 'c'],
        entryFeesById: LINES,
        platformFeeRates: RATES,
      })
    ).toEqual({ action: 'refund', amountCents: 9000, reason: 'full_make_whole' });
  });

  it('payment link, all invalid but a fee is unknown: asks for a manual amount', () => {
    expect(
      decideEntryPaymentAutoRefund({
        paymentIntentId: 'pi_1',
        sessionAmountTotalCents: PAID,
        validPaidEntryIds: [],
        invalidEntryIds: ['a', 'zzz'],
        entryFeesById: LINES,
        platformFeeRates: RATES,
      })
    ).toEqual({ action: 'needs_manual_amount', missingFeeEntryIds: ['zzz'] });
  });
});

describe('partial-served cart: the order snapshot books the full service fee', () => {
  it('ties out to zero with the entry-fee-only make-whole', () => {
    const snapshot = resolveAcceptedEntrySnapshot(['a', 'b'], LINES, RATES, ['c']);
    expect(snapshot).toEqual({
      status: 'derived',
      entrySubtotalCents: 6000,
      platformFeeCents: SERVICE_FEE,
      missingFeeEntryIds: [],
    });
    expect(
      orderTieOutDeltaCents({
        amount_cents: PAID,
        entry_subtotal_cents: snapshot.entrySubtotalCents,
        platform_fee_cents: snapshot.platformFeeCents,
        make_whole_refunded_cents: 3000,
      })
    ).toBe(0);
  });

  it('nothing served: books the whole service fee as kept, still ties out', () => {
    const snapshot = resolveAcceptedEntrySnapshot([], LINES, RATES, ['a', 'b', 'c']);
    expect(snapshot).toMatchObject({ entrySubtotalCents: 0, platformFeeCents: SERVICE_FEE });
    expect(
      orderTieOutDeltaCents({
        amount_cents: PAID,
        entry_subtotal_cents: snapshot.entrySubtotalCents,
        platform_fee_cents: snapshot.platformFeeCents,
        make_whole_refunded_cents: 9000,
      })
    ).toBe(0);
  });

  it('an unserved line with no known fee makes the fee unverifiable, never guessed', () => {
    expect(resolveAcceptedEntrySnapshot(['a'], LINES, RATES, ['zzz'])).toMatchObject({
      status: 'unverifiable',
      platformFeeCents: null,
      missingFeeEntryIds: ['zzz'],
    });
  });
});

describe('cancelled show with N payments: each refund is that payment’s entry fees', () => {
  const entries = [
    // Payment 1: two $30 entries ($64.20 paid).
    { id: 'e1', intent: 'pi_1', fee: 30 },
    { id: 'e2', intent: 'pi_1', fee: 30 },
    // Payment 2: three $30 entries ($96.30 paid).
    { id: 'e3', intent: 'pi_2', fee: 30 },
    { id: 'e4', intent: 'pi_2', fee: 30 },
    { id: 'e5', intent: 'pi_2', fee: 30 },
    // Payment 3: one $27.50 entry.
    { id: 'e6', intent: 'pi_3', fee: 27.5 },
  ].map(e => ({
    id: e.id,
    entry_fee: e.fee,
    payment_method: 'online',
    payment_status: 'paid',
    refund_amount: 0,
    stripe_payment_intent_id: e.intent,
  }));

  it('passes an explicit entry-fee amount per PaymentIntent, never the full charge', () => {
    const plan = buildShowRefundPlan(entries);
    const params = plan.intents.map(group => showRefundCreateParams(group, 'show-1'));
    expect(params).toEqual([
      { payment_intent: 'pi_1', amount: 6000, metadata: SHOW_REFUND_METADATA },
      { payment_intent: 'pi_2', amount: 9000, metadata: SHOW_REFUND_METADATA },
      { payment_intent: 'pi_3', amount: 2750, metadata: SHOW_REFUND_METADATA },
    ]);
    // MYK9-997: the club funds a show-cancellation refund (its payout is
    // docked), so the refund is marked club-funded for platform income.
    expect(params.every(p => refundIsClubFunded(p))).toBe(true);
  });
});

describe('MYK9-997: only a charge that bought nothing is refunded in full', () => {
  it('an abandoned 3210 charge refunds 3210; the same lines refunded normally keep the 210 fee', () => {
    const rates: PlatformFeeRates = { percent: 7, flatCents: 0, minCents: 0 };
    // Order-less: the exhibitor got nothing, so the request is the whole charge.
    expect(fullChargeRefundCents(3210)).toBe(3210);
    // A normal refund of the same 3000 of entries (change of mind, a full
    // class, a cancelled show) still returns the entry fees only.
    expect(
      entryFeeRefundCents({
        unservedEntryFeeCents: 3000,
        fullSubtotalCents: 3000,
        amountTotalCents: 3210,
        rates,
      })
    ).toBe(3000);
  });
});
