// @vitest-environment node
// MYK9-963: a paid cart checkout that created nothing is QUEUED for its full
// charge (service fee included) and never refunded here. The SQL half
// (queue_unfulfilled_charge_refund, the approval guard) is
// supabase/tests/myk9_963_unfulfilled_charge_refund_test.sql.
import { describe, expect, it } from 'vitest';
import {
  cartClassesNotInShowChargeAlert,
  instructsManualRefund,
  noCartChargeAlert,
  paidAmountMismatchChargeAlert,
  staleCheckoutChargeAlert,
  unclaimableCartChargeAlert,
} from './refundAlertCopy';
import type { RefundQueueDeps } from './refundRequests';
import { QUEUE_WRITE_ATTEMPTS } from './refundRequests';
import {
  queueUnfulfilledChargeRefund,
  type UnfulfilledChargeInput,
  type UnfulfilledChargeReason,
} from './unfulfilledChargeRefund';

interface Alert {
  title: string;
  html: string;
  dedupeKey: string;
}

function deps(answers: { data: unknown; error: { message: string } | null }[]) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const alerts: Alert[] = [];
  let i = 0;
  const d: RefundQueueDeps = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      return answers[Math.min(i++, answers.length - 1)];
    },
    alertAdmin: async (title, html, opts) => {
      alerts.push({ title, html, dedupeKey: opts.dedupeKey });
    },
  };
  return { d, calls, alerts };
}

const ROW = {
  outcome: 'queued',
  refund_request_id: 'rr-963',
  request_status: 'pending',
  amount_cents: 3210,
  reason: 'no_cart',
  stripe_payment_intent_id: 'pi_963',
};

const S = 'cs_963';

/** Every reason the webhook queues, with the copy its call site builds. */
const CASES: [UnfulfilledChargeReason, UnfulfilledChargeInput['copy']][] = [
  ['no_cart', noCartChargeAlert({ sessionId: S, cartId: 'cart-1' })],
  [
    'cart_classes_not_in_show',
    cartClassesNotInShowChargeAlert({ sessionId: S, cartId: 'cart-1', missingClassIds: ['c-9'] }),
  ],
  [
    'paid_amount_mismatch',
    paidAmountMismatchChargeAlert({ sessionId: S, chargedCents: 3210, authoritativeCents: 3000 }),
  ],
  [
    'cart_not_claimable',
    unclaimableCartChargeAlert({ sessionId: S, cartId: 'cart-1', cartStatus: 'submitted' }),
  ],
  [
    'stale_checkout',
    staleCheckoutChargeAlert({ sessionId: S, cartId: 'cart-1', staleReason: 'cart changed' }),
  ],
];

function input(
  reason: UnfulfilledChargeReason,
  copy: UnfulfilledChargeInput['copy']
): UnfulfilledChargeInput {
  return {
    sessionId: S,
    paymentIntentId: 'pi_963',
    // Entry fees 3000 + service fee 210: the exhibitor got nothing, so all of it.
    chargedCents: 3210,
    reason,
    cartId: 'cart-1',
    showId: 'show-1',
    detail: { note: 'x' },
    copy,
  };
}

