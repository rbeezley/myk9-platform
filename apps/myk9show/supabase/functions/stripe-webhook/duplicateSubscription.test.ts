// @vitest-environment node
// MYK9-2497: the webhook backstop for a second subscription. Two live
// subscriptions on one customer queue ONE refund request for the newer one's
// first invoice, keyed on that subscription, with ONE alert and ONE email,
// whichever completion event arrives first. Nothing is cancelled or refunded
// here. The SQL half (the per-duplicate unique key) is
// supabase/tests/myk9_2497_duplicate_subscription_refund_test.sql.
import { describe, expect, it, vi } from 'vitest';
import { runAlertAdmin } from '../_shared/alertAdminCore';
import { duplicateSubscriptionAlertKey } from '../_shared/duplicateSubscriptionRefund';
import { instructsManualRefund } from '../_shared/refundAlertCopy';
import type { RefundQueueDeps } from '../_shared/refundRequests';
import {
  queueDuplicateSubscriptions,
  type CompletedSubscriptionSession,
  type DuplicateLookupStripe,
} from './duplicateSubscription';

interface StoredRequest {
  id: string;
  subscriptionId: string;
  sessionId: string;
  paymentIntentId: string;
  amountCents: number;
  status: string;
}

/**
 * A fake of queue_duplicate_subscription_refund and operator_alerts with the
 * database's keys: one request per duplicate subscription (any status), one
 * live request per payment intent, and one unresolved alert per dedupe key.
 * alertAdmin runs the real persist-then-email contract (runAlertAdmin).
 */
function harness() {
  const requests: StoredRequest[] = [];
  const storedAlerts: { key: string; title: string; html: string }[] = [];
  const emails: string[] = [];
  const rpcCalls: Record<string, unknown>[] = [];
  const deps: RefundQueueDeps = {
    rpc: async (fn, args) => {
      expect(fn).toBe('queue_duplicate_subscription_refund');
      rpcCalls.push(args);
      const reply = (outcome: string, r: StoredRequest | undefined) => ({
        data: [
          {
            outcome,
            refund_request_id: r?.id ?? null,
            request_status: r?.status ?? null,
            amount_cents: r?.amountCents ?? null,
            stripe_payment_intent_id: r?.paymentIntentId ?? null,
            stripe_checkout_session_id: r?.sessionId ?? null,
          },
        ],
        error: null,
      });
      const mine = requests.find(r => r.subscriptionId === args.p_subscription_id);
      if (mine) return reply('already_queued', mine);
      const live = (r: StoredRequest) =>
        !['refunded', 'resolved_without_refund'].includes(r.status);
      if (requests.some(r => live(r) && r.paymentIntentId === args.p_payment_intent_id)) {
        return reply('other_request', undefined);
      }
      const created: StoredRequest = {
        id: `rr-${requests.length + 1}`,
        subscriptionId: String(args.p_subscription_id),
        sessionId: String(args.p_session_id),
        paymentIntentId: String(args.p_payment_intent_id),
        amountCents: Number(args.p_amount_cents),
        status: 'pending',
      };
      requests.push(created);
      return reply('queued', created);
    },
    alertAdmin: async (title, html, opts) => {
      await runAlertAdmin(title, {
        insert: async () => {
          if (storedAlerts.some(a => a.key === opts.dedupeKey)) {
            return { error: { code: '23505', message: 'duplicate key' } };
          }
          storedAlerts.push({ key: opts.dedupeKey, title, html });
          return { error: null };
        },
        sendEmail: async () => {
          emails.push(title);
        },
        skipEmailOnDuplicate: opts.skipEmailOnDuplicate,
      });
    },
  };
  return { deps, requests, storedAlerts, emails, rpcCalls };
}

const KEPT = { id: 'sub_kept', status: 'active', created: 1_000 };
const DUP = { id: 'sub_dup', status: 'active', created: 2_000 };

const KEPT_SESSION: CompletedSubscriptionSession = {
  id: 'cs_kept',
  subscription: 'sub_kept',
  invoice: 'in_kept',
};
const DUP_SESSION: CompletedSubscriptionSession = {
  id: 'cs_dup',
  subscription: 'sub_dup',
  invoice: 'in_dup',
};

