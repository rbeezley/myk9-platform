// @vitest-environment node
// Codex round 11 on #2689: a paid session that already has an order is a
// redelivery, and replays its refund-queue write BEFORE any first-time
// validation. The replay here runs the real queuedRefundFromOrder +
// queueRefundForApproval against stub deps; first-time fulfillment is a stub
// that does what the old code did on a retry after the cart expired or the
// pricing changed: validate, fail, return without queueing.
import { describe, expect, it } from 'vitest';
import { decidePaidSessionEntry, routePaidSession } from './paidSessionEntry';
import { instructsManualRefund } from '../_shared/refundAlertCopy';
import type { QueueDeps } from '../_shared/refundRequests';
import { REFUND_QUEUE_MARKER, replayOwedRefund } from '../_shared/refundOrderReplay';

interface Order {
  stripe_payment_intent_id: string;
  show_id: string | null;
  metadata: unknown;
}

const CART_ORDER: Order = {
  stripe_payment_intent_id: 'pi_1',
  show_id: 'show-1',
  metadata: {
    ...REFUND_QUEUE_MARKER,
    cart_id: 'cart-1',
    overflow_refund: { action: 'refund', amount_cents: 2500, reason: 'partial_no_service_lines' },
  },
};

const LINK_ORDER: Order = {
  stripe_payment_intent_id: 'pi_2',
  show_id: null,
  metadata: {
    ...REFUND_QUEUE_MARKER,
    entry_payment_link_id: 'link-1',
    invalid_entry_refund: {
      action: 'refund',
      amount_cents: 900,
      reason: 'partial_invalid_entries',
    },
    invalid_entry_ids: ['e-1'],
  },
};

function world(order: Order | null, firstQueueResponse: 'created' | 'lost') {
  const ran: string[] = [];
  const alerts: { title: string; text: string; key: string }[] = [];
  const queued = new Map<string, string>();
  let calls = 0;
  const deps: QueueDeps = {
    // request_refund_approval, idempotent per (session, kind).
    rpc: async (_fn, args) => {
      calls += 1;
      const key = `${args.p_session_id}/${args.p_kind}`;
      const created = !queued.has(key);
      if (created) queued.set(key, `rr-${queued.size + 1}`);
      if (firstQueueResponse === 'lost' && calls === 1) {
        return { data: null, error: { message: 'response lost' } };
      }
      return {
        data: [{ refund_request_id: queued.get(key), created, request_status: 'pending' }],
        error: null,
      };
    },
    findRefundRequest: async () => ({ data: null, error: null }),
    alertAdmin: async (title, html, opts) => {
      alerts.push({ title, text: `${title} ${html}`, key: opts.dedupeKey });
    },
  };
  const handlers = {
    loadRecordedOrder: async () => order,
    replay: async (o: Order) => {
      ran.push('replay');
      await replayOwedRefund(
        { ...deps, listIntentRefunds: async () => [] },
        {
          sessionId: 'cs_1',
          paymentIntentId: o.stripe_payment_intent_id,
          showId: o.show_id,
          metadata: o.metadata,
        }
      );
    },
    // First-time validation that a retry would now FAIL (cart expired, or
    // pricing changed): returns early, queues nothing.
    fulfillCart: async () => {
      ran.push('first-time cart validation (fails: cart expired / pricing changed)');
    },
    fulfillPaymentLink: async () => {
      ran.push('first-time payment-link validation (fails: link already paid)');
    },
    subscription: async () => {
      ran.push('subscription');
    },
    unexpectedPayment: () => {
      ran.push('unexpected');
    },
  };
  return { ran, alerts, queued, handlers };
}

describe('decidePaidSessionEntry', () => {
  it.each([
    ['entry', 'payment', true, 'replay_recorded_order'],
    ['entry_payment_request', 'payment', true, 'replay_recorded_order'],
    ['entry', 'payment', false, 'fulfill_cart'],
    ['entry_payment_request', 'payment', false, 'fulfill_payment_link'],
    [undefined, 'subscription', false, 'subscription'],
    [undefined, 'payment', false, 'unexpected_payment'],
    [undefined, 'setup', false, 'ignore'],
  ] as const)('%s / %s / order exists %s → %s', (checkoutType, mode, orderExists, expected) => {
    expect(decidePaidSessionEntry({ checkoutType, mode, orderExists })).toBe(expected);
  });
});

describe('routePaidSession: replay precedes every first-time validation', () => {
  it.each([
    ['after the cart expired', 'created'],
    ['after a pricing change', 'created'],
    ['after a lost queue response', 'lost'],
  ] as const)(
    'cart redelivery %s: replays the owed refund, alerts, never validates, no dashboard wording',
    async (_label, firstResponse) => {
      const w = world(CART_ORDER, firstResponse);
      await expect(
        routePaidSession({ checkoutType: 'entry', mode: 'payment' }, w.handlers)
      ).resolves.toBe('replay_recorded_order');
      expect(w.ran).toEqual(['replay']);
      expect([...w.queued.keys()]).toEqual(['cs_1/cart_overflow']);
      expect(w.alerts.map(a => [a.title, a.key])).toEqual([
        ['Refund awaiting approval', 'refund-request-rr-1'],
      ]);
      expect(w.alerts.some(a => instructsManualRefund(a.text))).toBe(false);
    }
  );

  it('payment-link redelivery replays its refund and skips link validation', async () => {
    const w = world(LINK_ORDER, 'created');
    await routePaidSession({ checkoutType: 'entry_payment_request', mode: 'payment' }, w.handlers);
    expect(w.ran).toEqual(['replay']);
    expect([...w.queued.keys()]).toEqual(['cs_1/entry_payment_link']);
    expect(w.alerts.map(a => a.title)).toEqual(['Refund awaiting approval']);
  });

  it('the first delivery (no order yet) runs first-time fulfillment, not the replay', async () => {
    const w = world(null, 'created');
    await expect(
      routePaidSession({ checkoutType: 'entry', mode: 'payment' }, w.handlers)
    ).resolves.toBe('fulfill_cart');
    expect(w.ran).toEqual(['first-time cart validation (fails: cart expired / pricing changed)']);
  });

  it('an order lookup error throws (5xx, Stripe redelivers) and runs nothing', async () => {
    const w = world(CART_ORDER, 'created');
    const handlers = {
      ...w.handlers,
      loadRecordedOrder: async () => {
        throw new Error('db down');
      },
    };
    await expect(
      routePaidSession({ checkoutType: 'entry', mode: 'payment' }, handlers)
    ).rejects.toThrow('db down');
    expect(w.ran).toEqual([]);
  });

  it('a subscription checkout never reads orders', async () => {
    const w = world(CART_ORDER, 'created');
    let looked = false;
    await routePaidSession(
      { checkoutType: undefined, mode: 'subscription' },
      {
        ...w.handlers,
        loadRecordedOrder: async () => {
          looked = true;
          return CART_ORDER;
        },
      }
    );
    expect(looked).toBe(false);
    expect(w.ran).toEqual(['subscription']);
  });
});