describe('queueUnfulfilledChargeRefund (MYK9-963)', () => {
  it.each(CASES)(
    '%s: queues the FULL charge, service fee included, and alerts into the queue',
    async (reason, copy) => {
      const { d, calls, alerts } = deps([{ data: [{ ...ROW, reason }], error: null }]);
      await expect(queueUnfulfilledChargeRefund(d, input(reason, copy))).resolves.toBe('queued');

      expect(calls).toEqual([
        {
          fn: 'queue_unfulfilled_charge_refund',
          args: {
            p_session_id: S,
            p_payment_intent_id: 'pi_963',
            p_amount_cents: 3210,
            p_reason: reason,
            p_cart_id: 'cart-1',
            p_show_id: 'show-1',
            p_detail: { note: 'x' },
          },
        },
      ]);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].title).toBe(copy.title);
      expect(alerts[0].dedupeKey).toBe('refund-request-rr-963');
      expect(alerts[0].html).toContain('32.10 USD');
      expect(alerts[0].html).toContain('Refunds awaiting approval');
      expect(instructsManualRefund(`${alerts[0].title}. ${alerts[0].html}`)).toBe(false);
    }
  );

  it('never calls anything but the queue RPC (no refund is created here)', async () => {
    const { d, calls } = deps([{ data: [ROW], error: null }]);
    await queueUnfulfilledChargeRefund(d, input(...CASES[0]));
    expect(calls.map(c => c.fn)).toEqual(['queue_unfulfilled_charge_refund']);
  });

  it('already_queued (a redelivery or a lost response) ensures the same alert', async () => {
    const { d, alerts } = deps([{ data: [{ ...ROW, outcome: 'already_queued' }], error: null }]);
    await expect(queueUnfulfilledChargeRefund(d, input(...CASES[0]))).resolves.toBe(
      'already_queued'
    );
    expect(alerts.map(a => a.dedupeKey)).toEqual(['refund-request-rr-963']);
  });

  it('a closed request is not re-announced', async () => {
    const { d, alerts } = deps([
      { data: [{ ...ROW, outcome: 'already_queued', request_status: 'refunded' }], error: null },
    ]);
    await queueUnfulfilledChargeRefund(d, input(...CASES[0]));
    expect(alerts).toEqual([]);
  });

  it.each(['delivered', 'other_request'])('%s: nothing is queued and nothing alerts', async o => {
    const { d, alerts } = deps([
      {
        data: [{ outcome: o, refund_request_id: null, request_status: null, amount_cents: null }],
        error: null,
      },
    ]);
    await expect(queueUnfulfilledChargeRefund(d, input(...CASES[3]))).resolves.toBe(o);
    expect(alerts).toEqual([]);
  });

  it.each([
    ['no payment intent', { paymentIntentId: null }],
    ['no amount', { chargedCents: null }],
    ['a zero amount', { chargedCents: 0 }],
  ])('%s: queues nothing and says how to queue it, never to refund by hand', async (_n, patch) => {
    const { d, calls, alerts } = deps([{ data: [ROW], error: null }]);
    await expect(
      queueUnfulfilledChargeRefund(d, { ...input(...CASES[0]), ...patch })
    ).resolves.toBe('not_queued');
    expect(calls).toEqual([]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].html).toContain('queue_unfulfilled_charge_refund');
    expect(instructsManualRefund(`${alerts[0].title}. ${alerts[0].html}`)).toBe(false);
  });

  it('retries, then THROWS (5xx, Stripe redelivers) when the write cannot be confirmed', async () => {
    const { d, calls, alerts } = deps([{ data: null, error: { message: 'timeout' } }]);
    await expect(queueUnfulfilledChargeRefund(d, input(...CASES[1]))).rejects.toThrow(
      /Stripe will retry/
    );
    expect(calls).toHaveLength(QUEUE_WRITE_ATTEMPTS);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].html).toContain('unfulfilled_charge');
    expect(instructsManualRefund(`${alerts[0].title}. ${alerts[0].html}`)).toBe(false);
  });

  it('an unknown answer is unconfirmed, never success', async () => {
    const { d } = deps([{ data: [{ outcome: 'surprise' }], error: null }]);
    await expect(queueUnfulfilledChargeRefund(d, input(...CASES[2]))).rejects.toThrow();
  });

  it('a retry that lands after a lost response is accepted', async () => {
    const { d, calls } = deps([
      { data: null, error: { message: 'reset' } },
      { data: [{ ...ROW, outcome: 'already_queued' }], error: null },
    ]);
    await expect(queueUnfulfilledChargeRefund(d, input(...CASES[0]))).resolves.toBe(
      'already_queued'
    );
    expect(calls).toHaveLength(2);
  });
});
