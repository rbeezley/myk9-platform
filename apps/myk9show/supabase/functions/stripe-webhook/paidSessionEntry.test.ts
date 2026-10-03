// @vitest-environment node
// Codex rounds 11 and 13 on #2689: a paid session that already has an order
// is a redelivery. It runs NO first-time validation and only ensures the
// alert of a refund request the session already has. The request itself was
// written with the fulfillment latch (queue_payment_link_refund), so there is
// nothing to replay.
import { describe, expect, it } from 'vitest';
import { decidePaidSessionEntry, routePaidSession } from './paidSessionEntry';
import * as entryModule from './paidSessionEntry';
import { ensurePaymentLinkRefundAlert, type RefundQueueDeps } from '../_shared/refundRequests';

function world(orderExists: boolean) {
  const ran: string[] = [];
  const alerts: string[] = [];
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
    alertAdmin: async (_title, _html, opts) => {
      alerts.push(opts.dedupeKey);
    },
  };
  const handlers = {
    orderExists: async () => orderExists,
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
  return { ran, alerts, handlers };
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
