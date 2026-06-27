import { describe, it, expect } from 'vitest';
import { buildShowRefundPlan, type ShowRefundEntry } from './showRefundPlan.ts';

function entry(overrides: Partial<ShowRefundEntry> = {}): ShowRefundEntry {
  return {
    id: 'e1',
    entry_fee: 50,
    payment_method: 'online',
    payment_status: 'paid',
    refund_amount: null,
    stripe_payment_intent_id: 'pi_1',
    ...overrides,
  };
}

describe('buildShowRefundPlan', () => {
  it('groups refundable online-paid entries by payment intent', () => {
    const plan = buildShowRefundPlan([
      entry({ id: 'a', stripe_payment_intent_id: 'pi_1', entry_fee: 50 }),
      entry({ id: 'b', stripe_payment_intent_id: 'pi_1', entry_fee: 30 }),
      entry({ id: 'c', stripe_payment_intent_id: 'pi_2', entry_fee: 40 }),
    ]);
    expect(plan.skipped).toEqual([]);
    expect(plan.intents).toHaveLength(2);

    const pi1 = plan.intents.find(i => i.paymentIntentId === 'pi_1')!;
    expect(pi1.entryIds.sort()).toEqual(['a', 'b']);
    // Each entry is stamped with its OWN fee (not the intent total) so the
    // payout cron zeroes the club's share per entry.
    expect(pi1.stampByEntry).toEqual({ a: 50, b: 30 });
    expect(pi1.entryFeeSubtotalCents).toBe(8000);

    const pi2 = plan.intents.find(i => i.paymentIntentId === 'pi_2')!;
    expect(pi2.entryIds).toEqual(['c']);
    expect(pi2.stampByEntry).toEqual({ c: 40 });
  });

  it('skips offline-paid entries with reason offline_paid', () => {
    const plan = buildShowRefundPlan([
      entry({ id: 'cash', payment_method: 'cash' }),
      entry({ id: 'check', payment_method: 'check' }),
    ]);
    expect(plan.intents).toEqual([]);
    expect(plan.skipped).toEqual([
      { entryId: 'cash', reason: 'offline_paid' },
      { entryId: 'check', reason: 'offline_paid' },
    ]);
  });

  it('skips already-refunded entries (status refunded OR refund_amount > 0)', () => {
    const plan = buildShowRefundPlan([
      entry({ id: 'byStatus', payment_status: 'refunded' }),
      entry({ id: 'byAmount', refund_amount: 25 }),
    ]);
    expect(plan.intents).toEqual([]);
    expect(plan.skipped).toEqual([
      { entryId: 'byStatus', reason: 'already_refunded' },
      { entryId: 'byAmount', reason: 'already_refunded' },
    ]);
  });

  it('skips unpaid entries with reason not_paid', () => {
    const plan = buildShowRefundPlan([entry({ id: 'pending', payment_status: 'pending' })]);
    expect(plan.intents).toEqual([]);
    expect(plan.skipped).toEqual([{ entryId: 'pending', reason: 'not_paid' }]);
  });

  it('skips online-paid entries missing a payment intent', () => {
    const plan = buildShowRefundPlan([entry({ id: 'nointent', stripe_payment_intent_id: null })]);
    expect(plan.intents).toEqual([]);
    expect(plan.skipped).toEqual([{ entryId: 'nointent', reason: 'no_payment_intent' }]);
  });

  it('skips zero-fee entries (nothing to refund)', () => {
    const plan = buildShowRefundPlan([entry({ id: 'free', entry_fee: 0 })]);
    expect(plan.intents).toEqual([]);
    expect(plan.skipped).toEqual([{ entryId: 'free', reason: 'zero_fee' }]);
  });

  it('classification order: offline beats already-refunded beats not-paid', () => {
    // An offline + refunded + pending entry reports the FIRST (clearest) reason.
    const plan = buildShowRefundPlan([
      entry({
        id: 'multi',
        payment_method: 'cash',
        payment_status: 'refunded',
        refund_amount: 10,
      }),
    ]);
    expect(plan.skipped).toEqual([{ entryId: 'multi', reason: 'offline_paid' }]);
  });

  it('mixes refundable and skipped in one pass', () => {
    const plan = buildShowRefundPlan([
      entry({ id: 'good', stripe_payment_intent_id: 'pi_x', entry_fee: 60 }),
      entry({ id: 'cash', payment_method: 'cash' }),
      entry({ id: 'done', refund_amount: 60 }),
    ]);
    expect(plan.intents).toHaveLength(1);
    expect(plan.intents[0].entryIds).toEqual(['good']);
    expect(plan.skipped).toEqual([
      { entryId: 'cash', reason: 'offline_paid' },
      { entryId: 'done', reason: 'already_refunded' },
    ]);
  });

  it('taints the whole intent when a sibling on it is already refunded (review #974 #1)', () => {
    // A refundable entry sharing a PaymentIntent with an already-refunded entry
    // must NOT be refunded in bulk — refunding the full intent then stamping
    // only the sibling would leave the club overpaid for the refunded one.
    const plan = buildShowRefundPlan([
      entry({ id: 'refunded', stripe_payment_intent_id: 'pi_shared', refund_amount: 30 }),
      entry({ id: 'sibling', stripe_payment_intent_id: 'pi_shared', entry_fee: 50 }),
      entry({ id: 'clean', stripe_payment_intent_id: 'pi_solo', entry_fee: 40 }),
    ]);
    // Only the untainted intent is refundable.
    expect(plan.intents).toHaveLength(1);
    expect(plan.intents[0].paymentIntentId).toBe('pi_solo');
    expect(plan.intents[0].entryIds).toEqual(['clean']);
    // The refunded entry and its tainted sibling are both skipped (distinct reasons).
    expect(plan.skipped).toContainEqual({ entryId: 'refunded', reason: 'already_refunded' });
    expect(plan.skipped).toContainEqual({ entryId: 'sibling', reason: 'intent_partially_refunded' });
  });

  it('handles an empty entry list', () => {
    expect(buildShowRefundPlan([])).toEqual({ intents: [], skipped: [] });
  });
});
