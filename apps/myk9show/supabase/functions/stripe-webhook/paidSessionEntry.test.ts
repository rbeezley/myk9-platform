// @vitest-environment node
// Codex rounds 11, 13 and 15 on #2689: a paid session that already has a
// refund request or an order is a redelivery. It runs NO first-time validation and only ensures the
// alert of a refund request the session already has. The request itself was
// written with the fulfillment latch (queue_payment_link_refund), so there is
// nothing to replay.
import { describe, expect, it } from 'vitest';
import { decidePaidSessionEntry, routePaidSession } from './paidSessionEntry';
import * as entryModule from './paidSessionEntry';
import {
  ensurePaymentLinkRefundAlert,
  ensureSessionRefundAlerts,
  type RefundQueueDeps,
  type SessionRefundRequest,
} from '../_shared/refundRequests';
import { instructsManualRefund } from '../_shared/refundAlertCopy';

function world(orderExists: boolean, requests: SessionRefundRequest[] = []) {
  const ran: string[] = [];
  const alerts: string[] = [];
  const alertTexts: string[] = [];
  // The session's request, written earlier with the link latch.
  const deps: RefundQueueDeps = {
    rpc: async () => ({
      data: [
        {
          link_status: null,
          link_closed: false,
          refund_request_id: 'rr-1',
          created: false,
          request_status: 'pending',
          amount_cents: 900,
          reason: 'partial_invalid_entries',
          stripe_payment_intent_id: 'pi_1',
        },
      ],
      error: null,
    }),
    alertAdmin: async (title, html, opts) => {
      alerts.push(opts.dedupeKey);
      alertTexts.push(`${title} ${html}`);
    },
  };
  const handlers = {
    findRequests: async () => requests,
    orderExists: async () => orderExists,
    refundRequested: async (found: SessionRefundRequest[]) => {
      ran.push('refund requested');
      await ensureSessionRefundAlerts(deps, 'cs_1', found);
    },
    alreadyFulfilled: async (type: string) => {
      ran.push(`already fulfilled (${type})`);
      if (type === 'entry_payment_request') await ensurePaymentLinkRefundAlert(deps, 'cs_1');
    },
    // First-time validation that a retry would now FAIL (cart expired, pricing
    // changed, link deleted): it must never run for a fulfilled session.
    fulfillCart: async () => {
      ran.push('first-time cart validation');
    },
    fulfillPaymentLink: async () => {
      ran.push('first-time payment-link validation');
    },
    subscription: async () => {
      ran.push('subscription');
    },
    unexpectedPayment: () => {
      ran.push('unexpected');
    },
  };
  return { ran, alerts, alertTexts, handlers };
}

function request(status: string): SessionRefundRequest {
  return {
    id: 'rr-9',
    kind: 'abandoned_cart',
    status,
    amount_cents: 4200,
    reason: 'cart_abandoned',
    stripe_payment_intent_id: 'pi_9',
  };
}

describe('decidePaidSessionEntry', () => {
  it.each([
    ['entry', 'payment', true, 'already_fulfilled'],
    ['entry_payment_request', 'payment', true, 'already_fulfilled'],
    ['entry', 'payment', false, 'fulfill_cart'],
    ['entry_payment_request', 'payment', false, 'fulfill_payment_link'],
    [undefined, 'subscription', false, 'subscription'],
    [undefined, 'payment', false, 'unexpected_payment'],
    [undefined, 'setup', false, 'ignore'],
  ] as const)('%s / %s / order exists %s → %s', (checkoutType, mode, orderExists, expected) => {
    expect(decidePaidSessionEntry({ checkoutType, mode, orderExists })).toBe(expected);
  });

  // Codex round 15: (order?, request status) for a fulfillment checkout.
  it.each([
    [false, [], 'fulfill_cart'],
    [true, [], 'already_fulfilled'],
    [false, ['pending'], 'refund_requested'],
    [false, ['awaiting_stripe'], 'refund_requested'],
    [false, ['failed'], 'refund_requested'],
    [false, ['refunded'], 'refund_requested'],
    [false, ['resolved_without_refund'], 'refund_requested'],
    [true, ['pending'], 'refund_requested'],
    [true, ['refunded'], 'refund_requested'],
  ] as const)('order %s, requests %j → %s', (orderExists, requestStatuses, expected) => {
    expect(
      decidePaidSessionEntry({
        checkoutType: 'entry',
        mode: 'payment',
        orderExists,
        requestStatuses: [...requestStatuses],
      })
    ).toBe(expected);
  });
});