function fakeStripe(): DuplicateLookupStripe & {
  sessionsList: ReturnType<typeof vi.fn>;
  invoicesRetrieve: ReturnType<typeof vi.fn>;
} {
  const sessionsList = vi.fn(async ({ subscription }: { subscription: string }) => ({
    data: subscription === 'sub_dup' ? [{ id: 'cs_dup', invoice: 'in_dup' }] : [],
  }));
  const invoicesRetrieve = vi.fn(async (id: string) =>
    id === 'in_dup'
      ? { payment_intent: 'pi_dup', amount_paid: 499 }
      : { payment_intent: 'pi_kept', amount_paid: 499 }
  );
  return {
    checkout: { sessions: { list: sessionsList } },
    invoices: { retrieve: invoicesRetrieve },
    sessionsList,
    invoicesRetrieve,
  };
}

describe('queueDuplicateSubscriptions', () => {
  it('queues exactly one request for a duplicate arrival, for its first invoice', async () => {
    const h = harness();
    const stripe = fakeStripe();

    const outcomes = await queueDuplicateSubscriptions(
      { stripe, queue: h.deps },
      'cus_1',
      DUP_SESSION,
      [DUP, KEPT]
    );

    expect(outcomes).toEqual(['queued']);
    expect(h.rpcCalls).toEqual([
      {
        p_subscription_id: 'sub_dup',
        p_session_id: 'cs_dup',
        p_payment_intent_id: 'pi_dup',
        p_amount_cents: 499,
        p_detail: { kept_subscription_id: 'sub_kept', stripe_customer_id: 'cus_1' },
      },
    ]);
    // The event's own session is the duplicate's: no session lookup.
    expect(stripe.sessionsList).not.toHaveBeenCalled();
    expect(stripe.invoicesRetrieve).toHaveBeenCalledWith('in_dup');
    expect(h.storedAlerts.map(a => a.key)).toEqual([
      duplicateSubscriptionAlertKey('sub_dup', 'awaiting_approval'),
    ]);
    expect(h.emails).toHaveLength(1);
  });

  it('queues nothing and alerts nothing for a first subscription', async () => {
    const h = harness();
    const stripe = fakeStripe();

    const outcomes = await queueDuplicateSubscriptions(
      { stripe, queue: h.deps },
      'cus_1',
      KEPT_SESSION,
      [KEPT, { id: 'sub_old', status: 'canceled', created: 500 }]
    );

    expect(outcomes).toEqual([]);
    expect(h.rpcCalls).toEqual([]);
    expect(h.storedAlerts).toEqual([]);
    expect(h.emails).toEqual([]);
    expect(stripe.sessionsList).not.toHaveBeenCalled();
    expect(stripe.invoicesRetrieve).not.toHaveBeenCalled();
  });

  it.each([
    ['duplicate first', [DUP_SESSION, KEPT_SESSION]],
    ['kept first', [KEPT_SESSION, DUP_SESSION]],
  ])(
    'both completion events (%s) give one request, one stored alert and one email',
    async (_order, sessions) => {
      const h = harness();
      const stripe = fakeStripe();

      for (const session of sessions) {
        await queueDuplicateSubscriptions({ stripe, queue: h.deps }, 'cus_1', session, [KEPT, DUP]);
      }

      expect(h.requests).toHaveLength(1);
      // The row keeps the duplicate's ACTUAL checkout session, whichever event wrote it.
      expect(h.requests[0]).toMatchObject({
        subscriptionId: 'sub_dup',
        sessionId: 'cs_dup',
        paymentIntentId: 'pi_dup',
        amountCents: 499,
      });
      expect(h.storedAlerts).toHaveLength(1);
      expect(h.emails).toHaveLength(1);
    }
  );

  it('a redelivery of the same event adds neither a request nor an email', async () => {
    const h = harness();
    const stripe = fakeStripe();
    const run = () =>
      queueDuplicateSubscriptions({ stripe, queue: h.deps }, 'cus_1', DUP_SESSION, [KEPT, DUP]);

    expect(await run()).toEqual(['queued']);
    expect(await run()).toEqual(['already_queued']);

    expect(h.requests).toHaveLength(1);
    expect(h.storedAlerts).toHaveLength(1);
    expect(h.emails).toHaveLength(1);
  });

  it('the other event delivered after the first refund settled queues nothing', async () => {
    const h = harness();
    const stripe = fakeStripe();
    await queueDuplicateSubscriptions({ stripe, queue: h.deps }, 'cus_1', DUP_SESSION, [KEPT, DUP]);
    h.requests[0].status = 'refunded';
    // The admin resolved the alert after approving the refund.
    h.storedAlerts.length = 0;

    const outcomes = await queueDuplicateSubscriptions(
      { stripe, queue: h.deps },
      'cus_1',
      KEPT_SESSION,
      [KEPT, DUP]
    );

    expect(outcomes).toEqual(['already_queued']);
    expect(h.requests).toHaveLength(1);
    expect(h.storedAlerts).toEqual([]);
    expect(h.emails).toHaveLength(1);
  });

  it('never instructs a refund from the Stripe dashboard', async () => {
    const h = harness();
    await queueDuplicateSubscriptions(
      { stripe: fakeStripe(), queue: h.deps },
      'cus_1',
      DUP_SESSION,
      [KEPT, DUP]
    );

    expect(h.storedAlerts[0].title).toBe('Duplicate subscription: refund awaiting approval');
    expect(h.storedAlerts[0].html).toContain('Cancel subscription <code>sub_dup</code>');
    expect(instructsManualRefund(h.storedAlerts[0].html)).toBe(false);
  });

  it('alerts without queueing when the duplicate has no checkout session', async () => {
    const h = harness();
    const stripe = fakeStripe();
    stripe.sessionsList.mockResolvedValueOnce({ data: [] });

    const outcomes = await queueDuplicateSubscriptions(
      { stripe, queue: h.deps },
      'cus_1',
      KEPT_SESSION,
      [KEPT, DUP]
    );

    expect(outcomes).toEqual(['not_queued']);
    expect(stripe.sessionsList).toHaveBeenCalledWith({ subscription: 'sub_dup', limit: 1 });
    // Nothing is recorded yet, so the alert must not say to cancel first.
    expect(h.storedAlerts[0].html).toContain('Do NOT cancel subscription <code>sub_dup</code>');
    expect(h.storedAlerts[0].html).not.toContain('in the Stripe dashboard now');
    expect(h.rpcCalls).toEqual([]);
    expect(h.storedAlerts.map(a => a.title)).toEqual([
      'Duplicate subscription: nothing queued to refund',
    ]);
    expect(instructsManualRefund(h.storedAlerts[0].html)).toBe(false);
  });

  it('alerts without queueing when the first invoice charged nothing', async () => {
    const h = harness();
    const stripe = fakeStripe();
    stripe.invoicesRetrieve.mockResolvedValueOnce({ payment_intent: null, amount_paid: 0 });

    expect(
      await queueDuplicateSubscriptions({ stripe, queue: h.deps }, 'cus_1', DUP_SESSION, [
        KEPT,
        DUP,
      ])
    ).toEqual(['not_queued']);
    expect(h.rpcCalls).toEqual([]);
    expect(h.emails).toHaveLength(1);
  });

  it('a past_due subscription is still the kept one', async () => {
    const h = harness();
    const outcomes = await queueDuplicateSubscriptions(
      { stripe: fakeStripe(), queue: h.deps },
      'cus_1',
      DUP_SESSION,
      [{ ...KEPT, status: 'past_due' }, DUP]
    );

    expect(outcomes).toEqual(['queued']);
    expect(h.requests[0].subscriptionId).toBe('sub_dup');
  });

  it('a later event that does queue raises its own alert and email, not hidden by the first', async () => {
    const h = harness();
    const stripe = fakeStripe();
    // The kept session's event arrives first and cannot find the duplicate's session.
    stripe.sessionsList.mockResolvedValueOnce({ data: [] });
    await queueDuplicateSubscriptions({ stripe, queue: h.deps }, 'cus_1', KEPT_SESSION, [
      KEPT,
      DUP,
    ]);
    await queueDuplicateSubscriptions({ stripe, queue: h.deps }, 'cus_1', DUP_SESSION, [KEPT, DUP]);
    // A third delivery repeats the queued state: no new alert or email.
    await queueDuplicateSubscriptions({ stripe, queue: h.deps }, 'cus_1', DUP_SESSION, [KEPT, DUP]);

    expect(h.requests).toHaveLength(1);
    expect(h.storedAlerts.map(a => a.title)).toEqual([
      'Duplicate subscription: nothing queued to refund',
      'Duplicate subscription: refund awaiting approval',
    ]);
    expect(h.emails).toHaveLength(2);
  });
});
