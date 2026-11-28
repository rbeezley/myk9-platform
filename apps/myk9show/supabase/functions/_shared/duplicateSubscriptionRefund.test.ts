// @vitest-environment node
// MYK9-2497: the duplicate-subscription queue helper. It only QUEUES (never a
// refund or a cancel), retries an unconfirmed write, and raises one alert
// keyed on the duplicate subscription with skipEmailOnDuplicate.
import { describe, expect, it } from 'vitest';
import {
  duplicateSubscriptionAlertKey,
  queueDuplicateSubscriptionRefund,
  type DuplicateSubscriptionInput,
} from './duplicateSubscriptionRefund';
import { instructsManualRefund } from './refundAlertCopy';
import type { RefundQueueDeps } from './refundRequests';
import { QUEUE_WRITE_ATTEMPTS } from './refundRequests';

interface Alert {
  title: string;
  html: string;
  opts: Parameters<RefundQueueDeps['alertAdmin']>[2];
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
      alerts.push({ title, html, opts });
    },
  };
  return { d, calls, alerts };
}

const INPUT: DuplicateSubscriptionInput = {
  duplicateSubscriptionId: 'sub_dup',
  keptSubscriptionId: 'sub_kept',
  customerId: 'cus_1',
  sessionId: 'cs_dup',
  paymentIntentId: 'pi_dup',
  amountCents: 4900,
};

const row = (outcome: string, status: string | null = 'pending') => ({
  data: [
    {
      outcome,
      refund_request_id: outcome === 'other_request' ? null : 'rr-1',
      request_status: outcome === 'other_request' ? null : status,
      amount_cents: outcome === 'other_request' ? null : 4900,
      stripe_payment_intent_id: outcome === 'other_request' ? null : 'pi_dup',
      stripe_checkout_session_id: outcome === 'other_request' ? null : 'cs_dup',
    },
  ],
  error: null,
});

describe('queueDuplicateSubscriptionRefund', () => {
  it('queues the first invoice through the RPC and raises one deduped alert', async () => {
    const h = deps([row('queued')]);

    expect(await queueDuplicateSubscriptionRefund(h.d, INPUT)).toBe('queued');

    expect(h.calls).toEqual([
      {
        fn: 'queue_duplicate_subscription_refund',
        args: {
          p_subscription_id: 'sub_dup',
          p_session_id: 'cs_dup',
          p_payment_intent_id: 'pi_dup',
          p_amount_cents: 4900,
          p_detail: { kept_subscription_id: 'sub_kept', stripe_customer_id: 'cus_1' },
        },
      },
    ]);
    expect(h.alerts).toHaveLength(1);
    expect(h.alerts[0].opts).toMatchObject({
      source: 'stripe-webhook',
      dedupeKey: duplicateSubscriptionAlertKey('sub_dup', 'awaiting_approval'),
      skipEmailOnDuplicate: true,
      detail: { refund_request_id: 'rr-1', amount_cents: 4900 },
    });
    expect(h.alerts[0].html).toContain('49.00 USD');
    expect(instructsManualRefund(h.alerts[0].html)).toBe(false);
  });

  it('does not re-announce a closed request', async () => {
    const h = deps([row('already_queued', 'refunded')]);

    expect(await queueDuplicateSubscriptionRefund(h.d, INPUT)).toBe('already_queued');
    expect(h.alerts).toEqual([]);
  });

  it('other_request inserts nothing and says so, on the same alert key', async () => {
    const h = deps([row('other_request')]);

    expect(await queueDuplicateSubscriptionRefund(h.d, INPUT)).toBe('other_request');
    expect(h.alerts.map(a => a.opts.dedupeKey)).toEqual([
      duplicateSubscriptionAlertKey('sub_dup', 'other_request'),
    ]);
    expect(instructsManualRefund(h.alerts[0].html)).toBe(false);
  });

  it('retries an unconfirmed write, then alerts and throws so Stripe redelivers', async () => {
    const h = deps([{ data: null, error: { message: 'connection reset' } }]);

    await expect(queueDuplicateSubscriptionRefund(h.d, INPUT)).rejects.toThrow(/Stripe will retry/);
    expect(h.calls).toHaveLength(QUEUE_WRITE_ATTEMPTS);
    expect(h.alerts).toHaveLength(1);
    expect(h.alerts[0].opts).toMatchObject({
      dedupeKey: 'refund-queue-unconfirmed-duplicate_subscription-sub_dup',
      skipEmailOnDuplicate: true,
    });
    expect(instructsManualRefund(h.alerts[0].html)).toBe(false);
    // The request is not confirmed: cancelling now would lose it on the retry.
    expect(h.alerts[0].html).toContain('Do NOT cancel subscription <code>sub_dup</code> yet');
    expect(h.alerts[0].html).not.toContain('in the Stripe dashboard now');
  });

  it('recovers when a retry confirms the write', async () => {
    const h = deps([{ data: null, error: { message: 'timeout' } }, row('queued')]);

    expect(await queueDuplicateSubscriptionRefund(h.d, INPUT)).toBe('queued');
    expect(h.calls).toHaveLength(2);
  });

  it.each([
    ['no session', { sessionId: null }],
    ['no payment intent', { paymentIntentId: null }],
    ['a zero charge', { amountCents: 0 }],
    ['an unknown charge', { amountCents: null }],
  ])('with %s nothing is queued and the alert says so', async (_case, patch) => {
    const h = deps([row('queued')]);

    expect(await queueDuplicateSubscriptionRefund(h.d, { ...INPUT, ...patch })).toBe('not_queued');
    expect(h.calls).toEqual([]);
    expect(h.alerts.map(a => a.title)).toEqual([
      'Duplicate subscription: nothing queued to refund',
    ]);
    expect(h.alerts[0].opts.skipEmailOnDuplicate).toBe(true);
    expect(h.alerts[0].opts.dedupeKey).toBe(duplicateSubscriptionAlertKey('sub_dup', 'not_queued'));
    expect(h.alerts[0].html).toContain('Do NOT cancel subscription <code>sub_dup</code> until');
    expect(instructsManualRefund(h.alerts[0].html)).toBe(false);
  });
});