describe('a refund request is read before ANY first-time validation (Codex round 15)', () => {
  it('cart deleted, redelivery, OPEN request: alert ensured, no dashboard wording, no validation', async () => {
    const w = world(false, [request('pending')]);
    await expect(
      routePaidSession({ checkoutType: 'entry', mode: 'payment' }, w.handlers)
    ).resolves.toBe('refund_requested');
    expect(w.ran).toEqual(['refund requested']);
    expect(w.alerts).toEqual(['refund-request-rr-9']);
    expect(w.alertTexts.some(t => instructsManualRefund(t))).toBe(false);
  });

  it.each(['awaiting_stripe', 'failed'])('a %s request is open: alert ensured', async status => {
    const w = world(false, [request(status)]);
    await routePaidSession({ checkoutType: 'entry', mode: 'payment' }, w.handlers);
    expect(w.alerts).toEqual(['refund-request-rr-9']);
    expect(w.ran).toEqual(['refund requested']);
  });

  it.each(['refunded', 'resolved_without_refund'])(
    'cart deleted, redelivery, %s request: silent 2xx, no validation',
    async status => {
      const w = world(false, [request(status)]);
      await expect(
        routePaidSession({ checkoutType: 'entry', mode: 'payment' }, w.handlers)
      ).resolves.toBe('refund_requested');
      expect(w.ran).toEqual(['refund requested']);
      expect(w.alerts).toEqual([]);
    }
  );

  it('a failed request lookup throws (5xx) and runs nothing', async () => {
    const w = world(false);
    await expect(
      routePaidSession(
        { checkoutType: 'entry', mode: 'payment' },
        {
          ...w.handlers,
          findRequests: async () => {
            throw new Error('db down');
          },
        }
      )
    ).rejects.toThrow('db down');
    expect(w.ran).toEqual([]);
  });
});

describe('routePaidSession', () => {
  it.each(['after the cart expired', 'after a pricing change'])(
    'a cart redelivery %s runs no validation and queues nothing',
    async () => {
      const w = world(true);
      await expect(
        routePaidSession({ checkoutType: 'entry', mode: 'payment' }, w.handlers)
      ).resolves.toBe('already_fulfilled');
      expect(w.ran).toEqual(['already fulfilled (entry)']);
      expect(w.alerts).toEqual([]);
    }
  );

  it('a payment-link redelivery runs no link validation and ensures its request alert', async () => {
    const w = world(true);
    await routePaidSession({ checkoutType: 'entry_payment_request', mode: 'payment' }, w.handlers);
    expect(w.ran).toEqual(['already fulfilled (entry_payment_request)']);
    expect(w.alerts).toEqual(['refund-request-rr-1']);
  });

  it('the first delivery (no order yet) runs first-time fulfillment', async () => {
    const w = world(false);
    await expect(
      routePaidSession({ checkoutType: 'entry', mode: 'payment' }, w.handlers)
    ).resolves.toBe('fulfill_cart');
    expect(w.ran).toEqual(['first-time cart validation']);
  });

  it('an order lookup error throws (5xx, Stripe redelivers) and runs nothing', async () => {
    const w = world(true);
    await expect(
      routePaidSession(
        { checkoutType: 'entry', mode: 'payment' },
        {
          ...w.handlers,
          orderExists: async () => {
            throw new Error('db down');
          },
        }
      )
    ).rejects.toThrow('db down');
    expect(w.ran).toEqual([]);
  });

  it('a subscription checkout never reads orders', async () => {
    const w = world(true);
    let looked = false;
    await routePaidSession(
      { checkoutType: undefined, mode: 'subscription' },
      {
        ...w.handlers,
        orderExists: async () => {
          looked = true;
          return true;
        },
      }
    );
    expect(looked).toBe(false);
    expect(w.ran).toEqual(['subscription']);
  });

  it('no replay path remains (Codex round 13): the entry only decides and dispatches', () => {
    expect(Object.keys(entryModule).sort()).toEqual([
      'FULFILLMENT_CHECKOUT_TYPES',
      'decidePaidSessionEntry',
      'needsOrderLookup',
      'routePaidSession',
    ]);
    expect(
      decidePaidSessionEntry({ checkoutType: 'entry', mode: 'payment', orderExists: true })
    ).not.toMatch(/replay/);
  });
});
